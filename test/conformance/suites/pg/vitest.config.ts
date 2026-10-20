// Mastra's own pg suite (vendored at @mastra/pg@1.31.2), run against Loams Postgres. The
// harness (loams/start-postgres.sh) exports POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER,
// POSTGRES_PASSWORD, POSTGRES_DB and DB_URL, which the vendored tests read as they are.
// Same includes and excludes as the vendored vitest.config.ts; the pooler tests run in their
// own cell (suites/pg/vitest.pooler.config.ts).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const suite = process.env.COMPAT_SUITE ?? 'pg';

export default defineConfig({
  // The nightly latest/alpha cells vendor other tags and point COMPAT_PG_DIR at them.
  root: process.env.COMPAT_PG_DIR ?? resolve(here, '../../upstream/mastra-pg@1.31.2/stores/pg'),
  test: {
    name: `conformance:${suite}`,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      'src/**/*.performance.test.ts',
      'src/**/performance-indexes/*.test.ts',
      'src/**/*.pooler.test.ts',
    ],
    fileParallelism: false,
    // A few @mastra/pg tests give a one-connection pool a short connect timeout; on Loams
    // Postgres they time out intermittently (ostrium-labs/loams#904). Retry, so a flake
    // doesn't fail the gate while a deterministic failure still does.
    retry: 2,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default', [resolve(here, '../../reporter/compat-reporter.ts'), { suite }]],
  },
});
