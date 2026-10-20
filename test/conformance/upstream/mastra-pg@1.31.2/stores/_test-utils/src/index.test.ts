// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/index.test.ts (Apache-2.0). Changes: none.
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
