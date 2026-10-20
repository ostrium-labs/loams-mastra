import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests share one Resonate server; run files one at a time.
    fileParallelism: false,
  },
});
