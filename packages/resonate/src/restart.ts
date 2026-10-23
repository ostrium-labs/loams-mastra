// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:packages/core/src/workflows/workflow.ts (Apache-2.0). Changes: the snapshot checks of Run._restart and the nested-run check of Workflow.execute extracted into functions, so the client and the durable pass restart a run the same way; errors unchanged.
import { getErrorFromUnknown } from '@mastra/core/error';
import type {
  ExecutionGraph,
  RestartExecutionParams,
  WorkflowResult,
  WorkflowRunState,
} from '@mastra/core/workflows';
import {
  cleanStepResult,
  createRestartExecutionParams,
  hydrateSerializedStepErrors,
} from '@mastra/core/workflows';

/**
 * What `run.restart()` does with a run's snapshot, as core's `Run._restart`
 * decides. A successful, failed or tripwire run is returned as it finished,
 * without executing anything (mastra-ai/mastra#20225). An active run (running
 * or waiting, or a nested run still pending with its input) restarts with the
 * returned parameters: its active steps run again and its finished ones are
 * kept. Any other run is refused with core's error, "This workflow run was not
 * active".
 */
export function planRestart(
  snapshot: WorkflowRunState,
  graph: ExecutionGraph,
  runId: string,
): { result: WorkflowResult<any, any, any, any> } | { restart: RestartExecutionParams } {
  if (
    snapshot.status === 'success' ||
    snapshot.status === 'failed' ||
    snapshot.status === 'tripwire'
  ) {
    // As fmtReturnValue: steps keep `input`, which is also the result's own field;
    // internal bookkeeping (__state, metadata.nestedRunId) is stripped.
    const hydratedSteps = hydrateSerializedStepErrors({ ...(snapshot.context ?? {}) }) ?? {};
    const steps = Object.fromEntries(
      Object.entries(hydratedSteps).map(([stepId, stepResult]) => [
        stepId,
        cleanStepResult(stepResult),
      ]),
    );
    const base = {
      steps,
      input: snapshot.context?.input,
      runId,
      ...(snapshot.value && Object.keys(snapshot.value).length > 0
        ? { state: snapshot.value }
        : {}),
      ...(snapshot.stepExecutionPath ? { stepExecutionPath: snapshot.stepExecutionPath } : {}),
      ...(snapshot.resumeLabels ? { resumeLabels: snapshot.resumeLabels } : {}),
    };
    const result =
      snapshot.status === 'success'
        ? { ...base, status: 'success', result: snapshot.result }
        : snapshot.status === 'failed'
          ? {
              ...base,
              status: 'failed',
              error: getErrorFromUnknown(snapshot.error, { serializeStack: false }),
            }
          : { ...base, status: 'tripwire', tripwire: snapshot.tripwire };
    return { result: result as unknown as WorkflowResult<any, any, any, any> };
  }
  return { restart: createRestartExecutionParams({ snapshot, graph }) };
}

/**
 * A `running` or `waiting` snapshot with no active step and a suspended one: a
 * resume claimed the run, and the process stopped before the resumed step
 * started. Core's `Workflow.execute` resumes such a nested run, rather than
 * restarting it, when its parent restarts (mastra-ai/mastra#25187).
 */
export function isUnstartedResumeClaim(snapshot: WorkflowRunState): boolean {
  return (
    (snapshot.status === 'running' || snapshot.status === 'waiting') &&
    Object.keys(snapshot.activeStepsPath ?? {}).length === 0 &&
    Object.keys(snapshot.suspendedPaths ?? {}).length > 0
  );
}
