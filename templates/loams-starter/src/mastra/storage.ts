// Loams Postgres holds everything: Mastra's storage, the memory vectors and the RAG index,
// through Mastra's own @mastra/pg, unchanged.
import { PgVector, PostgresStore } from '@mastra/pg';
import { localEmbedder } from './local-embedder.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('Set DATABASE_URL to your Loams Postgres (see .env.example)');

export const storage = new PostgresStore({ id: 'loams-pg', connectionString });
export const vector = new PgVector({ id: 'loams-pgvector', connectionString });

/**
 * The embedding model for memory and RAG: any AI SDK embedding model. The default is an
 * offline toy so the starter runs without keys; replace it in an application, for example
 * with `openai.embedding('text-embedding-3-small')` from `@ai-sdk/openai`.
 */
export const embedder = localEmbedder;
export const EMBEDDING_DIMENSIONS = 256;

export async function embed(values: string[]): Promise<number[][]> {
  return (await embedder.doEmbed({ values })).embeddings;
}

/** Set MODEL (for example openai/gpt-5-mini) and the provider's key. */
export const model = process.env.MODEL ?? 'openai/gpt-5-mini';

export const DOCS_INDEX = 'loams_starter_docs';
