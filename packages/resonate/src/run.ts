// Vendored from mastra-ai/mastra@13c5517b87210189fd725ca8cb90211d98f56362:workflows/inngest/src/run.ts (Apache-2.0). Changes: start dispatches a Resonate root promise and waits on its first pass instead of sending an Inngest event and polling storage; cancel cancels the durable promise; watch and stream are inherited from core's Run through the Mastra PubSub; resume, time travel and restart are not supported yet.
import { getErrorFromUnknown, MastraError } from '@mastra/core/error';
import type { Mastra } from '@mastra/core/mastra';
import { MASTRA_AUTH_TOKEN_KEY, RequestContext } from '@mastra/core/request-context';
import type { WorkflowResult } from '@mastra/core/workflows';
import { hydrateSerializedStepErrors, Run } from '@mastra/core/workflows';
import type { Resonate, ResonateHandle } from '@resonatehq/sdk/async';
import { decodeError, decodeValue, encodeValue } from './codec';
import type {
  DurablePromiseState,
  InvocationPayload,
  ResolvedEngineConfig,
  ResonateEngineType,
} from './types';
import { firstPassId, rootIdForRun, statusFromPromiseState } from './types';

type RunParams = ConstructorParameters<typeof Run>[0];

/** Serializes a request context for a durable payload, without the framework's bearer token. */
export function serializeRequestContext(
  requestContext?: RequestContext<any>,
): Record<string, unknown> {
  const obj = requestContext ? requestContext.toJSON() : {};
  delete obj[MASTRA_AUTH_TOKEN_KEY];
  return obj;
}

function notSupported(what: string): MastraError {
  return new MastraError({
    id: 'RESONATE_ENGINE_UNSUPPORTED',
    domain: 'MASTRA_WORKFLOW',
    category: 'USER',
    text: `${what} is not supported by @loams/mastra-resonate yet.`,
  } as any);
}

function isNotFound(error: unknown): boolean {
  const e = error as { serverError?: { code?: number }; code?: unknown } | undefined;
  return e?.serverError?.code === 404;
}

export class ResonateRun<
  TEngineType = ResonateEngineType,
  TSteps extends any[] = any[],
  TState = unknown,
  TInput = unknown,
  TOutput = unknown,
  TRequestContext = unknown,
> extends Run<TEngineType, TSteps, TState, TInput, TOutput, TRequestContext> {
  readonly #resonate: Resonate;
  readonly #config: ResolvedEngineConfig;
  readonly #mastra: Mastra | undefined;

  constructor(params: RunParams, resonate: Resonate, config: ResolvedEngineConfig) {
    super(params as any);
    this.#resonate = resonate;
    this.#config = config;
    this.#mastra = params.mastra;
  }

  /** The id of this run's root durable promise on the Resonate server. */
  get rootId(): string {
    return rootIdForRun(this.runId);
  }

  /** The run's status as the Resonate server sees its root durable promise. */
  async durableStatus() {
    const record = await this.#resonate.promises.get(this.rootId);
    return statusFromPromiseState(record.state as DurablePromiseState);
  }

  protected override async _start(
    args: {
      inputData?: TInput;
      initialState?: TState;
      requestContext?: RequestContext<TRequestContext>;
      tracingOptions?: unknown;
      format?: 'legacy' | 'vnext';
      outputOptions?: { includeState?: boolean; includeResumeLabels?: boolean };
      perStep?: boolean;
      actor?: unknown;
    },
    onDispatched?: () => void,
  ): Promise<WorkflowResult<TState, TInput, TOutput, any>> {
    const {
      inputData,
      initialState,
      requestContext,
      tracingOptions,
      format,
      outputOptions,
      perStep,
      actor,
    } = args;

    const inputDataToUse = await this._validateInput(inputData);
    const initialStateToUse = await this._validateInitialState(initialState ?? ({} as TState));
    await this._validateRequestContext(requestContext as RequestContext | undefined);

    // onStart is a pre-flight gate, as in the default engine: it runs once, here,
    // before anything is dispatched, and its error rejects the caller.
    await this.executionEngine.invokeStartCallback({
      runId: this.runId,
      workflowId: this.workflowId,
      resourceId: this.resourceId,
      getInitData: () => inputDataToUse,
      requestContext: (requestContext ?? new RequestContext()) as RequestContext,
      state: initialStateToUse as Record<string, any>,
    });

    const workflowsStore = await this.#mastra?.getStorage()?.getStore('workflows');
    await workflowsStore?.persistWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId,
      resourceId: this.resourceId,
      snapshot: {
        runId: this.runId,
        serializedStepGraph: this.serializedStepGraph,
        status: 'running',
        value: {},
        context: {} as any,
        activePaths: [],
        suspendedPaths: {},
        activeStepsPath: {},
        resumeLabels: {},
        waitingPaths: {},
        timestamp: Date.now(),
      },
    });

    const payload: InvocationPayload = {
      kind: 'start',
      role: 'root',
      workflowId: this.workflowId,
      runId: this.runId,
      resourceId: this.resourceId,
      inputData: inputDataToUse,
      initialState: initialStateToUse,
      requestContext: serializeRequestContext(requestContext as RequestContext | undefined),
      outputOptions,
      tracingOptions,
      format,
      perStep,
      actor,
    };

    const root = await this.#resonate.run(
      this.rootId,
      this.workflowId,
      encodeValue(payload),
      this.#resonate.options({ timeout: this.#config.timeout }),
    );
    this.workflowRunStatus = 'running';
    onDispatched?.();

    const result = (await this.#awaitPass(root, firstPassId(this.rootId))) as WorkflowResult<
      TState,
      TInput,
      TOutput,
      any
    >;
    hydrateFailedResult(result);
    if (!outputOptions?.includeState) {
      delete (result as { state?: unknown }).state;
    }
    this.workflowRunStatus = result.status;
    if (result.status !== 'suspended') {
      this.cleanup?.();
    }
    return result;
  }

  /**
   * Waits for one pass of the run. The pass is the root's child at `passId`;
   * it may not exist yet when this is called, and the root may be canceled or
   * time out before it settles, so both are watched.
   */
  async #awaitPass(root: ResonateHandle<unknown>, passId: string): Promise<unknown> {
    let rootSettled: { error: unknown } | undefined;
    const rootDone = root.result().then(
      () => undefined,
      (error) => {
        rootSettled = { error };
      },
    );

    for (let delay = 10; ; delay = Math.min(delay * 2, 250)) {
      let pass: ResonateHandle<unknown> | undefined;
      try {
        pass = await this.#resonate.get(passId);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      if (pass) {
        try {
          return decodeValue(
            await Promise.race([pass.result(), rootDone.then(() => pass!.result())]),
          );
        } catch (e) {
          throw decodeError(e);
        }
      }
      await Promise.race([rootDone, new Promise((resolve) => setTimeout(resolve, delay))]);
      if (rootSettled) {
        throw getErrorFromUnknown(rootSettled.error, {
          fallbackMessage: `Run ${this.runId} ended before its first pass`,
        });
      }
    }
  }

  /**
   * Cancels the run: its pass (sleeping or running) and then the root. A
   * sleeping pass never wakes, and a running one can settle nothing more once
   * its promise is canceled. The snapshot is marked canceled.
   */
  override async cancel(): Promise<void> {
    for (const id of [firstPassId(this.rootId), this.rootId]) {
      try {
        await this.#resonate.promises.cancel(id);
      } catch (e) {
        // Settled in the meantime, or never dispatched: nothing left to stop there.
        if (!isNotFound(e)) {
          this.#mastra?.getLogger()?.debug?.(`Cancel of ${id} was refused`, e);
        }
      }
    }

    const workflowsStore = await this.#mastra?.getStorage()?.getStore('workflows');
    const snapshot = await workflowsStore?.loadWorkflowSnapshot({
      workflowName: this.workflowId,
      runId: this.runId,
    });
    if (snapshot) {
      await workflowsStore?.persistWorkflowSnapshot({
        workflowName: this.workflowId,
        runId: this.runId,
        resourceId: this.resourceId,
        snapshot: { ...snapshot, status: 'canceled' as any },
      });
    }
    this.workflowRunStatus = 'canceled';
  }

  protected override async _resume(): Promise<never> {
    throw notSupported('Resume');
  }

  protected override async _timeTravel(): Promise<never> {
    throw notSupported('Time travel');
  }

  protected override async _restart(): Promise<never> {
    throw notSupported('Restart');
  }
}

function hydrateFailedResult(result: WorkflowResult<any, any, any, any>): void {
  if (result.status === 'failed') {
    result.error = getErrorFromUnknown(result.error, { serializeStack: false });
    if (result.steps) hydrateSerializedStepErrors(result.steps);
  }
}
