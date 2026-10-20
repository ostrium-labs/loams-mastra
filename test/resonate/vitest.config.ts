import { defineConfig } from 'vitest/config';

// RESONATE_URL names the server; RESONATE_BACKEND (upstream | loams) selects the
// tests that only make sense on one of them. Without RESONATE_URL every test skips.
const backend = process.env.RESONATE_BACKEND ?? 'upstream';
if (backend !== 'upstream' && backend !== 'loams') {
  throw new Error(`RESONATE_BACKEND must be upstream or loams, got ${backend}`);
}

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    // Mastra's suite runs on its own, with the compat reporter: test:suite.
    exclude: ['suites/**', '**/node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ['./global-setup.ts'],
  },
});
