import { Run } from '@mastra/core/workflows';

/**
 * A run of a ResonateWorkflow: a root durable promise named by the run id.
 *
 * TODO(Task 15): start and startAsync through resonate.run(runId, workflowId, input);
 * cancel. TODO(Task 18): resume.
 */
export class ResonateRun<
  TEngineType = unknown,
  TSteps extends any[] = any[],
  TState = unknown,
  TInput = unknown,
  TOutput = unknown,
  TRequestContext = unknown,
> extends Run<TEngineType, TSteps, TState, TInput, TOutput, TRequestContext> {}
