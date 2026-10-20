// Vendored from mastra-ai/mastra@13c5517b87210189fd725ca8cb90211d98f56362:workflows/inngest/src/workflow.ts (Apache-2.0). Changes: an Inngest function per workflow replaced by a Resonate function registered under the workflow id; the invocation runs its pass as a durable child of the run's root promise; flow control, cron, durable-agent and pubsub-factory hooks removed; events go to the Mastra instance's PubSub.
import { RequestContext } from '@mastra/core/di';
import { getErrorFromUnknown } from '@mastra/core/error';
import type { Mastra } from '@mastra/core/mastra';
import { EntityType, SpanType } from '@mastra/core/observability';
import type { WorkflowRuns } from '@mastra/core/storage';
import type {
  Run,
  Step,
  StepFlowEntry,
  StepResult,
  WorkflowConfig,
  WorkflowResult,
  WorkflowRunState,
  WorkflowStreamEvent,
} from '@mastra/core/workflows';
import { getEntryWorkflow, isSingleStepEntry, Workflow } from '@mastra/core/workflows';
import type { Context, Resonate } from '@resonatehq/sdk/async';
import { decodeValue, encodeValue } from './codec';
import { currentContext, durable, ResonateExecutionEngine, withContext } from './execution-engine';
import { ResonateRun } from './run';
import type {
  InvocationPayload,
  ResolvedEngineConfig,
  ResonateEngineType,
  ResonateWorkflowConfig,
} from './types';

/** Workflows registered on each Resonate client, by workflow id. */
const registered = new WeakMap<
  Resonate,
  Map<string, ResonateWorkflow<any, any, any, any, any, any, any, any>>
>();

function getNestedResonateWorkflow(entry: StepFlowEntry): ResonateWorkflow | null {
  let nested: unknown = null;
  if (entry.type === 'loop' || entry.type === 'foreach') {
    nested = getEntryWorkflow(entry.step as any);
  } else if (isSingleStepEntry(entry)) {
    nested = getEntryWorkflow(entry);
  }
  return nested instanceof ResonateWorkflow ? nested : null;
}

export class ResonateWorkflow<
  TEngineType = ResonateEngineType,
  TSteps extends Step<string, any, any, any, any, any, TEngineType, any>[] = Step<
    string,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    TEngineType,
    unknown
  >[],
  TWorkflowId extends string = string,
  TState = unknown,
  TInput = unknown,
  TOutput = unknown,
  TPrevSchema = TInput,
  TRequestContext extends Record<string, any> | unknown = unknown,
> extends Workflow<
  TEngineType,
  TSteps,
  TWorkflowId,
  TState,
  TInput,
  TOutput,
  TPrevSchema,
  TRequestContext
> {
  #mastra: Mastra | undefined;
  readonly resonate: Resonate;
  readonly #config: ResolvedEngineConfig;

  constructor(
    params: ResonateWorkflowConfig<
      TWorkflowId,
      TState,
      TInput,
      TOutput,
      TSteps & Step<string, any, any, any, any, any, ResonateEngineType, any>[],
      TRequestContext
    >,
    resonate: Resonate,
    config: ResolvedEngineConfig,
  ) {
    super(params as WorkflowConfig<TWorkflowId, TState, TInput, TOutput, TSteps, TRequestContext>);
    this.engineType = 'resonate';
    this.#mastra = params.mastra;
    this.resonate = resonate;
    this.#config = config;
  }

  get config(): ResolvedEngineConfig {
    return this.#config;
  }

  __registerMastra(mastra: Mastra) {
    super.__registerMastra(mastra);
    this.#mastra = mastra;
    this.executionEngine.__registerMastra(mastra);
    this.register();
    this.#forEachNested((nested) => nested.__registerMastra(mastra));
  }

  /**
   * Registers this workflow as a Resonate function named by its id, so that this
   * process can run it and recover its runs after a crash. Called when the
   * workflow is added to a Mastra instance.
   */
  register(): void {
    let byId = registered.get(this.resonate);
    if (!byId) {
      byId = new Map();
      registered.set(this.resonate, byId);
    }
    const isNew = !byId.has(this.id);
    byId.set(this.id, this);
    if (!isNew) return;

    const workflowId = this.id;
    const byIdRef = byId;
    this.resonate.register(
      workflowId,
      async function mastraWorkflow(ctx: Context, payload: unknown) {
        const workflow = byIdRef.get(workflowId);
        if (!workflow)
          throw new Error(`@loams/mastra-resonate: workflow "${workflowId}" is not registered`);
        return workflow.runRoot(ctx, decodeValue<InvocationPayload>(payload));
      },
    );
  }

  #forEachNested(fn: (nested: ResonateWorkflow) => void) {
    const visit = (entry: StepFlowEntry) => {
      const nested = getNestedResonateWorkflow(entry);
      if (nested) {
        fn(nested);
      } else if (entry.type === 'parallel' || entry.type === 'conditional') {
        for (const sub of entry.steps) visit(sub);
      }
    };
    for (const entry of this.executionGraph.steps ?? []) visit(entry);
  }

  async listWorkflowRuns(args?: {
    fromDate?: Date;
    toDate?: Date;
    perPage?: number | false;
    page?: number;
    resourceId?: string;
  }) {
    const workflowsStore = await this.#mastra?.getStorage()?.getStore('workflows');
    if (!workflowsStore) return { runs: [], total: 0 };
    return workflowsStore.listWorkflowRuns({
      workflowName: this.id,
      ...(args ?? {}),
    }) as unknown as WorkflowRuns;
  }

  async createRun(options?: {
    runId?: string;
    resourceId?: string;
    disableScorers?: boolean;
  }): Promise<Run<TEngineType, TSteps, TState, TInput, TOutput, TRequestContext>> {
    const runId = options?.runId || globalThis.crypto.randomUUID();
    const existing = this.runs.get(runId);
    const run = (existing ??
      new ResonateRun<TEngineType, TSteps, TState, TInput, TOutput, TRequestContext>(
        {
          workflowId: this.id,
          runId,
          resourceId: options?.resourceId,
          executionEngine: this.executionEngine,
          executionGraph: this.executionGraph,
          serializedStepGraph: this.serializedStepGraph,
          mastra: this.#mastra,
          retryConfig: this.retryConfig,
          cleanup: () => this.runs.delete(runId),
          workflowSteps: this.steps,
          workflowEngineType: this.engineType,
          validateInputs: this.options.validateInputs,
          pubsub: this.#mastra?.pubsub,
        },
        this.resonate,
        this.#config,
      )) as Run<TEngineType, TSteps, TState, TInput, TOutput, TRequestContext>;
    this.runs.set(runId, run);

    const shouldPersistSnapshot = this.options.shouldPersistSnapshot({
      workflowStatus: run.workflowRunStatus,
      stepResults: {},
    });
    const stored = await this.getWorkflowRunById(runId, { withNestedWorkflows: false });
    if (!(stored && !stored.isFromInMemory) && shouldPersistSnapshot) {
      const workflowsStore = await this.#mastra?.getStorage()?.getStore('workflows');
      await workflowsStore?.persistWorkflowSnapshot({
        workflowName: this.id,
        runId,
        resourceId: options?.resourceId,
        snapshot: {
          runId,
          status: 'pending',
          value: {},
          context: {},
          activePaths: [],
          activeStepsPath: {},
          waitingPaths: {},
          serializedStepGraph: this.serializedStepGraph,
          suspendedPaths: {},
          resumeLabels: {},
          result: undefined,
          error: undefined,
          timestamp: Date.now(),
        },
      });
    }
    return run;
  }

  /**
   * The body of the Resonate function. A `root` call dispatches the pass as a
   * durable remote call (`<root>:0`, a global promise a caller can wait on, and
   * its own task, recoverable on any worker of the group) and waits for it. A
   * `pass` call executes the graph.
   */
  async runRoot(ctx: Context, payload: InvocationPayload): Promise<unknown> {
    if (payload.role === 'pass') {
      return encodeValue(await this.runInvocation(ctx, payload));
    }
    return ctx.rpc(
      this.id,
      encodeValue({ ...payload, role: 'pass' }),
      ctx.options({
        target: this.#config.group,
        timeout: this.#config.timeout,
        tags: {
          'mastra:op': `pass:${payload.kind}`,
          'mastra:workflowId': this.id,
          'mastra:runId': payload.runId,
        },
      }),
    );
  }

  /**
   * Executes one pass of this workflow under `ctx`: the Mastra graph on a
   * Resonate-backed engine, then a memoised finalize step (lifecycle callbacks,
   * the workflow span, the final snapshot and the finish event).
   */
  async runInvocation(
    ctx: Context,
    payload: InvocationPayload,
  ): Promise<WorkflowResult<any, any, any, any> | Record<string, unknown>> {
    return withContext(ctx, () => this.#runInvocation(payload));
  }

  async #runInvocation(payload: InvocationPayload) {
    const mastra = this.#mastra;
    const { runId, resourceId, inputData, outputOptions, perStep, format } = payload;
    const initialState = payload.initialState as any;
    const requestContext = new RequestContext<any>(
      Object.entries(payload.requestContext ?? {}) as [string, any][],
    );
    const pubsub = mastra?.pubsub;
    if (!pubsub) {
      throw new Error(
        `@loams/mastra-resonate: workflow "${this.id}" must be registered with a Mastra instance`,
      );
    }
    const tracingPolicy = this.options.tracingPolicy;
    const timeout = this.#config.timeout;

    // The run's root span is created once and rebuilt on every replay.
    const workflowSpanData = mastra?.observability?.getSelectedInstance({ requestContext })
      ? await durable(`workflow.${this.id}.span.start`, timeout, async () => {
          const observability = mastra?.observability?.getSelectedInstance({ requestContext });
          const span = observability?.startSpan({
            type: SpanType.WORKFLOW_RUN,
            name: `workflow run: '${this.id}'`,
            entityType: EntityType.WORKFLOW_RUN,
            entityId: this.id,
            entityName: this.id,
            input: inputData,
            metadata: { resourceId, runId },
            tracingPolicy,
            tracingOptions: payload.tracingOptions as any,
            requestContext,
          });
          return span?.exportSpan();
        })
      : undefined;

    const engine = new ResonateExecutionEngine(
      mastra!,
      currentContext().originId,
      this.options,
      this.#config,
    );

    let result: WorkflowResult<any, any, any, any>;
    try {
      result = await engine.execute<any, any, WorkflowResult<any, any, any, any>>({
        workflowId: this.id,
        runId,
        resourceId,
        graph: this.executionGraph,
        serializedStepGraph: this.serializedStepGraph,
        input: inputData,
        initialState,
        pubsub,
        retryConfig: this.retryConfig,
        requestContext,
        actor: payload.actor as any,
        perStep,
        format,
        abortController: new AbortController(),
        workflowSpan: undefined,
        tracingIds: workflowSpanData
          ? { traceId: workflowSpanData.traceId, workflowSpanId: workflowSpanData.id }
          : undefined,
        outputOptions,
        outputWriter: async (chunk: WorkflowStreamEvent) => {
          try {
            await pubsub.publish(`workflow.events.v2.${runId}`, {
              type: 'watch',
              runId,
              data: chunk,
            });
          } catch (err) {
            this.logger.debug?.('Failed to publish watch event:', err);
          }
        },
      });
    } catch (executionError) {
      result = {
        status: 'failed',
        steps: {},
        state: initialState ?? {},
        error: executionError instanceof Error ? executionError : new Error(String(executionError)),
      } as WorkflowResult<any, any, any, any>;
    }

    await durable(`workflow.${this.id}.finalize`, timeout, async () => {
      if (result.status !== 'paused') {
        await engine.invokeLifecycleCallbacksInternal({
          status: result.status,
          result: 'result' in result ? result.result : undefined,
          error: 'error' in result ? result.error : undefined,
          steps: result.steps,
          tripwire: 'tripwire' in result ? result.tripwire : undefined,
          runId,
          workflowId: this.id,
          resourceId,
          input: inputData,
          requestContext,
          state: result.state ?? initialState ?? {},
        });
      }

      if (workflowSpanData) {
        const observability = mastra?.observability?.getSelectedInstance({ requestContext });
        if (observability) {
          const workflowSpan = observability.rebuildSpan(workflowSpanData);
          if (result.status === 'failed') {
            workflowSpan.error({
              error: getErrorFromUnknown(result.error, {
                fallbackMessage: 'Workflow execution failed',
              }),
              attributes: { status: 'failed' },
            });
          } else {
            workflowSpan.end({
              output: result.status === 'success' ? result.result : undefined,
              attributes: { status: result.status },
            });
          }
        }
      }

      // Persist the final snapshot before publishing workflow-finish, so a reader
      // woken by the event sees the final state.
      if (
        this.options.shouldPersistSnapshot({
          workflowStatus: result.status,
          stepResults: result.steps,
        })
      ) {
        const workflowsStore = await mastra?.getStorage()?.getStore('workflows');
        if (workflowsStore) {
          let existing:
            | { suspendedPaths?: Record<string, number[]>; resumeLabels?: Record<string, any> }
            | undefined;
          if (result.status === 'suspended') {
            existing =
              (await workflowsStore.loadWorkflowSnapshot({ workflowName: this.id, runId })) ??
              undefined;
          }
          const finalSnapshot: WorkflowRunState = {
            runId,
            status: result.status,
            value: result.state ?? initialState ?? {},
            context: result.steps as unknown as WorkflowRunState['context'],
            activePaths: [],
            activeStepsPath: {},
            serializedStepGraph: this.serializedStepGraph,
            suspendedPaths: existing?.suspendedPaths ?? {},
            waitingPaths: {},
            resumeLabels: existing?.resumeLabels ?? (result as any).resumeLabels ?? {},
            result:
              result.status === 'success'
                ? (result.result as WorkflowRunState['result'])
                : undefined,
            error: result.status === 'failed' ? (result.error as any) : undefined,
            requestContext: requestContext.toJSON(),
            tracingContext: workflowSpanData
              ? { traceId: workflowSpanData.traceId, spanId: workflowSpanData.id }
              : undefined,
            timestamp: Date.now(),
          };
          await workflowsStore.persistWorkflowSnapshot({
            workflowName: this.id,
            runId,
            resourceId,
            snapshot: this.options.pruneSnapshot
              ? this.options.pruneSnapshot({
                  snapshot: finalSnapshot,
                  workflowStatus: result.status,
                })
              : finalSnapshot,
          });
        }
      }

      try {
        await pubsub.publish(`workflow.events.v2.${runId}`, {
          type: 'watch',
          runId,
          data: {
            type: 'workflow-finish',
            payload: {
              status: result.status,
              result: result.status === 'success' ? result.result : undefined,
              error: result.status === 'failed' ? result.error : undefined,
            },
          },
        });
      } catch (publishError) {
        this.logger.debug?.('Failed to publish workflow-finish event:', publishError);
      }
    });

    const observability = mastra?.observability?.getSelectedInstance({ requestContext });
    if (observability) {
      try {
        await observability.flush();
      } catch (flushError) {
        this.logger.debug?.('Failed to flush observability:', flushError);
      }
    }

    return payload.nested?.compact ? compact(result) : result;
  }
}

/** What a parent workflow needs from a nested run's result (as `@mastra/inngest` returns it). */
function compact(result: WorkflowResult<any, any, any, any>): Record<string, unknown> {
  switch (result.status) {
    case 'success':
      return { status: result.status, result: result.result, state: result.state };
    case 'failed':
      return { status: result.status, error: result.error, state: result.state };
    case 'tripwire':
      return { status: result.status, tripwire: (result as any).tripwire, state: result.state };
    case 'suspended':
      return {
        status: result.status,
        steps: result.steps as Record<string, StepResult<any, any, any, any>>,
        state: result.state,
        resumeLabels: (result as any).resumeLabels,
      };
    default:
      return { status: result.status, state: result.state };
  }

  /**
   * Refuses to create runs until the Resonate engine is wired (Task 15): the
   * inherited implementation would run on Mastra's default engine, without
   * Resonate's durability.
   */
  override async createRun(): Promise<never> {
    throw new Error('@loams/mastra-resonate: not implemented yet (TODO(Task 15))');
  }
}
