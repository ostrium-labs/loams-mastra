// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/vitest.config.ts (Apache-2.0). Changes: none.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e:stores/pg',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.performance.test.ts', 'src/**/performance-indexes/*.test.ts', 'src/**/*.pooler.test.ts'],
    // Run files sequentially to avoid exhausting connections on the shared
    // dockerized Postgres test database during package-level runs.
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
