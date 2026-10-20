import { defineConfig } from 'vitest/config';

// Used only by compat-reporter.test.ts, which runs it in a child process with
// COMPAT_EXPECTED_DIR and COMPAT_RESULTS_DIR pointing at temporary directories.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['*.fixture.ts'],
    reporters: [['../compat-reporter.ts', { suite: 'sample' }]],
  },
});
