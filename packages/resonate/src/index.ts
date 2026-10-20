import type { Step, WorkflowConfig } from '@mastra/core/workflows';
import { createStep as coreCreateStep } from '@mastra/core/workflows';
import type { Resonate } from '@resonatehq/sdk/async';
import type { ResonateEngineConfig, ResonateEngineType } from './types';
import { ResonateWorkflow } from './workflow';

export { CodecError, decodeValue, encodeValue } from './codec';
export { ResonateExecutionEngine } from './execution-engine';
export { ResonateRun } from './run';
export type { ResonateEngineConfig, ResonateEngineType } from './types';
export { ResonateWorkflow } from './workflow';

/** Creates a step; a ResonateWorkflow passed here keeps its identity (a nested workflow). */
export const createStep: typeof coreCreateStep = ((params: any, options?: any) =>
  params instanceof ResonateWorkflow
    ? params
    : coreCreateStep(params, options)) as typeof coreCreateStep;

/** Binds Mastra workflows to a Resonate client. */
export function init(resonate: Resonate, config?: ResonateEngineConfig) {
  return {
    createStep,
    createWorkflow<
      TWorkflowId extends string = string,
      TState = any,
      TInput = any,
      TOutput = any,
      TSteps extends Step<string, any, any, any, any, any, ResonateEngineType>[] = Step<
        string,
        any,
        any,
        any,
        any,
        any,
        ResonateEngineType
      >[],
    >(params: WorkflowConfig<TWorkflowId, TState, TInput, TOutput, TSteps>) {
      // TODO(Task 15): register the workflow as a Resonate function.
      return new ResonateWorkflow<ResonateEngineType, TSteps, TWorkflowId, TState, TInput, TOutput>(
        params,
        resonate,
        config,
      );
    },
  };
}
