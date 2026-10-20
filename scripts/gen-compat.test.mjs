import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCompat } from './gen-compat.mjs';

const result = (suite, extra = {}) => ({
  suite,
  ok: true,
  versions: { mastra: { '@mastra/qdrant': '1.1.4', '@mastra/pg': '1.31.2' }, loams: '0.1.0' },
  server: { qdrantCompat: '1.19.1' },
  run: 'https://github.com/ostrium-labs/loams-mastra/actions/runs/1',
  counts: { total: 10, passed: 8, failed: 2, skipped: 0, expectedFailures: 2 },
  failures: [
    {
      test: 'a',
      expected: true,
      issue: 'https://github.com/ostrium-labs/loams/issues/901',
      error: '',
    },
    {
      test: 'b',
      expected: true,
      issue: 'https://github.com/ostrium-labs/loams/issues/901',
      error: '',
    },
  ],
  ...extra,
});

test('gen_compat_renders_matrix', () => {
  const md = renderCompat([
    result('pg', {
      counts: { total: 5, passed: 5, failed: 0, skipped: 0, expectedFailures: 0 },
      failures: [],
      server: null,
    }),
    result('qdrant'),
  ]);
  const rows = md.split('\n').filter((l) => l.startsWith('| @mastra'));
  assert.equal(rows.length, 2);
  assert.match(
    rows[0],
    /^\| @mastra\/qdrant 1\.1\.4 \| 0\.1\.0 \| qdrant \| 8\/10 \| 2 \(\[#901\]\(https:\/\/github\.com\/ostrium-labs\/loams\/issues\/901\)\) \| OK \| \[run\]/,
  );
  assert.match(rows[1], /^\| @mastra\/pg 1\.31\.2 \| 0\.1\.0 \| pg \| 5\/5 \| 0 \| OK \|/);
});

test('gen_compat_renders_empty_table', () => {
  assert.match(renderCompat([]), /No results yet/);
});
