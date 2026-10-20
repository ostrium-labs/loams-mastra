// Mastra's own Elasticsearch suite (vendored at @mastra/elasticsearch@1.4.4), observed
// against the Loams Elasticsearch gateway (Q1009: not a required cell). The vendored tests
// read ELASTICSEARCH_URL (the harness exports LOAMS_ES_URL; the workflow maps it).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const suite = process.env.COMPAT_SUITE ?? 'elasticsearch';

export default defineConfig({
  root: resolve(here, '../../upstream/mastra-elasticsearch@1.4.4/stores/elasticsearch'),
  test: {
    name: `conformance:${suite}`,
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default', [resolve(here, '../../reporter/compat-reporter.ts'), { suite }]],
  },
});
