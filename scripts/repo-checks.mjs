#!/usr/bin/env node
// Repository checks (plan MA1 Task 3):
//   no_public_endpoints          examples, templates and docs name only loopback, tailnet
//                                (*.ts.net) or documentation hosts;
//   examples_pin_exact_versions  @mastra/*, @loams/*, @qdrant/* and @resonatehq/* are exact
//                                versions in examples/*/package.json and templates/*/package.json;
//   no_secret_in_artifacts       no lk_ API key in a directory of logs or reports;
//   no_stale_expected_failures   no expected-failure entry fixed in a Loams release at or
//                                before the pinned one (its `fixedAfter` is older than
//                                pins.json loams.version), and `fixedBy` names a Loams PR.
//
//   node scripts/repo-checks.mjs [root]                 all but the third, on the repository
//   node scripts/repo-checks.mjs --artifacts <dir>...   the third, on uploaded artifacts

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.mastra', 'upstream']);
const TEXT = /\.(?:[cm]?[jt]sx?|md|mdx|json|ya?ml|toml|txt|env(?:\.example)?|example|sh|html)$/;

/** Hosts a doc may link to. Everything else must be loopback or a tailnet name. */
export const DOC_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'docs.github.com',
  'img.shields.io',
  'mastra.ai',
  'loams.dev',
  'ostriumlabs.org',
  'discord.gg',
  'npmjs.com',
  'www.npmjs.com',
  'registry.npmjs.org',
  'nodejs.org',
  'pnpm.io',
  'tailscale.com',
  'headscale.net',
  'resonatehq.io',
  'developercertificate.org',
  'example.com',
  'example.org',
  'schemas',
];

/** @param {string} host */
export function isAllowedHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(h)) {
    return true;
  }
  if (h.endsWith('.ts.net') || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (h.endsWith('.example.com') || h.endsWith('.example.org') || h.endsWith('.example'))
    return true;
  return DOC_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

const URL_RE = /\bhttps?:\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.<>{}$-]+)(?::\d+)?/g;

/**
 * @param {string} text
 * @returns {string[]} the disallowed hosts named in text
 */
export function publicHosts(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = /** @type {string} */ (m[1]);
    // Template placeholders such as http://<host>:6333 or ${HOST}
    if (/[<>{}$]/.test(host) || host === '') continue;
    if (!isAllowedHost(host)) out.push(host);
  }
  return out;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** @param {string} root @returns {string[]} problems */
export function noPublicEndpoints(root) {
  const problems = [];
  for (const d of ['examples', 'templates', 'docs']) {
    for (const f of walk(join(root, d))) {
      if (!TEXT.test(f)) continue;
      for (const h of publicHosts(readFileSync(f, 'utf8'))) {
        problems.push(`no_public_endpoints: ${relative(root, f)} names ${h}`);
      }
    }
  }
  return problems;
}

const PINNED = /^(?:@mastra\/|@loams\/|@qdrant\/|@resonatehq\/)|^mastra$/;
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** @param {Record<string, any>} pkg @returns {string[]} */
export function unpinned(pkg) {
  const out = [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (PINNED.test(name) && !EXACT.test(String(spec))) out.push(`${field}.${name} is "${spec}"`);
    }
  }
  return out;
}

/** @param {string} root @returns {string[]} problems */
export function examplesPinExactVersions(root) {
  const problems = [];
  for (const d of ['examples', 'templates']) {
    const base = join(root, d);
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base)) {
      const f = join(base, e, 'package.json');
      if (!existsSync(f)) continue;
      for (const u of unpinned(JSON.parse(readFileSync(f, 'utf8')))) {
        problems.push(`examples_pin_exact_versions: ${relative(root, f)}: ${u}`);
      }
    }
  }
  return problems;
}

export const LK_KEY = /lk_[0-9A-HJKMNP-TV-Z]{26}_/;

/** @param {string} text */
export function containsSecret(text) {
  return LK_KEY.test(text);
}

/** @param {string} dir @returns {string[]} problems */
export function noSecretInArtifacts(dir) {
  const problems = [];
  for (const f of walk(dir)) {
    if (containsSecret(readFileSync(f, 'latin1'))) {
      problems.push(`no_secret_in_artifacts: ${f} contains an lk_ key`);
    }
  }
  return problems;
}

/** -1, 0 or 1 for two `x.y.z` versions; null otherwise. */
function compareVersions(a, b) {
  const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v))?.slice(1).map(Number);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const LOAMS_PR = /^https:\/\/github\.com\/ostrium-labs\/loams(?:-postgres)?\/pull\/\d+$/;

/** @param {string} root @returns {string[]} problems */
export function noStaleExpectedFailures(root) {
  const dir = join(root, 'test', 'conformance', 'expected-failures');
  const pinsFile = join(root, 'test', 'conformance', 'pins.json');
  if (!existsSync(dir) || !existsSync(pinsFile)) return [];
  const pinned = JSON.parse(readFileSync(pinsFile, 'utf8')).loams?.version;
  const problems = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    for (const e of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
      if (e.fixedAfter === undefined) continue;
      const where = `no_stale_expected_failures: ${f}: ${e.test}`;
      const order = compareVersions(e.fixedAfter, pinned);
      if (order === null) problems.push(`${where}: fixedAfter "${e.fixedAfter}" is not a version`);
      else if (order < 0)
        problems.push(
          `${where}: fixed after ${e.fixedAfter}, and Loams ${pinned} is pinned; remove it`,
        );
      if (!LOAMS_PR.test(e.fixedBy ?? ''))
        problems.push(`${where}: fixedBy must name the Loams PR`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let problems;
  if (args[0] === '--artifacts') {
    problems = args.slice(1).flatMap((d) => noSecretInArtifacts(d));
  } else {
    const root = args[0] ?? fileURLToPath(new URL('..', import.meta.url));
    problems = [
      ...noPublicEndpoints(root),
      ...examplesPinExactVersions(root),
      ...noStaleExpectedFailures(root),
    ];
  }
  for (const p of problems) console.error(p);
  if (problems.length > 0) process.exit(1);
  console.log('repo-checks: ok');
}
