import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import CompatReporter from './compat-reporter.js';
import { applies, type ExpectedFailure, judge, type Outcome } from './judge.js';

const ISSUE = 'https://github.com/ostrium-labs/loams/issues/900';

function dirs(expected: ExpectedFailure[], suite = 'unit') {
  const expectedDir = mkdtempSync(join(tmpdir(), 'compat-expected-'));
  const outputDir = mkdtempSync(join(tmpdir(), 'compat-results-'));
  writeFileSync(join(expectedDir, `${suite}.json`), JSON.stringify(expected));
  return { expectedDir, outputDir };
}

function entry(test: string, issue = ISSUE): ExpectedFailure {
  return { test, reason: 'Loams answers 501', issue, since: '2026-10-20' };
}

async function evaluate(outcomes: Outcome[], expected: ExpectedFailure[]) {
  const { expectedDir, outputDir } = dirs(expected);
  const reporter = new CompatReporter({
    suite: 'unit',
    expectedFailuresDir: expectedDir,
    outputDir,
    pinsFile: join(outputDir, 'missing-pins.json'),
    setExitCode: false,
  });
  const results = await reporter.evaluate(outcomes);
  const written = JSON.parse(readFileSync(join(outputDir, 'unit.json'), 'utf8'));
  return { results, written };
}

describe('compat reporter', () => {
  it('reporter_fails_on_unexpected_failure', async () => {
    const { results, written } = await evaluate(
      [
        { test: 'A > works', state: 'passed' },
        { test: 'A > breaks', state: 'failed', error: 'Not Implemented' },
      ],
      [],
    );
    expect(results.ok).toBe(false);
    expect(results.unexpected.failures).toEqual(['A > breaks']);
    expect(written.ok).toBe(false);
    expect(written.versions).toEqual({
      mastra: 'unknown',
      loams: process.env.LOAMS_VERSION ?? 'unknown',
    });
  });

  it('reporter_fails_on_unexpected_pass', async () => {
    const { results } = await evaluate(
      [{ test: 'A > fixed in Loams', state: 'passed' }],
      [entry('A > fixed in Loams')],
    );
    expect(results.ok).toBe(false);
    expect(results.unexpected.passes).toEqual(['A > fixed in Loams']);
  });

  it('reporter_requires_issue_link', async () => {
    for (const issue of ['', 'TODO', 'https://github.com/someone/else/issues/1', `${ISSUE}#x`]) {
      const { results } = await evaluate(
        [{ test: 'A > geo', state: 'failed', error: '501' }],
        [entry('A > geo', issue)],
      );
      expect(results.ok).toBe(false);
      expect(results.unexpected.missingIssue).toEqual(['A > geo']);
    }
    for (const issue of [
      'https://github.com/ostrium-labs/loams-postgres/issues/3',
      'https://github.com/ostrium-labs/loams-mastra/issues/29',
      'https://github.com/mastra-ai/mastra/issues/25001',
    ]) {
      const { results } = await evaluate(
        [{ test: 'A > geo', state: 'failed' }],
        [entry('A > geo', issue)],
      );
      expect(results.ok).toBe(true);
    }
  });

  it('reporter_passes_when_failures_match', async () => {
    const { results, written } = await evaluate(
      [
        { test: 'A > works', state: 'passed' },
        { test: 'A > geo', state: 'failed', error: 'Not Implemented' },
        { test: 'A > skipped', state: 'skipped' },
      ],
      [entry('A > geo'), entry('A > not in this cell')],
    );
    expect(results.ok).toBe(true);
    expect(results.counts).toEqual({
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      expectedFailures: 1,
    });
    expect(results.notRun).toEqual(['A > not in this cell']);
    expect(written.failures[0]).toMatchObject({ test: 'A > geo', expected: true, issue: ISSUE });
  });

  it('reporter_applies_fixed_entries_only_to_older_releases', () => {
    const fixed: ExpectedFailure = {
      ...entry('A > fixed on dev'),
      fixedAfter: '0.1.0',
      fixedBy: 'https://github.com/ostrium-labs/loams/pull/929',
    };
    expect(applies(fixed, '0.1.0')).toBe(true);
    expect(applies(fixed, '0.0.9')).toBe(true);
    expect(applies(fixed, 'unknown')).toBe(true);
    expect(applies(fixed, '0.1.1')).toBe(false);
    expect(applies(fixed, '0.2.0')).toBe(false);
    expect(applies(fixed, 'dev')).toBe(false);
    expect(applies(entry('A > open'), 'dev')).toBe(true);
    const failing: Outcome[] = [{ test: 'A > fixed on dev', state: 'failed', error: '501' }];
    const passing: Outcome[] = [{ test: 'A > fixed on dev', state: 'passed' }];
    // The pinned release still fails it; dev must pass it.
    expect(judge(failing, [fixed], '0.1.0').ok).toBe(true);
    expect(judge(passing, [fixed], '0.1.0').unexpected.passes).toEqual(['A > fixed on dev']);
    expect(judge(passing, [fixed], 'dev').ok).toBe(true);
    expect(judge(failing, [fixed], 'dev').unexpected.failures).toEqual(['A > fixed on dev']);
    expect(judge(passing, [fixed], 'dev').notRun).toEqual([]);
  });

  // End to end: vitest runs a fixture with the reporter in a child process, and the
  // verdict alone decides the exit code.
  describe('in a vitest run', () => {
    const require = createRequire(import.meta.url);
    const vitestBin = join(require.resolve('vitest/package.json'), '..', 'vitest.mjs');
    const config = join(import.meta.dirname, 'fixtures', 'vitest.fixture.config.ts');

    function run(expected: ExpectedFailure[]) {
      const { expectedDir, outputDir } = dirs(expected, 'sample');
      const p = spawnSync(process.execPath, [vitestBin, 'run', '--config', config], {
        env: {
          ...process.env,
          COMPAT_EXPECTED_DIR: expectedDir,
          COMPAT_RESULTS_DIR: outputDir,
          CI: '1',
        },
        encoding: 'utf8',
      });
      const raw = readFileSync(join(outputDir, 'sample.json'), 'utf8');
      return { status: p.status, raw, results: JSON.parse(raw), output: p.stdout + p.stderr };
    }

    it('exits 1 on an unexpected failure, with full test names', () => {
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.results.unexpected.failures).toEqual(['Sample > nested > fails']);
      expect(r.output).toContain('Unexpected failures');
    });

    it('exits 0 when the only failure is expected, and never writes an lk_ key', () => {
      const r = run([entry('Sample > nested > fails')]);
      expect(r.status).toBe(0);
      expect(r.results.ok).toBe(true);
      expect(r.raw).not.toMatch(/lk_[0-9A-HJKMNP-TV-Z]{26}_/);
      expect(r.raw).toContain('lk_[redacted]');
    });
  });
});
