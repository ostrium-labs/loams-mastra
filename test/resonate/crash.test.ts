import type { ChildProcess } from 'node:child_process';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeValue } from '@loams/mastra-resonate';
import { Resonate } from '@resonatehq/sdk/async';
import { afterEach, describe, expect, it } from 'vitest';
import { hasServer, RESONATE_BACKEND, RESONATE_URL, uniqueId } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const workDir = join(here, '.tmp');
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
});

function startWorker(env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [join(here, 'fixtures', 'worker.ts')], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(child);
  return child;
}

function events(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

async function waitFor(check: () => boolean, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(!hasServer)('crash and resume', () => {
  it('crash_mid_workflow_resumes_without_rerunning_steps', async () => {
    mkdirSync(workDir, { recursive: true });
    const id = uniqueId('crash');
    const env = {
      RESONATE_URL,
      GROUP: id,
      DB_URL: `file:${join(workDir, `${id}.db`)}`,
      RUN_ID: id,
      GATE: join(workDir, `${id}.gate`),
      EVENTS: join(workDir, `${id}.events`),
    };
    try {
      // 1-2. A worker starts a three-step run; step 2 blocks on the gate file.
      const first = startWorker({ ...env, MODE: 'start' });
      await waitFor(
        () => events(env.EVENTS).some((e) => e.startsWith('step2-enter:')),
        20_000,
        'step 2 to start',
      );

      // 3. kill -9 the worker after step 1 has completed.
      first.kill('SIGKILL');
      await new Promise((r) => first.once('exit', r));

      // 4. Restart a worker and release the gate.
      const second = startWorker({ ...env, MODE: 'serve' });
      await waitFor(
        () => events(env.EVENTS).some((e) => e === `ready:${second.pid}`),
        20_000,
        'the new worker',
      );
      writeFileSync(env.GATE, 'go');

      // 5. The run finishes on the new worker.
      const observer = new Resonate({ url: RESONATE_URL, group: `${id}-observer` });
      try {
        const root = await observer.get(id);
        const result = decodeValue<{ status: string; result: unknown }>(await root.result());
        expect(result.status).toBe('success');
        expect(result.result).toEqual({ value: 25 });
      } finally {
        await observer.stop();
      }

      const log = events(env.EVENTS);
      const completed = (step: string) => log.filter((e) => e.startsWith(`${step}:`));
      expect(completed('step1')).toHaveLength(1);
      expect(completed('step2')).toHaveLength(1);
      expect(completed('step3')).toHaveLength(1);
      // Step 1 ran on the killed worker; steps 2 and 3 completed on the new one.
      expect(completed('step1')[0]).toBe(`step1:${first.pid}`);
      expect(completed('step2')[0]).toBe(`step2:${second.pid}`);
      expect(completed('step3')[0]).toBe(`step3:${second.pid}`);
    } finally {
      for (const suffix of ['.db', '.db-shm', '.db-wal', '.gate', '.events'])
        rmSync(join(workDir, `${id}${suffix}`), { force: true });
    }
  });

  // Loams backend only: kill -9 the Resonate server itself (Loams Durable) while
  // step 2 is in flight, restart it on the same data directory, and expect the
  // same outcome. LOAMS_KILL_CMD and LOAMS_START_CMD are shell commands the
  // harness provides; LOAMS_START_CMD must return once the server is listening.
  it.skipIf(
    RESONATE_BACKEND !== 'loams' || !process.env.LOAMS_KILL_CMD || !process.env.LOAMS_START_CMD,
  )(
    'crash_of_loams_resumes_without_rerunning_steps',
    async () => {
      mkdirSync(workDir, { recursive: true });
      const id = uniqueId('crashsrv');
      const env = {
        RESONATE_URL,
        GROUP: id,
        DB_URL: `file:${join(workDir, `${id}.db`)}`,
        RUN_ID: id,
        GATE: join(workDir, `${id}.gate`),
        EVENTS: join(workDir, `${id}.events`),
        // The worker's lease must outlive the server restart, or the pass in
        // flight is redelivered while it is still running.
        TTL: '60000',
      };
      try {
        const worker = startWorker({ ...env, MODE: 'start' });
        await waitFor(
          () => events(env.EVENTS).some((e) => e.startsWith('step2-enter:')),
          20_000,
          'step 2 to start',
        );

        execSync(process.env.LOAMS_KILL_CMD!, { stdio: 'inherit' });
        execSync(process.env.LOAMS_START_CMD!, { stdio: 'inherit' });
        writeFileSync(env.GATE, 'go');

        await waitFor(
          () => events(env.EVENTS).some((e) => e.startsWith('result:')),
          90_000,
          'the run to finish',
        );
        const result = events(env.EVENTS).find((e) => e.startsWith('result:'))!;
        expect(JSON.parse(result.slice(result.indexOf('{')))).toEqual({
          status: 'success',
          result: { value: 25 },
        });

        const log = events(env.EVENTS);
        for (const step of ['step1', 'step2', 'step3']) {
          expect(log.filter((e) => e.startsWith(`${step}:`))).toEqual([`${step}:${worker.pid}`]);
        }
      } finally {
        for (const suffix of ['.db', '.db-shm', '.db-wal', '.gate', '.events'])
          rmSync(join(workDir, `${id}${suffix}`), { force: true });
      }
    },
    120_000,
  );

  it('resume_after_worker_restart', async () => {
    mkdirSync(workDir, { recursive: true });
    const id = uniqueId('resume');
    const env = {
      RESONATE_URL,
      GROUP: id,
      DB_URL: `file:${join(workDir, `${id}.db`)}`,
      RUN_ID: id,
      GATE: join(workDir, `${id}.gate`),
      EVENTS: join(workDir, `${id}.events`),
      WORKFLOW: 'approval',
    };
    try {
      const first = startWorker({ ...env, MODE: 'start' });
      await waitFor(
        () => events(env.EVENTS).some((e) => e === `result:${first.pid}:{"status":"suspended"}`),
        20_000,
        'the run to suspend',
      );
      first.kill('SIGKILL');
      await new Promise((r) => first.once('exit', r));

      const second = startWorker({ ...env, MODE: 'resume' });
      await waitFor(
        () => events(env.EVENTS).some((e) => e.startsWith(`result:${second.pid}:`)),
        30_000,
        'the resume to finish',
      );
      const line = events(env.EVENTS).find((e) => e.startsWith(`result:${second.pid}:`))!;
      expect(JSON.parse(line.slice(line.indexOf('{')))).toEqual({
        status: 'success',
        result: { value: 25 },
      });

      const log = events(env.EVENTS);
      expect(log.filter((e) => e.startsWith('step1:'))).toEqual([`step1:${first.pid}`]);
      expect(log.filter((e) => e.startsWith('approve-suspend:'))).toEqual([
        `approve-suspend:${first.pid}`,
      ]);
      expect(log.filter((e) => e.startsWith('approve:'))).toEqual([`approve:${second.pid}`]);
      expect(log.filter((e) => e.startsWith('step3:'))).toEqual([`step3:${second.pid}`]);
    } finally {
      for (const suffix of ['.db', '.db-shm', '.db-wal', '.gate', '.events'])
        rmSync(join(workDir, `${id}${suffix}`), { force: true });
    }
  });
});
