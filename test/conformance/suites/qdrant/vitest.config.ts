// Mastra's own Qdrant suite (vendored at @mastra/qdrant@1.1.4), run against the Loams Qdrant
// gateway. The vendored files are not edited: the Loams URL, API key and namespace reach
// them through an alias of @qdrant/js-client-rest to qdrant-client.ts (MA1 Task 7).
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const store = resolve(here, '../../upstream/mastra-qdrant@1.1.4/stores/qdrant');
const realClient = join(
  realpathSync(join(store, 'node_modules/@qdrant/js-client-rest')),
  'dist/esm/index.js',
);
const suite = process.env.COMPAT_SUITE ?? 'qdrant';

export default defineConfig({
  root: store,
  resolve: {
    alias: [
      { find: /^@qdrant\/js-client-rest$/, replacement: join(here, 'qdrant-client.ts') },
      { find: /^@loams-internal\/real-qdrant-client$/, replacement: realClient },
    ],
  },
  test: {
    name: `conformance:${suite}`,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default', [resolve(here, '../../reporter/compat-reporter.ts'), { suite }]],
  },
});
