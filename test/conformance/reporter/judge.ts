// The conformance gate's verdict (plan MA1 Task 6, design §66 §5.2).
//
// The gate fails on an unexpected failure, on an unexpected pass of a listed test, and on
// an expected-failure entry with no tracking issue, so the expected-failures list is
// always the truth.

export interface ExpectedFailure {
  /** The full test name: describe titles and the test title joined by " > ". */
  test: string;
  reason: string;
  /** A tracking issue in ostrium-labs/loams, ostrium-labs/loams-postgres or mastra-ai/mastra. */
  issue: string;
  /** The date the entry was added, YYYY-MM-DD. */
  since: string;
  /**
   * The last Loams release that still fails: the fix has landed on Loams `dev` (in
   * `fixedBy`). The entry applies only to that release and older ones; against a `dev`
   * build or a newer release the test must pass, so the gate stays exact on both. Once
   * pins.json moves past it, the entry is stale and repo-checks asks for its removal.
   */
  fixedAfter?: string;
  /** The Loams pull request with the fix. */
  fixedBy?: string;
}

/** `[major, minor, patch]` of a release version, or null for anything else. */
function semver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0 or 1; null when either is not a release version. */
export function compareVersions(a: string, b: string): number | null {
  const x = semver(a);
  const y = semver(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/**
 * Whether `entry` applies to the Loams under test: always without `fixedAfter`; never
 * against `dev` (a build of the monorepo's dev branch, which has every landed fix) or a
 * release newer than `fixedAfter`. An unknown version keeps the entry.
 */
export function applies(entry: ExpectedFailure, loams: string | undefined): boolean {
  if (!entry.fixedAfter || !loams || loams === 'unknown') return true;
  if (loams === 'dev') return false;
  const order = compareVersions(loams, entry.fixedAfter);
  return order === null || order <= 0;
}

export type Outcome = { test: string; state: 'passed' | 'failed' | 'skipped'; error?: string };

export interface Verdict {
  ok: boolean;
  counts: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    expectedFailures: number;
  };
  failures: Array<{ test: string; error: string; expected: boolean; issue: string | null }>;
  unexpected: {
    failures: string[];
    passes: string[];
    missingIssue: string[];
  };
  /** Listed tests that didn't run (skipped or absent); reported, not failing. */
  notRun: string[];
}

export const ISSUE_URL =
  /^https:\/\/github\.com\/(?:ostrium-labs\/(?:loams|loams-postgres|loams-mastra)|mastra-ai\/mastra)\/issues\/\d+$/;

const LK_KEY = /lk_[0-9A-Za-z]{10,}(?:_[0-9A-Za-z]+)?/g;

/** Removes any lk_ API key from text that goes into results or logs. */
export function redact(text: string): string {
  return text.replace(LK_KEY, 'lk_[redacted]');
}

export function judge(
  outcomes: Outcome[],
  allExpected: ExpectedFailure[],
  loams?: string,
): Verdict {
  const expected = allExpected.filter((e) => applies(e, loams));
  const listed = new Map(expected.map((e) => [e.test, e]));
  const seen = new Map(outcomes.map((o) => [o.test, o]));
  const failures: Verdict['failures'] = [];
  const unexpectedFailures: string[] = [];
  const unexpectedPasses: string[] = [];
  for (const o of outcomes) {
    const entry = listed.get(o.test);
    if (o.state === 'failed') {
      failures.push({
        test: o.test,
        error: redact(o.error ?? ''),
        expected: entry !== undefined,
        issue: entry?.issue ?? null,
      });
      if (!entry) unexpectedFailures.push(o.test);
    } else if (o.state === 'passed' && entry) {
      unexpectedPasses.push(o.test);
    }
  }
  const missingIssue = expected.filter((e) => !ISSUE_URL.test(e.issue ?? '')).map((e) => e.test);
  const notRun = expected
    .filter((e) => seen.get(e.test) === undefined || seen.get(e.test)?.state === 'skipped')
    .map((e) => e.test);
  const count = (s: Outcome['state']) => outcomes.filter((o) => o.state === s).length;
  return {
    ok:
      unexpectedFailures.length === 0 && unexpectedPasses.length === 0 && missingIssue.length === 0,
    counts: {
      total: outcomes.length,
      passed: count('passed'),
      failed: count('failed'),
      skipped: count('skipped'),
      expectedFailures: failures.filter((f) => f.expected).length,
    },
    failures,
    unexpected: { failures: unexpectedFailures, passes: unexpectedPasses, missingIssue },
    notRun,
  };
}

export function describeVerdict(suite: string, v: Verdict): string {
  const lines = [
    `compat ${suite}: ${v.counts.passed} passed, ${v.counts.failed} failed (${v.counts.expectedFailures} expected), ${v.counts.skipped} skipped`,
  ];
  const list = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`${title}:`);
    for (const i of items) lines.push(`  - ${i}`);
  };
  list('Unexpected failures (fix them, or list them with an issue)', v.unexpected.failures);
  list('Unexpected passes (remove them from the expected-failures list)', v.unexpected.passes);
  list('Expected failures without an issue URL', v.unexpected.missingIssue);
  list('Listed but not run', v.notRun);
  lines.push(v.ok ? `compat ${suite}: OK` : `compat ${suite}: FAILED`);
  return lines.join('\n');
}
