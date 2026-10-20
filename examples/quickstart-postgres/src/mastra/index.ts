// The quickstart (design §66 §5.1, variant A): Mastra's own @mastra/pg, unchanged, on
// Loams Postgres. Storage, the vector store for semantic recall, and an agent with memory.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';
import { localEmbedder } from '../local-embedder.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('Set DATABASE_URL to your Loams Postgres (see .env.example)');

// 1. Storage and vectors on Loams Postgres.
export const storage = new PostgresStore({ id: 'loams-pg', connectionString });
export const vector = new PgVector({ id: 'loams-pgvector', connectionString });

// 2. Memory: recent messages, plus semantic recall across every thread of a resource.
export function createMemory(embedder: unknown = process.env.EMBEDDER ?? localEmbedder) {
  return new Memory({
    storage,
    vector,
    embedder: embedder as never,
    options: {
      lastMessages: 10,
      semanticRecall: { topK: 3, messageRange: 1, scope: 'resource' },
    },
  });
}

// 3. An agent with that memory, registered with Mastra.
export function createAgent(
  model: unknown = process.env.MODEL ?? 'openai/gpt-5-mini',
  memory = createMemory(),
) {
  return new Agent({
    id: 'assistant',
    name: 'Assistant',
    instructions: 'You are a helpful assistant. Use what you remember about the user.',
    model: model as never,
    memory,
  });
}

export const mastra = new Mastra({
  storage,
  vectors: { loams: vector },
  agents: { assistant: createAgent() },
});
