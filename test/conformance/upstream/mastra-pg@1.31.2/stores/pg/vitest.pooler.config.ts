// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/vitest.pooler.config.ts (Apache-2.0). Changes: none.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.pooler.test.ts'],
    testTimeout: 60_000,
  },
});
