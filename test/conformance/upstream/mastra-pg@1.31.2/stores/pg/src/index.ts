// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/src/index.ts (Apache-2.0). Changes: none.
export * from './vector';
export * from './storage';
export type {
  PostgresBaseConfig,
  PostgresStoreConfig,
  PgVectorConfig,
  ConnectionStringConfig,
  HostConfig,
  PoolInstanceConfig,
} from './shared/config';
export { PGVECTOR_PROMPT } from './vector/prompt';
