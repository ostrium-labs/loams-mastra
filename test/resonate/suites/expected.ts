// Tests of Mastra's workflow test utilities skipped on the Resonate engine because they
// cannot run to a verdict (they hang). Tests that fail are not skipped: they are listed,
// with an issue, in test/conformance/expected-failures/resonate-<backend>.json, and the
// compat reporter fails the job on an unexpected failure or an unexpected pass.
import type { WorkflowTestConfig } from '@loams-internal/upstream-inngest-workflow-test-utils';

export const skip: WorkflowTestConfig['skip'] = {};

export const skipTests: WorkflowTestConfig['skipTests'] = {
  // Hangs for 120 s: the legacy stream does not close after suspend and resume
  // (https://github.com/ostrium-labs/loams-mastra/issues/31). stream() is tested.
  streamingSuspendResumeLegacy: true,
};
