#!/usr/bin/env node
// Fails when a workspace package.json depends on an @mastra/* package by a
// range instead of an exact version. Mastra packages are pinned exactly
// because of the 2026-06 @mastra/* npm compromise: a range would let a new,
// unreviewed release into the lockfile on the next install.
//
// peerDependencies are exempt: a library declares the range it supports, and
// the app that installs it pins the version.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PINNED_SCOPES = ['@mastra/', 'mastra'];
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'vendor', 'coverage']);

/** @param {string} name */
export function isPinnedScope(name) {
  return PINNED_SCOPES.some((s) => (s.endsWith('/') ? name.startsWith(s) : name === s));
}

/**
 * @param {Record<string, unknown>} pkg a parsed package.json
 * @returns {string[]} one message per offending dependency
 */
export function findUnpinned(pkg) {
  /** @type {string[]} */
  const out = [];
  for (const field of FIELDS) {
    const deps = /** @type {Record<string, string> | undefined} */ (pkg[field]);
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (isPinnedScope(name) && !EXACT.test(spec)) {
        out.push(`${field}.${name} is "${spec}"; pin an exact version`);
      }
    }
  }
  return out;
}

/** @param {string} dir @returns {string[]} */
function packageJsons(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) found.push(...packageJsons(p));
    else if (entry === 'package.json') found.push(p);
  }
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? process.cwd();
  let failed = 0;
  for (const file of packageJsons(root)) {
    for (const msg of findUnpinned(JSON.parse(readFileSync(file, 'utf8')))) {
      console.error(`${relative(root, file)}: ${msg}`);
      failed++;
    }
  }
  if (failed > 0) {
    console.error(
      `\n${failed} @mastra/* dependenc${failed === 1 ? 'y is' : 'ies are'} not pinned.`,
    );
    process.exit(1);
  }
  console.log('All @mastra/* dependencies are pinned to exact versions.');
}
