// Runs the quickstart once against your Loams Postgres. With MODEL unset it uses a mock
// model (no provider key needed) and prints what semantic recall put in the prompt.
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { createAgent, createMemory, storage, vector } from './mastra/index.js';
import { remembersAcrossThreads } from './scenario.js';

const prompts: string[] = [];
const model =
  process.env.MODEL ??
  createMockModel({
    version: 'v2',
    mockText: 'Noted.',
    spyGenerate: (p: { prompt: unknown }) => prompts.push(JSON.stringify(p.prompt)),
    spyStream: (p: { prompt: unknown }) => prompts.push(JSON.stringify(p.prompt)),
  });
const memory = createMemory();
const agent = createAgent(model, memory);

const r = await remembersAcrossThreads(agent, memory);
console.log(`resource ${r.resource}`);
console.log(`fact saved in thread A as message ${r.factMessageId}`);
console.log(`recalled in thread B: ${r.recalledIds.includes(r.factMessageId) ? 'yes' : 'NO'}`);
if (!process.env.MODEL) {
  console.log(
    `thread B's prompt mentions teal: ${prompts.at(-1)?.includes('teal') ? 'yes' : 'NO'}`,
  );
}
console.log(`answer: ${r.answer}`);
await Promise.all([storage.close(), vector.disconnect()]);
