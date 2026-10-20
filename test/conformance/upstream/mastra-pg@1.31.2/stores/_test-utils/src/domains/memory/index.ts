// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/domains/memory/index.ts (Apache-2.0). Changes: none.
import type { MastraStorage, MemoryStorage } from '@mastra/core/storage';
import { createListMessagesTest } from './messages-paginated';
import { createThreadsTest } from './threads';
import { createMessagesUpdateTest } from './messages-update';
import { createMessagesBulkDeleteTest } from './messages-bulk-delete';
import { createResourcesTest } from './resources';
import { createObservationalMemoryTest } from './observational-memory';
import { beforeAll } from 'vitest';
import { createMessagesListTest } from './messages-list';

export function createMemoryTest({ storage }: { storage: MastraStorage }) {
  let memoryStorage: MemoryStorage;

  beforeAll(async () => {
    const store = await storage.getStore('memory');
    if (!store) {
      throw new Error('Memory storage not found');
    }
    memoryStorage = store;

    const start = Date.now();
    console.log('Clearing memory domain data before tests');
    await memoryStorage.dangerouslyClearAll();
    const end = Date.now();
    console.log(`Memory domain cleared in ${end - start}ms`);
  });

  createThreadsTest({ storage });

  createMessagesListTest({ storage });

  createListMessagesTest({ storage });

  createMessagesUpdateTest({ storage });

  createMessagesBulkDeleteTest({ storage });

  createResourcesTest({ storage });

  createObservationalMemoryTest({ storage });
}
