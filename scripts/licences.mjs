#!/usr/bin/env node
// Licence gate (plan MA1 Task 3, design §66 §11.2, D1203).
//
// Fails on a dependency licensed GPL, AGPL, LGPL (unless excepted in
// licences.exceptions.json), BUSL, SSPL or Elastic-2.0, on any licence text naming the
// Mastra Enterprise Edition licence, and on any vendored file under
// test/conformance/upstream whose path has an ee/ segment or lies under packages/connect.
//
//   node scripts/licences.mjs   (runs `pnpm licenses list --json` itself)

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNED = [/^A?GPL-/i, /^LGPL-/i, /^BUSL-/i, /^SSPL-/i, /^Elastic-2\.0$/i, /^AGPL/i, /^GPL/i];
const LGPL = /^LGPL-/i;
const EE_TEXT = /Mastra Enterprise/i;

/**
 * An SPDX expression is acceptable when at least one OR alternative has no banned term.
 * @param {string} expr
 * @param {(id: string) => boolean} banned
 */
export function expressionBanned(expr, banned) {
  const alternatives = expr.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  return alternatives.every((alt) =>
    alt
      .split(/\s+AND\s+/i)
      .map((s) => s.trim().replace(/\s+WITH\s+.*$/i, ''))
      .filter(Boolean)
      .some(banned),
  );
}

/**
 * @param {Record<string, Array<{name: string, versions: string[], paths?: string[], license?: string}>>} listing
 *   the output of `pnpm licenses list --json`
 * @param {{ exceptions?: string[], readLicenceText?: (path: string) => string }} [opts]
 * @returns {string[]} problems
 */
export function checkDependencies(listing, opts = {}) {
  const exceptions = new Set(opts.exceptions ?? []);
  const problems = [];
  for (const [licence, pkgs] of Object.entries(listing)) {
    for (const pkg of pkgs) {
      const banned = (/** @type {string} */ id) =>
        BANNED.some((re) => re.test(id)) && !(LGPL.test(id) && exceptions.has(pkg.name));
      if (expressionBanned(licence, banned)) {
        problems.push(`licences: ${pkg.name}@${pkg.versions.join(',')} is ${licence}`);
        continue;
      }
      if (opts.readLicenceText) {
        for (const p of pkg.paths ?? []) {
          if (EE_TEXT.test(opts.readLicenceText(p))) {
            problems.push(`licences: ${pkg.name} carries the Mastra Enterprise Edition licence`);
            break;
          }
        }
      }
    }
  }
  return problems;
}

/** @param {string} rel a path relative to the vendored root */
export function forbiddenVendoredPath(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.includes('ee')) return 'an ee/ segment';
  const i = parts.indexOf('packages');
  if (i >= 0 && parts[i + 1] === 'connect') return 'packages/connect';
  return null;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** @param {string} upstreamDir @returns {string[]} problems */
export function checkVendored(upstreamDir) {
  const problems = [];
  for (const f of walk(upstreamDir)) {
    const rel = relative(upstreamDir, f).split(sep).join('/');
    const why = forbiddenVendoredPath(rel);
    if (why) problems.push(`licences: vendored ${rel} has ${why}`);
    else if (/\.(?:[cm]?[jt]s|json|md)$/.test(f) && EE_TEXT.test(readFileSync(f, 'utf8'))) {
      problems.push(`licences: vendored ${rel} names the Mastra Enterprise licence`);
    }
  }
  return problems;
}

/** @param {string} pkgPath */
function readLicenceText(pkgPath) {
  if (!existsSync(pkgPath)) return '';
  const f = readdirSync(pkgPath).find((n) => /^(?:licen[cs]e|copying)(?:\.|$)/i.test(n));
  return f ? readFileSync(join(pkgPath, f), 'utf8').slice(0, 20_000) : '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const exceptionsFile = join(root, 'scripts', 'licences.exceptions.json');
  const exceptions = existsSync(exceptionsFile)
    ? JSON.parse(readFileSync(exceptionsFile, 'utf8')).map(
        (/** @type {{name: string}} */ e) => e.name,
      )
    : [];
  const listing = JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    }),
  );
  const problems = [
    ...checkDependencies(listing, { exceptions, readLicenceText }),
    ...checkVendored(join(root, 'test', 'conformance', 'upstream')),
  ];
  for (const p of problems) console.error(p);
  if (problems.length > 0) process.exit(1);
  console.log(`licences: ok (${Object.values(listing).flat().length} packages)`);
}
