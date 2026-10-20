// A two-step workflow: split a document into passages, then embed and store them in
// PgVector on Loams Postgres. Workflow runs and snapshots are kept in Loams Postgres too.
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { DOCS_INDEX, EMBEDDING_DIMENSIONS, embed, vector } from '../storage.js';

const chunk = createStep({
  id: 'chunk',
  inputSchema: z.object({ docId: z.string(), text: z.string() }),
  outputSchema: z.object({ docId: z.string(), passages: z.array(z.string()) }),
  execute: async ({ inputData }) => ({
    docId: inputData.docId,
    passages: inputData.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
  }),
});

const store = createStep({
  id: 'embed-and-store',
  inputSchema: z.object({ docId: z.string(), passages: z.array(z.string()) }),
  outputSchema: z.object({ docId: z.string(), stored: z.number() }),
  execute: async ({ inputData }) => {
    const { docId, passages } = inputData;
    await vector.createIndex({
      indexName: DOCS_INDEX,
      dimension: EMBEDDING_DIMENSIONS,
      metric: 'cosine',
    });
    await vector.upsert({
      indexName: DOCS_INDEX,
      vectors: await embed(passages),
      ids: passages.map((_, i) => `${docId}-${i}`),
      metadata: passages.map((text, i) => ({ docId, passage: i, text })),
    });
    return { docId, stored: passages.length };
  },
});

export const ingestDocsWorkflow = createWorkflow({
  id: 'ingest-docs',
  inputSchema: z.object({ docId: z.string(), text: z.string() }),
  outputSchema: z.object({ docId: z.string(), stored: z.number() }),
})
  .then(chunk)
  .then(store)
  .commit();
