#!/usr/bin/env node
// Vendors Mastra's adapter test suites at a release tag (plan MA1 Task 4, design §66 §5.4).
//
//   node scripts/vendor-upstream.mjs --package <npm name> --tag <git tag> [--out <dir>] [--paths <comma list>]
//
// It reads the git tree of mastra-ai/mastra at the tag through the GitHub API (GH_TOKEN is
// used when set) and fetches each selected file from raw.githubusercontent.com. It never
// clones. It refuses (exit 2) any path with an `ee` segment, anything under packages/connect,
// and any file whose leading comment names a licence other than Apache-2.0.
//
// Each vendored .ts/.tsx/.js/.mjs/.cjs file gets a first-line provenance header. package.json
// files are rewritten so the copy installs inside this workspace: exact versions for
// `workspace:*` and `catalog:` specifiers, `@loams-internal/upstream-*` names, `private`, the
// `@internal/*` packages aliased to their vendored copies, Mastra's lint and build tooling
// dropped, and `test` as the only script. UPSTREAM.json records the tag, commit, files and
// their SHA-256, and every change.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'mastra-ai/mastra';
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** Default path sets per package (plan MA1 Task 4). */
export const DEFAULT_PATHS = {
  '@mastra/pg': [
    'stores/pg/package.json',
    'stores/pg/vitest.config.ts',
    'stores/pg/vitest.pooler.config.ts',
    'stores/pg/src/**',
    'stores/_test-utils/package.json',
    'stores/_test-utils/src/**',
    // @mastra/pg imports @internal/core (private, unpublished) from its source.
    'packages/_internal-core/package.json',
    'packages/_internal-core/src/**',
  ],
  '@mastra/qdrant': [
    'stores/qdrant/package.json',
    'stores/qdrant/vitest.config.ts',
    'stores/qdrant/src/**',
    'stores/_test-utils/**',
  ],
  '@mastra/elasticsearch': [
    'stores/elasticsearch/package.json',
    'stores/elasticsearch/vitest.config.ts',
    'stores/elasticsearch/src/**',
    'stores/_test-utils/**',
  ],
  '@mastra/inngest': ['workflows/_test-utils/**'],
};

/** Never vendored: performance, stress and benchmark files. */
export const EXCLUDES = [
  '**/*.perf.test.ts',
  '**/*.stress.test.ts',
  '**/performance-test.ts',
  '**/*benchmark*',
  '**/row-number-performance.test.ts',
  // Imports performance-test.ts, which is excluded above.
  '**/performance-indexes.integration.test.ts',
  '**/node_modules/**',
];

/** Private Mastra workspace packages, resolved to their vendored copies when present. */
const INTERNAL_DIRS = {
  '@internal/storage-test-utils': 'stores/_test-utils',
  '@internal/workflow-test-utils': 'workflows/_test-utils',
  '@internal/core': 'packages/_internal-core',
};

/** Mastra's lint, build and coverage tooling: not needed to run the suites. */
const DROPPED_DEPS = new Set([
  '@internal/lint',
  '@internal/types-builder',
  'eslint',
  'oxlint',
  'tsdown',
  'tsx',
  'typescript',
  '@vitest/coverage-v8',
  '@vitest/ui',
]);

/** Relative imports that leave the vendored tree, and the published module that replaces them. */
const IMPORT_REWRITES = {
  'packages/memory/src/processors/observational-memory/token-counter': '@mastra/memory/processors',
};

const CODE = /\.(?:[cm]?[jt]sx?)$/;

export class RefusalError extends Error {}

/** @param {string} glob */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** @param {string} path @param {string[]} globs */
const matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path));

/** @param {string} path @returns {string | null} why the path may not be vendored */
export function forbiddenPath(path) {
  const parts = path.split('/');
  if (parts.includes('ee')) return 'an ee/ segment (Mastra Enterprise Edition License)';
  const i = parts.indexOf('packages');
  if (i >= 0 && parts[i + 1] === 'connect') return 'packages/connect (Elastic-2.0 provider code)';
  return null;
}

/**
 * The licence named in a file's leading comment, when it isn't Apache-2.0.
 * @param {string} text
 * @returns {string | null}
 */
export function nonApacheHeader(text) {
  const lines = text.split('\n');
  const head = [];
  let i = lines[0]?.startsWith('#!') ? 1 : 0;
  let inBlock = false;
  for (; i < lines.length && head.length < 60; i++) {
    const l = (lines[i] ?? '').trim();
    if (inBlock) {
      head.push(l);
      if (l.includes('*/')) inBlock = false;
    } else if (l.startsWith('//')) head.push(l);
    else if (l.startsWith('/*')) {
      head.push(l);
      inBlock = !l.includes('*/');
    } else if (l === '') {
      if (head.length > 0) break;
    } else break;
  }
  const comment = head.join('\n');
  const spdx = comment.match(/SPDX-License-Identifier:\s*([^\s*]+)/i);
  if (spdx && !/^Apache-2\.0$/i.test(spdx[1] ?? '')) return spdx[1] ?? null;
  if (/licen[cs]e/i.test(comment) && !/Apache(?:[- ]2\.0| License)/i.test(comment)) {
    const m = comment.match(
      /(Elastic[- ]License[^\n]*|Enterprise Edition[^\n]*|[A-Z]*GPL[^\n]*|BUSL[^\n]*|SSPL[^\n]*|licen[cs]e[^\n]*)/i,
    );
    return (m?.[1] ?? 'a non-Apache licence').trim();
  }
  return null;
}

/** @param {string} text */
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * `@mastra/pg` → `mastra-pg`; the directory under test/conformance/upstream is `<slug>@<version>`.
 * @param {string} pkg
 */
export const packageSlug = (pkg) => pkg.replace(/^@/, '').replace(/\//g, '-');

/** @param {string} pkg e.g. `@mastra/pg` → `pg` */
const shortName = (pkg) => pkg.split('/').pop() ?? pkg;

/** @param {string} dir e.g. `stores/_test-utils` */
function dirSlug(dir) {
  if (dir === 'workflows/_test-utils') return 'workflow-test-utils';
  return (dir.split('/').pop() ?? dir).replace(/^_/, '');
}

/**
 * A minimal reader for the `catalog:` map of Mastra's pnpm-workspace.yaml.
 * @param {string} yaml
 * @returns {Record<string, string>}
 */
export function parseCatalog(yaml) {
  const out = {};
  let inCatalog = false;
  for (const line of yaml.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog) {
      const m = line.match(/^ {2}(['"]?)([^'":]+)\1:\s*(['"]?)([^'"#]+)\3/);
      if (m) out[(m[2] ?? '').trim()] = (m[4] ?? '').trim();
      else if (/^\S/.test(line)) inCatalog = false;
    }
  }
  return out;
}

/** `^4.6.4` → `4.6.4`; anything that isn't a plain caret/tilde range is returned as is. */
const exact = (spec) => spec.replace(/^[\^~]/, '');

/**
 * @param {string} spec
 * @returns {string[]} the bare module specifiers imported by a source file
 */
export function bareImports(spec) {
  const out = new Set();
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
  for (const m of spec.matchAll(re)) out.add(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return [...out].filter(Boolean);
}

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
const packageOf = (s) =>
  s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : (s.split('/')[0] ?? s);

/**
 * Rewrites relative imports that leave the vendored file set.
 * @param {string} path the file's upstream path
 * @param {string} text
 * @param {Set<string>} files every vendored upstream path
 * @returns {{ text: string, rewritten: string[], unresolved: string[] }}
 */
export function rewriteImports(path, text, files) {
  const rewritten = [];
  const unresolved = [];
  const out = text.replace(
    /(from\s*|import\(\s*|require\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (all, pre, q, spec) => {
      const target = posix.normalize(posix.join(posix.dirname(path), spec));
      const base = target.replace(/\.[cm]?js$/, '');
      const candidates = [
        target,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}/index.ts`,
        `${base}/index.js`,
      ];
      if (candidates.some((c) => files.has(c))) return all;
      const replacement = IMPORT_REWRITES[base];
      if (replacement) {
        rewritten.push(`${spec} -> ${replacement}`);
        return `${pre}${q}${replacement}${q}`;
      }
      unresolved.push(spec);
      return all;
    },
  );
  return { text: out, rewritten, unresolved };
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {'json' | 'text'} kind
 */
async function get(fetchImpl, url, kind) {
  const headers = { 'User-Agent': 'loams-mastra-vendor' };
  if (url.startsWith(API)) {
    headers.Accept = 'application/vnd.github+json';
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return kind === 'json' ? res.json() : res.text();
}

/**
 * Peels a (possibly annotated) tag to its commit.
 * @param {typeof fetch} fetchImpl
 * @param {string} tag
 */
export async function resolveTag(fetchImpl, tag) {
  const ref = await get(
    fetchImpl,
    `${API}/repos/${REPO}/git/ref/tags/${encodeURIComponent(tag)}`,
    'json',
  );
  let { sha, type } = ref.object;
  while (type === 'tag') {
    const t = await get(fetchImpl, `${API}/repos/${REPO}/git/tags/${sha}`, 'json');
    ({ sha, type } = t.object);
  }
  const commit = await get(fetchImpl, `${API}/repos/${REPO}/git/commits/${sha}`, 'json');
  return { commit: sha, date: commit.committer?.date ?? null };
}

/**
 * Rewrites one vendored package.json for this workspace.
 * @returns {{ json: Record<string, any>, changes: string[] }}
 */
function rewritePackageJson(raw, ctx) {
  const pkg = JSON.parse(raw);
  const changes = [];
  const original = pkg.name;
  pkg.name = ctx.names[ctx.dir];
  changes.push(`name ${original} -> ${pkg.name}`);
  if (pkg.private !== true) {
    pkg.private = true;
    changes.push('private');
  }
  const testScript = pkg.scripts?.test ? 'vitest run' : undefined;
  if (pkg.scripts) {
    pkg.scripts = testScript ? { test: testScript } : {};
    changes.push(testScript ? 'scripts reduced to test: vitest run' : 'scripts removed');
  }
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      const internal = INTERNAL_DIRS[name];
      if (internal) {
        if (field !== 'peerDependencies' && ctx.names[internal]) {
          deps[name] = `workspace:${ctx.names[internal]}@*`;
          changes.push(`${field}.${name} -> ${deps[name]}`);
        } else {
          delete deps[name];
          changes.push(`${field}.${name} removed`);
        }
      } else if (DROPPED_DEPS.has(name) && field !== 'dependencies') {
        delete deps[name];
        changes.push(`${field}.${name} removed (Mastra tooling)`);
      } else if (spec === 'catalog:') {
        const v = ctx.catalog[name];
        if (!v)
          throw new Error(
            `${ctx.dir}/package.json: ${name} is catalog: but Mastra's catalog has no ${name}`,
          );
        deps[name] = exact(v);
        changes.push(`${field}.${name} catalog: -> ${deps[name]}`);
      } else if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        const v = ctx.pins.mastra?.[name];
        if (!v)
          throw new Error(
            `${ctx.dir}/package.json: ${name} is ${spec}; add it to pins.json "mastra"`,
          );
        deps[name] = v;
        changes.push(`${field}.${name} ${spec} -> ${v}`);
      }
    }
    if (Object.keys(deps).length === 0) delete pkg[field];
  }
  // Packages that publish dist/ are imported from their source here.
  if (pkg.exports && ctx.dir !== ctx.mainDir) {
    const toSrc = (v) =>
      typeof v === 'string' ? v.replace(/^\.\/dist\/(.+)\.(?:c?js|d\.c?ts)$/, './src/$1.ts') : v;
    const walk = (o) =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? walk(v) : toSrc(v)]),
      );
    const before = JSON.stringify(pkg.exports);
    pkg.exports = walk(pkg.exports);
    if (JSON.stringify(pkg.exports) !== before)
      changes.push('exports point at src/ instead of dist/');
  }
  // Bare imports the source uses but the manifest doesn't declare (hoisted in Mastra's monorepo).
  const declared = new Set(
    ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((f) =>
      Object.keys(pkg[f] ?? {}),
    ),
  );
  for (const mod of [...(ctx.imports.get(ctx.dir) ?? [])].sort()) {
    if (declared.has(mod) || mod === original) continue;
    const v = ctx.pins.mastra?.[mod] ?? ctx.pins.thirdParty?.[mod];
    if (!v) {
      ctx.unresolved.push(`${ctx.dir}: imports ${mod}, which no manifest or pin provides`);
      continue;
    }
    pkg.devDependencies ??= {};
    pkg.devDependencies[mod] = v;
    declared.add(mod);
    changes.push(`devDependencies.${mod} added (${v}): imported by the source, hoisted upstream`);
  }
  return { json: pkg, changes };
}

/**
 * Vendors one package's suites.
 * @param {{ pkg: string, tag: string, out: string, paths?: string[], pins: Record<string, any>, fetch?: typeof fetch }} opts
 */
export async function vendor(opts) {
  const fetchImpl = opts.fetch ?? fetch;
  const patterns = opts.paths ?? DEFAULT_PATHS[opts.pkg];
  if (!patterns) throw new Error(`no default paths for ${opts.pkg}; pass --paths`);
  const { commit, date } = await resolveTag(fetchImpl, opts.tag);
  const tree = await get(fetchImpl, `${API}/repos/${REPO}/git/trees/${commit}?recursive=1`, 'json');
  if (tree.truncated) throw new Error(`the git tree of ${commit} is truncated`);
  const selected = tree.tree
    .filter(
      (e) => e.type === 'blob' && matchesAny(e.path, patterns) && !matchesAny(e.path, EXCLUDES),
    )
    .map((e) => e.path)
    .sort();
  for (const p of selected) {
    const why = forbiddenPath(p);
    if (why) throw new RefusalError(`refused ${p}: ${why}`);
  }
  if (selected.length === 0) throw new Error(`no files match ${patterns.join(', ')} at ${commit}`);

  const contents = new Map();
  const queue = [...selected];
  const worker = async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      contents.set(p, await get(fetchImpl, `${RAW}/${REPO}/${commit}/${p}`, 'text'));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const p of selected) {
    const lic = CODE.test(p) ? nonApacheHeader(contents.get(p)) : null;
    if (lic) throw new RefusalError(`refused ${p}: its header names ${lic}`);
  }
  const workspace = await get(fetchImpl, `${RAW}/${REPO}/${commit}/pnpm-workspace.yaml`, 'text');
  const catalog = parseCatalog(workspace);

  // Package directories (those with a package.json) and their workspace names.
  const files = new Set(selected);
  const pkgDirs = selected.filter((p) => p.endsWith('/package.json')).map((p) => posix.dirname(p));
  const short = shortName(opts.pkg);
  const mainDir = pkgDirs.find((d) => d === `stores/${short}` || d === `workflows/${short}`);
  const names = Object.fromEntries(
    pkgDirs.map((d) => [
      d,
      d === mainDir
        ? `@loams-internal/upstream-${short}`
        : `@loams-internal/upstream-${short}-${dirSlug(d)}`,
    ]),
  );
  const dirOf = (p) =>
    pkgDirs.filter((d) => p.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];

  // Rewrite source files, collecting bare imports per package.
  const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
  const imports = new Map();
  const unresolved = [];
  const fileRecords = [];
  const output = new Map();
  for (const p of selected) {
    const text = /** @type {string} */ (contents.get(p));
    let body = text;
    const changes = [];
    if (CODE.test(p)) {
      const r = rewriteImports(p, text, files);
      body = r.text;
      if (r.rewritten.length) changes.push(...r.rewritten.map((x) => `import ${x}`));
      for (const u of r.unresolved)
        unresolved.push(`${p}: relative import ${u} leaves the vendored tree`);
      const d = dirOf(p);
      if (d) {
        const set = imports.get(d) ?? new Set();
        for (const s of bareImports(body)) {
          if (!s.startsWith('.') && !builtins.has(s) && !builtins.has(packageOf(s)))
            set.add(packageOf(s));
        }
        imports.set(d, set);
      }
      const header = `// Vendored from mastra-ai/mastra@${commit}:${p} (Apache-2.0). Changes: ${changes.length ? 'imports rewritten' : 'none'}.\n`;
      body = body.startsWith('#!') ? body.replace(/^(#![^\n]*\n)/, `$1${header}`) : header + body;
    }
    output.set(p, body);
    fileRecords.push({ path: p, sha256: sha256(text), ...(changes.length ? { changes } : {}) });
  }
  const packages = [];
  const ctx = { names, catalog, pins: opts.pins, imports, unresolved, mainDir };
  for (const d of pkgDirs) {
    const p = `${d}/package.json`;
    const { json, changes } = rewritePackageJson(/** @type {string} */ (contents.get(p)), {
      ...ctx,
      dir: d,
    });
    output.set(p, `${JSON.stringify(json, null, 2)}\n`);
    packages.push({ dir: d, name: names[d], changes });
    const rec = fileRecords.find((f) => f.path === p);
    if (rec) rec.changes = ['rewritten for this workspace; see packages'];
  }

  rmSync(opts.out, { recursive: true, force: true });
  for (const [p, body] of output) {
    const dest = join(opts.out, p);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
  const version = opts.tag.slice(opts.tag.lastIndexOf('@') + 1);
  const upstream = {
    package: opts.pkg,
    version,
    tag: opts.tag,
    repository: `https://github.com/${REPO}`,
    commit,
    commitDate: date,
    licence: 'Apache-2.0',
    paths: patterns,
    exclusions: EXCLUDES,
    droppedDependencies: [...DROPPED_DEPS].sort(),
    packages,
    files: fileRecords,
    unresolved,
  };
  writeFileSync(join(opts.out, 'UPSTREAM.json'), `${JSON.stringify(upstream, null, 2)}\n`);
  return upstream;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a?.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.package || !args.tag) {
    console.error(
      'usage: vendor-upstream.mjs --package <npm name> --tag <git tag> [--out <dir>] [--paths <a,b>]',
    );
    process.exit(64);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const pinsFile = join(root, 'test', 'conformance', 'pins.json');
  const pins = existsSync(pinsFile) ? JSON.parse(readFileSync(pinsFile, 'utf8')) : {};
  const version = args.tag.slice(args.tag.lastIndexOf('@') + 1);
  const out =
    args.out ??
    join(root, 'test', 'conformance', 'upstream', `${packageSlug(args.package)}@${version}`);
  try {
    const u = await vendor({
      pkg: args.package,
      tag: args.tag,
      out,
      paths: args.paths ? args.paths.split(',').map((s) => s.trim()) : undefined,
      pins,
    });
    console.log(
      `vendored ${u.files.length} files of ${u.package}@${u.version} (${u.commit}) into ${out}`,
    );
    for (const x of u.unresolved) console.warn(`warning: ${x}`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(e instanceof RefusalError ? 2 : 1);
  }
}
