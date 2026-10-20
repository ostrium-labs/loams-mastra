// Mastra's workflow test utilities on the Resonate engine, judged by the compat reporter
// against test/conformance/expected-failures/resonate-<backend>.json (plan MA1 Task 16).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const backend = process.env.RESONATE_BACKEND ?? 'upstream';
const suite = `resonate-${backend}`;

export default defineConfig({
  root: resolve(here, '..'),
  test: {
    name: `conformance:${suite}`,
    include: ['suites/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ['./global-setup.ts'],
    reporters: [
      'default',
      [resolve(here, '../../conformance/reporter/compat-reporter.ts'), { suite }],
    ],
  },
});
