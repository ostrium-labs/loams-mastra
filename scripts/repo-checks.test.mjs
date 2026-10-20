import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  containsSecret,
  examplesPinExactVersions,
  noPublicEndpoints,
  noSecretInArtifacts,
  noStaleExpectedFailures,
  publicHosts,
} from './repo-checks.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'repo-checks-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

test('no_public_endpoints_flags_public_url', () => {
  assert.deepEqual(publicHosts('url: "https://loams.acme.io:6333"'), ['loams.acme.io']);
  const root = fixture({ 'examples/a/src/index.ts': "const u = 'http://203.0.113.7:6333';" });
  assert.equal(noPublicEndpoints(root).length, 1);
});

test('no_public_endpoints_allows_loopback_and_tailnet', () => {
  const text = [
    'http://127.0.0.1:6333',
    'http://localhost:8080',
    'http://[::1]:6333',
    'https://loams.tail1234.ts.net',
    'https://github.com/ostrium-labs/loams',
    'https://mastra.ai/docs',
    'http://<host>:6333',
    'https://loams.<tailnet>.ts.net',
  ].join('\n');
  assert.deepEqual(publicHosts(text), []);
  const root = fixture({ 'docs/quickstart.md': text });
  assert.deepEqual(noPublicEndpoints(root), []);
});

test('examples_pin_exact_versions_flags_caret', () => {
  const root = fixture({
    'examples/q/package.json': JSON.stringify({
      dependencies: { '@mastra/core': '^1.78.0', '@mastra/pg': '1.31.2', zod: '^4.0.0' },
      devDependencies: { '@qdrant/js-client-rest': '~1.19.0', mastra: '1.34.2' },
    }),
    'templates/t/package.json': JSON.stringify({ dependencies: { '@resonatehq/sdk': 'latest' } }),
  });
  const problems = examplesPinExactVersions(root);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes('@mastra/core')));
});

test('no_secret_in_artifacts_flags_lk_key', () => {
  const key = `lk_01M5BRDJB0QKR94CP7C5QY256W_${'a'.repeat(32)}`;
  assert.ok(containsSecret(`api-key: ${key}`));
  assert.ok(!containsSecret('lk_ keys are minted per run'));
  const root = fixture({
    'results/qdrant.log': `header api-key=${key}\n`,
    'results/ok.json': '{}',
  });
  assert.equal(noSecretInArtifacts(root).length, 1);
});

test('no_stale_expected_failures', () => {
  const entries = (fixedAfter, fixedBy = 'https://github.com/ostrium-labs/loams/pull/929') =>
    JSON.stringify([
      {
        test: 'A > open',
        reason: 'r',
        issue: 'https://github.com/ostrium-labs/loams/issues/1',
        since: '2026-10-20',
      },
      {
        test: 'A > fixed',
        reason: 'r',
        issue: 'https://github.com/ostrium-labs/loams/issues/2',
        since: '2026-10-20',
        fixedAfter,
        fixedBy,
      },
    ]);
  const root = (version, list) =>
    fixture({
      'test/conformance/pins.json': JSON.stringify({ loams: { version } }),
      'test/conformance/expected-failures/qdrant.json': list,
    });
  assert.deepEqual(noStaleExpectedFailures(root('0.1.0', entries('0.1.0'))), []);
  const stale = noStaleExpectedFailures(root('0.1.1', entries('0.1.0')));
  assert.equal(stale.length, 1);
  assert.match(stale[0], /A > fixed: fixed after 0\.1\.0, and Loams 0\.1\.1 is pinned/);
  assert.equal(noStaleExpectedFailures(root('0.1.0', entries('soon'))).length, 1);
  assert.equal(noStaleExpectedFailures(root('0.1.0', entries('0.1.0', 'TODO'))).length, 1);
});
