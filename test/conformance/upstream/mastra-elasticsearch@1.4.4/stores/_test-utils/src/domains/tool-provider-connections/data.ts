// Vendored from mastra-ai/mastra@81299c921d6f499d4c62f14c38e4d4d88b4fbfae:stores/_test-utils/src/domains/tool-provider-connections/data.ts (Apache-2.0). Changes: none.
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
