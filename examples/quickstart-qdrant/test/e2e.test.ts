import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { afterAll, describe, expect, it } from 'vitest';
import { createAgent, createMemory, storage } from '../src/mastra/index.js';
import { remembersAcrossThreads } from '../src/scenario.js';

describe('quickstart-qdrant', () => {
  afterAll(async () => {
    await storage.close();
  });

  it('quickstart_qdrant_remembers_across_threads', async () => {
    const prompts: string[] = [];
    const spy = (p: { prompt: unknown }) => prompts.push(JSON.stringify(p.prompt));
    const model = createMockModel({
      version: 'v2',
      mockText: 'Noted.',
      spyGenerate: spy,
      spyStream: spy,
    });
    const memory = createMemory();
    const result = await remembersAcrossThreads(createAgent(model, memory), memory);

    expect(result.recalledIds).toContain(result.factMessageId);
    expect(prompts.at(-1)).toContain('teal');
    expect(result.answer).toBe('Noted.');
  });
});
