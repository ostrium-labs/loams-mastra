// A vitest reporter for the conformance gate (plan MA1 Task 6). Add it next to the default
// reporter:
//
//   reporters: ['default', ['../../reporter/compat-reporter.ts', { suite: 'qdrant' }]]
//
// Options (each falls back to an environment variable):
//   suite                COMPAT_SUITE           the expected-failures/<suite>.json to judge against
//   expectedFailuresDir  COMPAT_EXPECTED_DIR    default test/conformance/expected-failures
//   outputDir            COMPAT_RESULTS_DIR     default test/conformance/results
//   pinsFile             COMPAT_PINS            default test/conformance/pins.json (optional)
//   loamsUrl             LOAMS_QDRANT_URL; GET / gives the Qdrant version the gateway reports (optional)
//   LOAMS_VERSION        the Loams release under test, or `dev` for a build of Loams dev
//                        (default: pins.json loams.version); see ExpectedFailure.fixedAfter
//
// After the run it prints the verdict, writes results/<suite>.json, and sets the process
// exit code from the verdict alone: expected failures pass, an unexpected failure, an
// unexpected pass or an entry without an issue URL fails. No lk_ key is ever written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter, TestModule } from 'vitest/node';
import {
  describeVerdict,
  type ExpectedFailure,
  judge,
  type Outcome,
  redact,
  type Verdict,
} from './judge.js';

const here = dirname(fileURLToPath(import.meta.url));
const conformanceDir = resolve(here, '..');

export interface CompatReporterOptions {
  suite?: string;
  expectedFailuresDir?: string;
  outputDir?: string;
  pinsFile?: string;
  loamsUrl?: string;
  /** Set the process exit code from the verdict (default true). */
  setExitCode?: boolean;
}

export interface CompatResults extends Verdict {
  suite: string;
  generatedAt: string;
  versions: { mastra: Record<string, string> | 'unknown'; loams: string };
  /** What the Loams Qdrant gateway reports as its Qdrant compatibility version. */
  server: { qdrantCompat: string } | null;
  run: string | null;
  unhandledErrors: string[];
}

export function readExpected(dir: string, suite: string): ExpectedFailure[] {
  const f = join(dir, `${suite}.json`);
  if (!existsSync(f)) return [];
  return JSON.parse(readFileSync(f, 'utf8')) as ExpectedFailure[];
}

export function readPins(file: string): {
  mastra: Record<string, string> | 'unknown';
  loams: string;
} {
  try {
    const pins = JSON.parse(readFileSync(file, 'utf8'));
    return {
      mastra: pins.mastra ?? 'unknown',
      loams: process.env.LOAMS_VERSION ?? pins.loams?.version ?? 'unknown',
    };
  } catch {
    return { mastra: 'unknown', loams: process.env.LOAMS_VERSION ?? 'unknown' };
  }
}

export function runUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

async function qdrantCompat(url: string | undefined): Promise<{ qdrantCompat: string } | null> {
  if (!url) return null;
  try {
    const headers: Record<string, string> = {};
    if (process.env.LOAMS_API_KEY) headers['api-key'] = process.env.LOAMS_API_KEY;
    const res = await fetch(new URL('/', url), { headers, signal: AbortSignal.timeout(2000) });
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === 'string' ? { qdrantCompat: body.version } : null;
  } catch {
    return null;
  }
}

/** Turns vitest's test modules into outcomes, including modules that failed to load. */
export function outcomesOf(modules: ReadonlyArray<TestModule>): Outcome[] {
  const out: Outcome[] = [];
  for (const m of modules) {
    let tests = 0;
    for (const t of m.children.allTests()) {
      tests++;
      const r = t.result();
      if (r.state === 'failed') {
        out.push({ test: t.fullName, state: 'failed', error: r.errors?.[0]?.message ?? '' });
      } else if (r.state === 'passed') {
        out.push({ test: t.fullName, state: 'passed' });
      } else {
        out.push({ test: t.fullName, state: 'skipped' });
      }
    }
    const errors = m.errors();
    if (errors.length > 0 || (m.state() === 'failed' && tests === 0)) {
      out.push({
        test: `${m.relativeModuleId} (module)`,
        state: 'failed',
        error: errors.map((e) => e.message).join('\n'),
      });
    }
  }
  return out;
}

export default class CompatReporter implements Reporter {
  private readonly opts: Required<Omit<CompatReporterOptions, 'loamsUrl'>> & { loamsUrl?: string };

  constructor(options: CompatReporterOptions = {}) {
    const suite = options.suite ?? process.env.COMPAT_SUITE;
    if (!suite) throw new Error('compat-reporter: set the suite option or COMPAT_SUITE');
    this.opts = {
      suite,
      expectedFailuresDir:
        options.expectedFailuresDir ??
        process.env.COMPAT_EXPECTED_DIR ??
        join(conformanceDir, 'expected-failures'),
      outputDir:
        options.outputDir ?? process.env.COMPAT_RESULTS_DIR ?? join(conformanceDir, 'results'),
      pinsFile: options.pinsFile ?? process.env.COMPAT_PINS ?? join(conformanceDir, 'pins.json'),
      loamsUrl: options.loamsUrl ?? process.env.LOAMS_QDRANT_URL,
      setExitCode: options.setExitCode ?? true,
    };
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<{ message?: string }>,
  ): Promise<void> {
    const results = await this.evaluate(outcomesOf(testModules), unhandledErrors);
    console.log(`\n${describeVerdict(this.opts.suite, results)}`);
    if (results.unhandledErrors.length > 0) {
      console.log(
        `compat ${this.opts.suite}: ${results.unhandledErrors.length} unhandled error(s)`,
      );
    }
    if (this.opts.setExitCode) process.exitCode = results.ok ? 0 : 1;
  }

  /** Judges the outcomes and writes results/<suite>.json. */
  async evaluate(
    outcomes: Outcome[],
    unhandledErrors: ReadonlyArray<{ message?: string }> = [],
  ): Promise<CompatResults> {
    const versions = readPins(this.opts.pinsFile);
    const verdict = judge(
      outcomes,
      readExpected(this.opts.expectedFailuresDir, this.opts.suite),
      versions.loams,
    );
    const unhandled = unhandledErrors.map((e) => redact(e.message ?? String(e)));
    const results: CompatResults = {
      suite: this.opts.suite,
      generatedAt: new Date().toISOString(),
      versions,
      server: await qdrantCompat(this.opts.loamsUrl),
      run: runUrl(),
      unhandledErrors: unhandled,
      ...verdict,
      ok: verdict.ok && unhandled.length === 0,
    };
    mkdirSync(this.opts.outputDir, { recursive: true });
    writeFileSync(
      join(this.opts.outputDir, `${this.opts.suite}.json`),
      `${redact(JSON.stringify(results, null, 2))}\n`,
    );
    return results;
  }
}
