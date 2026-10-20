// Vendored from mastra-ai/mastra@8b35a6c1d6148b24aea94a5d0493d7d7f3c7a5d5:stores/qdrant/vitest.config.ts (Apache-2.0). Changes: none.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e:stores/qdrant',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
