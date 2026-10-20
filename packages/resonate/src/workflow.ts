import type { Step, WorkflowConfig } from '@mastra/core/workflows';
import { Workflow } from '@mastra/core/workflows';
import type { Resonate } from '@resonatehq/sdk/async';
import type { ResonateEngineConfig, ResonateEngineType } from './types';

/**
 * A Mastra workflow registered as one Resonate function under its id.
 *
 * TODO(Task 15): register with the Resonate client when added to Mastra; createRun
 * returns a ResonateRun; the registered function runs the graph on a
 * ResonateExecutionEngine.
 */
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
  readonly resonate: Resonate;
  readonly config: ResonateEngineConfig;

  constructor(
    params: WorkflowConfig<TWorkflowId, TState, TInput, TOutput, TSteps, TRequestContext>,
    resonate: Resonate,
    config: ResonateEngineConfig = {},
  ) {
    super(params);
    this.engineType = 'resonate';
    this.resonate = resonate;
    this.config = config;
  }
}
