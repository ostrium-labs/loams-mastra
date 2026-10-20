// The quickstart (design §66 §5.1, variant B): storage on Loams Postgres with Mastra's own
// @mastra/pg, and vectors on the Loams Qdrant gateway with Mastra's own @mastra/qdrant.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { QdrantVector } from '@mastra/qdrant';
import { localEmbedder } from '../local-embedder.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('Set DATABASE_URL to your Loams Postgres (see .env.example)');

// 1. Storage on Loams Postgres; vectors on the Loams Qdrant gateway.
export const storage = new PostgresStore({ id: 'loams-pg', connectionString });
const apiKey = process.env.LOAMS_API_KEY; // an lk_ key; omitted on loopback with auth off
export const vector = new QdrantVector({
  id: 'loams-qdrant',
  url: process.env.LOAMS_QDRANT_URL ?? 'http://127.0.0.1:6333',
  ...(apiKey ? { apiKey } : {}),
  headers: { 'Loams-Namespace': process.env.LOAMS_NAMESPACE ?? 'default' },
});

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
