import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import CompatReporter from './compat-reporter.js';
import type { ExpectedFailure, Outcome } from './judge.js';

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
