// A worker process for the crash tests. MODE=start starts RUN_ID and waits for
// it; MODE=serve only registers the workflow and serves the group. Each step
// appends a line to EVENTS, so the test can count executions across processes.
import { appendFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { init } from '@loams/mastra-resonate';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Resonate } from '@resonatehq/sdk/async';
import { z } from 'zod';

type WorkerEnv = Record<
  'RESONATE_URL' | 'GROUP' | 'DB_URL' | 'MODE' | 'RUN_ID' | 'GATE' | 'EVENTS',
  string
>;
const { RESONATE_URL, GROUP, DB_URL, MODE, RUN_ID, GATE, EVENTS } =
  process.env as unknown as WorkerEnv;
const log = (line: string) => appendFileSync(EVENTS, `${line}\n`);

const resonate = new Resonate({
  url: RESONATE_URL,
  group: GROUP,
  ttl: Number(process.env.TTL ?? 2_000),
});
const { createWorkflow, createStep } = init(resonate);
const num = z.object({ value: z.number() });

const step1 = createStep({
  id: 'step1',
  inputSchema: num,
  outputSchema: num,
  execute: async ({ inputData }) => {
    log(`step1:${process.pid}`);
    return { value: inputData.value + 1 };
  },
});
const step2 = createStep({
  id: 'step2',
  inputSchema: num,
  outputSchema: num,
  execute: async ({ inputData }) => {
    log(`step2-enter:${process.pid}`);
    while (!existsSync(GATE)) await sleep(50);
    log(`step2:${process.pid}`);
    return { value: inputData.value * 10 };
  },
});
const step3 = createStep({
  id: 'step3',
  inputSchema: num,
  outputSchema: num,
  execute: async ({ inputData }) => {
    log(`step3:${process.pid}`);
    return { value: inputData.value + 5 };
  },
});

const approve = createStep({
  id: 'approve',
  inputSchema: num,
  outputSchema: num,
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      log(`approve-suspend:${process.pid}`);
      return suspend({});
    }
    log(`approve:${process.pid}`);
    return { value: resumeData.approved ? inputData.value * 10 : 0 };
  },
});
const approval = createWorkflow({ id: 'approval', inputSchema: num, outputSchema: num })
  .then(step1)
  .then(approve)
  .then(step3)
  .commit();

const crashy = createWorkflow({ id: 'crashy', inputSchema: num, outputSchema: num })
  .then(step1)
  .then(step2)
  .then(step3)
  .commit();

const mastra = new Mastra({
  workflows: { crashy, approval },
  storage: new LibSQLStore({ id: 'crash-store', url: DB_URL }),
  logger: false,
});

log(`ready:${process.pid}`);
const WORKFLOW = (process.env.WORKFLOW ?? 'crashy') as 'crashy' | 'approval';
const summary = (result: { status: string }) =>
  JSON.stringify({ status: result.status, result: 'result' in result ? result.result : undefined });
if (MODE === 'start') {
  const run = await mastra.getWorkflow(WORKFLOW).createRun({ runId: RUN_ID });
  const result = await run.start({ inputData: { value: 1 } });
  log(`result:${process.pid}:${summary(result)}`);
} else if (MODE === 'resume') {
  const run = await mastra.getWorkflow(WORKFLOW).createRun({ runId: RUN_ID });
  const result = await run.resume({ step: 'approve', resumeData: { approved: true } });
  log(`result:${process.pid}:${summary(result)}`);
}
// Stay alive as a worker until killed.
setInterval(() => {}, 1 << 30);
