// Vendored from mastra-ai/mastra@81299c921d6f499d4c62f14c38e4d4d88b4fbfae:stores/elasticsearch/vitest.config.ts (Apache-2.0). Changes: none.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e:stores/elasticsearch',
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
