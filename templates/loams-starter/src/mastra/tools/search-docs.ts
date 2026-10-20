// RAG over PgVector: the agent searches the documents the ingest workflow stored.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DOCS_INDEX, embed, vector } from '../storage.js';

export const searchDocsTool = createTool({
  id: 'search-docs',
  description: 'Search the stored documents for passages relevant to a question.',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({
    passages: z.array(z.object({ id: z.string(), text: z.string(), score: z.number() })),
  }),
  execute: async ({ query }) => {
    const [queryVector] = await embed([query]);
    const results = await vector.query({
      indexName: DOCS_INDEX,
      queryVector: queryVector ?? [],
      topK: 3,
    });
    return {
      passages: results.map((r) => ({
        id: String(r.id),
        text: String(r.metadata?.text ?? ''),
        score: r.score,
      })),
    };
  },
});
