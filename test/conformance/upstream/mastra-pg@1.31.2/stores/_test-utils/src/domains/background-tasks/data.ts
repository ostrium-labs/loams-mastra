// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/domains/background-tasks/data.ts (Apache-2.0). Changes: none.
import { randomUUID } from 'node:crypto';
import type { BackgroundTask } from '@mastra/core/background-tasks';

/**
 * Creates a sample background task for tests.
 */
export function createSampleTask(overrides?: Partial<BackgroundTask>): BackgroundTask {
  return {
    id: randomUUID(),
    status: 'pending',
    toolName: 'test-tool',
    toolCallId: `call-${randomUUID()}`,
    args: { query: 'test' },
    agentId: 'agent-1',
    runId: `run-${randomUUID()}`,
    retryCount: 0,
    maxRetries: 0,
    timeoutMs: 300_000,
    createdAt: new Date(),
    ...overrides,
  };
}
