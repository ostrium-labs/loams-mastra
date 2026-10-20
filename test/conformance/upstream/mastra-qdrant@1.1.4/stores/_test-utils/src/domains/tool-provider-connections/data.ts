// Vendored from mastra-ai/mastra@8b35a6c1d6148b24aea94a5d0493d7d7f3c7a5d5:stores/_test-utils/src/domains/tool-provider-connections/data.ts (Apache-2.0). Changes: none.
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
