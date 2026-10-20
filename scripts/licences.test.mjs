import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkDependencies, checkVendored, expressionBanned } from './licences.mjs';

const pkg = (name) => ({ name, versions: ['1.0.0'], paths: [`/x/${name}`] });

test('licences_refuses_elastic', () => {
  const problems = checkDependencies({ 'Elastic-2.0': [pkg('es-thing')], MIT: [pkg('ok')] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /es-thing/);
});

test('licences_refuses_gpl_family_and_allows_dual', () => {
  assert.equal(
    checkDependencies({ 'AGPL-3.0-only': [pkg('a')], 'SSPL-1.0': [pkg('s')] }).length,
    2,
  );
  assert.equal(checkDependencies({ 'MIT OR GPL-3.0': [pkg('dual')] }).length, 0);
  assert.ok(expressionBanned('MIT AND GPL-2.0', (id) => id.startsWith('GPL')));
});

test('licences_lgpl_needs_an_exception', () => {
  const listing = { 'LGPL-3.0-or-later': [pkg('sharp-libvips')] };
  assert.equal(checkDependencies(listing).length, 1);
  assert.equal(checkDependencies(listing, { exceptions: ['sharp-libvips'] }).length, 0);
});

test('licences_refuses_mastra_ee_text', () => {
  const problems = checkDependencies(
    { 'SEE LICENSE IN LICENSE': [pkg('@mastra/editor')] },
    { readLicenceText: () => 'MASTRA ENTERPRISE EDITION LICENSE Version 2.0' },
  );
  assert.equal(problems.length, 1);
});

test('licences_refuses_ee_path', () => {
  const root = mkdtempSync(join(tmpdir(), 'licences-'));
  for (const p of [
    'mastra-pg@1.31.2/stores/pg/src/index.ts',
    'x@1/packages/core/src/auth/ee/license.ts',
    'y@1/packages/connect/src/providers/a.ts',
  ]) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), '// Vendored from mastra-ai/mastra (Apache-2.0).\n');
  }
  const problems = checkVendored(root);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => p.includes('ee/')));
});
