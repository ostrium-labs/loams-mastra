// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/domains/tool-provider-connections/data.ts (Apache-2.0). Changes: none.
import { randomUUID } from 'node:crypto';
import type { StorageUpsertToolProviderConnectionInput } from '@mastra/core/storage';

/**
 * Creates a sample tool provider connection for tests.
 */
export function createSampleConnection(
  overrides?: Partial<StorageUpsertToolProviderConnectionInput>,
): StorageUpsertToolProviderConnectionInput {
  return {
    authorId: `author_${randomUUID()}`,
    providerId: 'composio',
    toolkit: 'gmail',
    connectionId: `conn_${randomUUID()}`,
    label: 'Work Gmail',
    scope: 'per-author',
    ...overrides,
  };
}
