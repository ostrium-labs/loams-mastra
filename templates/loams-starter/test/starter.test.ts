import { randomUUID } from 'node:crypto';
import { createMockModel } from '@mastra/core/test-utils/llm-mock';
import { afterAll, describe, expect, it } from 'vitest';
import { createAssistant } from '../src/mastra/agents/assistant.js';
import { mastra } from '../src/mastra/index.js';
import { storage, vector } from '../src/mastra/storage.js';
import { searchDocsTool } from '../src/mastra/tools/search-docs.js';

const DOC = `Loams keeps its data in your own object-storage bucket.

Loams Postgres runs pgvector, so Mastra's PgVector works unchanged.

The Qdrant gateway listens on port 6333 when you run loams dev.`;

describe('loams-starter', () => {
  afterAll(async () => {
    await Promise.all([storage.close(), vector.disconnect()]);
  });

  it('template_creates_and_passes: the workflow ingests, the tool retrieves', async () => {
    const docId = `doc-${randomUUID()}`;
    const run = await mastra.getWorkflow('ingestDocsWorkflow').createRun();
    const result = await run.start({ inputData: { docId, text: DOC } });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.stored).toBe(3);

    const out = (await searchDocsTool.execute?.(
      { query: 'Which port does the Qdrant gateway listen on?' },
      {} as never,
    )) as {
      passages: { id: string; text: string }[];
    };
    expect(out.passages.some((p) => p.text.includes('6333'))).toBe(true);
  });

  it('template_creates_and_passes: the agent remembers across threads', async () => {
    const prompts: string[] = [];
    const spy = (p: { prompt: unknown }) => prompts.push(JSON.stringify(p.prompt));
    const agent = createAssistant(
      createMockModel({ version: 'v2', mockText: 'Noted.', spyGenerate: spy, spyStream: spy }),
    );
    const resource = `user-${randomUUID()}`;
    await agent.generate('I deploy Loams over our Headscale tailnet.', {
      memory: { thread: randomUUID(), resource },
    });
    await agent.generate('How do I deploy Loams?', { memory: { thread: randomUUID(), resource } });
    expect(prompts.at(-1)).toContain('Headscale');
  });
});
