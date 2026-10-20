import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyPatches,
  DEFAULT_PATHS,
  EXCLUDES,
  globToRegExp,
  PATCHES,
  RefusalError,
  vendor,
} from './vendor-upstream.mjs';

const COMMIT = 'c0ffee0000000000000000000000000000000000';
const TAG_OBJ = 'ta90000000000000000000000000000000000000';

/** A fake GitHub: the API (refs, tags, commits, trees) and raw.githubusercontent.com. */
function fakeFetch(files) {
  const workspace =
    'packages:\n  - stores/*\n\ncatalog:\n  vitest: 4.1.11\n  typescript: ^7.0.2\n  zod: ^4.6.4\n';
  const all = { 'pnpm-workspace.yaml': workspace, ...files };
  return async (url) => {
    const ok = (body, json = true) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (json ? JSON.stringify(body) : body),
    });
    const u = String(url);
    if (u.includes('/git/ref/tags/')) return ok({ object: { sha: TAG_OBJ, type: 'tag' } });
    if (u.includes(`/git/tags/${TAG_OBJ}`)) return ok({ object: { sha: COMMIT, type: 'commit' } });
    if (u.includes(`/git/commits/${COMMIT}`))
      return ok({ committer: { date: '2026-10-15T00:00:00Z' } });
    if (u.includes(`/git/trees/${COMMIT}`)) {
      return ok({
        truncated: false,
        tree: Object.keys(all).map((path) => ({ path, type: 'blob' })),
      });
    }
    const raw = `https://raw.githubusercontent.com/mastra-ai/mastra/${COMMIT}/`;
    if (u.startsWith(raw)) {
      const p = u.slice(raw.length);
      if (p in all) return ok(all[p], false);
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

const PINS = {
  mastra: { '@mastra/core': '1.78.0', '@mastra/memory': '1.38.0' },
  thirdParty: { zod: '4.6.7' },
};

const QDRANT = {
  'stores/qdrant/package.json': JSON.stringify({
    name: '@mastra/qdrant',
    version: '1.1.4',
    scripts: { pretest: 'docker compose up -d', test: 'vitest run', lint: 'eslint .' },
    dependencies: { '@qdrant/js-client-rest': '^1.18.0' },
    devDependencies: {
      '@internal/lint': 'workspace:*',
      '@internal/storage-test-utils': 'workspace:*',
      '@mastra/core': 'workspace:*',
      eslint: '^10.7.0',
      typescript: 'catalog:',
      vitest: 'catalog:',
    },
    peerDependencies: { '@mastra/core': '>=1.0.0-0 <2.0.0-0' },
  }),
  'stores/qdrant/src/vector/index.ts':
    "import { MastraVector } from '@mastra/core/vector';\nexport class QdrantVector {}\n",
  'stores/qdrant/src/vector/index.test.ts':
    "import { createVectorTestSuite } from '@internal/storage-test-utils';\nimport { z } from 'zod/v4';\nimport { QdrantVector } from './index';\n",
  'stores/qdrant/src/vector/vector.perf.test.ts': '// perf\n',
  'stores/_test-utils/package.json': JSON.stringify({
    name: '@internal/storage-test-utils',
    version: '0.0.140',
    private: true,
    main: 'src/index.ts',
    devDependencies: { '@mastra/core': 'workspace:*', vitest: 'catalog:' },
    peerDependencies: { '@mastra/core': '*', vitest: 'catalog:' },
  }),
  'stores/_test-utils/src/messages.ts':
    "import { TokenCounter } from '../../../packages/memory/src/processors/observational-memory/token-counter';\nexport const t = TokenCounter;\n",
  'stores/_test-utils/src/index.ts': "export * from './messages';\n",
};

const tmp = () => join(mkdtempSync(join(tmpdir(), 'vendor-')), 'out');

test('vendor_refuses_ee_paths', async () => {
  const files = { ...QDRANT, 'packages/core/src/auth/ee/license.ts': '// ee\n' };
  await assert.rejects(
    vendor({
      pkg: '@mastra/qdrant',
      tag: '@mastra/qdrant@1.1.4',
      out: tmp(),
      pins: PINS,
      fetch: fakeFetch(files),
      paths: ['packages/core/src/**'],
    }),
    (e) => e instanceof RefusalError && /ee\//.test(e.message),
  );
});

test('vendor_refuses_connect_providers', async () => {
  const files = { ...QDRANT, 'packages/connect/src/providers/github.ts': '// provider\n' };
  await assert.rejects(
    vendor({
      pkg: '@mastra/qdrant',
      tag: '@mastra/qdrant@1.1.4',
      out: tmp(),
      pins: PINS,
      fetch: fakeFetch(files),
      paths: ['packages/connect/**'],
    }),
    (e) => e instanceof RefusalError && /packages\/connect/.test(e.message),
  );
});

test('vendor_refuses_non_apache_header', async () => {
  const files = {
    ...QDRANT,
    'stores/qdrant/src/vector/elastic.ts':
      '/*\n * Licensed under the Elastic License 2.0.\n */\nexport const x = 1;\n',
  };
  await assert.rejects(
    vendor({
      pkg: '@mastra/qdrant',
      tag: '@mastra/qdrant@1.1.4',
      out: tmp(),
      pins: PINS,
      fetch: fakeFetch(files),
    }),
    (e) => e instanceof RefusalError && /Elastic/.test(e.message),
  );
});

test('vendor_writes_provenance_header', async () => {
  const out = tmp();
  await vendor({
    pkg: '@mastra/qdrant',
    tag: '@mastra/qdrant@1.1.4',
    out,
    pins: PINS,
    fetch: fakeFetch(QDRANT),
  });
  const first = (p) => readFileSync(join(out, p), 'utf8').split('\n')[0];
  assert.equal(
    first('stores/qdrant/src/vector/index.ts'),
    `// Vendored from mastra-ai/mastra@${COMMIT}:stores/qdrant/src/vector/index.ts (Apache-2.0). Changes: none.`,
  );
  assert.equal(
    first('stores/_test-utils/src/messages.ts'),
    `// Vendored from mastra-ai/mastra@${COMMIT}:stores/_test-utils/src/messages.ts (Apache-2.0). Changes: imports rewritten.`,
  );
  assert.match(
    readFileSync(join(out, 'stores/_test-utils/src/messages.ts'), 'utf8'),
    /from '@mastra\/memory\/processors'/,
  );
  assert.throws(
    () => readFileSync(join(out, 'stores/qdrant/src/vector/vector.perf.test.ts')),
    /ENOENT/,
  );
});

test('vendor_rewrites_workspace_versions', async () => {
  const out = tmp();
  await vendor({
    pkg: '@mastra/qdrant',
    tag: '@mastra/qdrant@1.1.4',
    out,
    pins: PINS,
    fetch: fakeFetch(QDRANT),
  });
  const store = JSON.parse(readFileSync(join(out, 'stores/qdrant/package.json'), 'utf8'));
  assert.equal(store.name, '@loams-internal/upstream-qdrant');
  assert.equal(store.private, true);
  assert.deepEqual(store.scripts, { test: 'vitest run' });
  assert.equal(store.devDependencies['@mastra/core'], '1.78.0');
  assert.equal(store.devDependencies.vitest, '4.1.11');
  assert.equal(
    store.devDependencies['@internal/storage-test-utils'],
    'workspace:@loams-internal/upstream-qdrant-test-utils@*',
  );
  assert.equal(store.devDependencies.zod, '4.6.7');
  assert.equal(store.devDependencies['@internal/lint'], undefined);
  assert.equal(store.devDependencies.eslint, undefined);
  assert.equal(store.devDependencies.typescript, undefined);
  const utils = JSON.parse(readFileSync(join(out, 'stores/_test-utils/package.json'), 'utf8'));
  assert.equal(utils.name, '@loams-internal/upstream-qdrant-test-utils');
  assert.equal(utils.peerDependencies.vitest, '4.1.11');
  assert.equal(utils.devDependencies['@mastra/memory'], '1.38.0');
  const upstream = JSON.parse(readFileSync(join(out, 'UPSTREAM.json'), 'utf8'));
  assert.equal(upstream.commit, COMMIT);
  assert.deepEqual(upstream.unresolved, []);
});

test('vendor_is_reproducible', async () => {
  const a = tmp();
  const b = tmp();
  await vendor({
    pkg: '@mastra/qdrant',
    tag: '@mastra/qdrant@1.1.4',
    out: a,
    pins: PINS,
    fetch: fakeFetch(QDRANT),
  });
  await vendor({
    pkg: '@mastra/qdrant',
    tag: '@mastra/qdrant@1.1.4',
    out: b,
    pins: PINS,
    fetch: fakeFetch(QDRANT),
  });
  const ua = readFileSync(join(a, 'UPSTREAM.json'), 'utf8');
  const ub = readFileSync(join(b, 'UPSTREAM.json'), 'utf8');
  assert.equal(ua, ub);
  assert.deepEqual(
    JSON.parse(ua).files.map((f) => f.sha256),
    JSON.parse(ub).files.map((f) => f.sha256),
  );
});

test('vendor_never_takes_the_fga_domain', () => {
  // fga.ts imports @mastra/core/auth/ee (Mastra Enterprise Edition License).
  const fga = 'workflows/_test-utils/src/domains/fga.ts';
  assert.ok(EXCLUDES.some((g) => globToRegExp(g).test(fga)));
  // Its two references are removed by recorded patches, so nothing imports it.
  assert.equal(PATCHES['workflows/_test-utils/src/domains/index.ts']?.length, 1);
  assert.equal(PATCHES['workflows/_test-utils/src/factory.ts']?.length, 2);
  // Only package.json and src/ of the test utilities: their tsconfig extends Mastra's root.
  assert.ok(!DEFAULT_PATHS['@mastra/inngest'].includes('workflows/_test-utils/**'));
});

test('vendor_patches_apply_or_fail_loudly', () => {
  const path = 'workflows/_test-utils/src/domains/index.ts';
  const text = "export { a } from './a';\nexport { createFGATests } from './fga';\n";
  const { text: out, changes } = applyPatches(path, text);
  assert.equal(out, "export { a } from './a';\n");
  assert.deepEqual(changes, ['patched: fga.ts is not vendored (it imports @mastra/core/auth/ee)']);
  assert.throws(() => applyPatches(path, "export { a } from './a';\n"), /no longer applies/);
  assert.deepEqual(applyPatches('other.ts', 'x').changes, []);
});
