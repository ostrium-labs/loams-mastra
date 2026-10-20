// Vendored from mastra-ai/mastra@8b35a6c1d6148b24aea94a5d0493d7d7f3c7a5d5:stores/_test-utils/src/index.test.ts (Apache-2.0). Changes: none.
import { MockStore } from '@mastra/core/storage';
import type { ObservabilityStorage } from '@mastra/core/storage';
import { createTestSuite } from './factory';
import { createMastraStorageCompositionTests } from './composite-tests';
import { createObservabilityVNextTests } from './domains/observability-vnext';

// Test InMemoryStore (MockStore)
createTestSuite(new MockStore(), { scopedTraceDeletion: true });

// Test MastraStorage composition with InMemoryStore backing
createMastraStorageCompositionTests();

// Test the shared observability vNext suite against the in-memory adapter.
// Each test gets a fresh store so delta cursors / feature-flag state don't
// leak between tests.
createObservabilityVNextTests({
  capabilities: {
    label: 'InMemoryStore',
    preferredStrategy: 'batch-with-updates',
  },
  getStorage: async () => {
    const store = new MockStore();
    return (await store.getStore('observability')) as ObservabilityStorage;
  },
});
