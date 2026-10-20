import { DefaultExecutionEngine } from '@mastra/core/workflows';

/**
 * A Mastra execution engine on Resonate durable promises (design: README.md).
 *
 * TODO(Task 15): override wrapDurableOperation (ctx.run), executeStepWithRetry
 * (one ctx.run per attempt, Mastra's retryConfig decides), executeSleepDuration
 * and executeSleepUntilDate (ctx.sleep), requiresDurableContextSerialization
 * (true), and the per-branch step executions.
 */
export class ResonateExecutionEngine extends DefaultExecutionEngine {}
