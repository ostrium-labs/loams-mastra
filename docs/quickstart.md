# Quickstart: Mastra on Loams

Mastra's own packages work against Loams unchanged: `@mastra/pg` against Loams Postgres, and
`@mastra/qdrant` against the Loams Qdrant gateway. Three blocks of code.

## Where Loams runs

The Loams engine is self-hosted and **never public**. Run it:

- **locally**: `loams dev` (Qdrant gateway on `127.0.0.1:6333`, Elasticsearch on
  `127.0.0.1:9200`) and the Loams Postgres development stack from the release's
  `loams-compose-<version>.tar.gz` (`loams-postgres-dev`, Postgres on `127.0.0.1:55433`);
- **on a server**: the self-hosted compose release, reached over a tailnet (Tailscale or
  Headscale), as in the Loams [preview guide](https://github.com/ostrium-labs/loams/blob/dev/docs/release/preview.md).
  Use the server's tailnet name (for example `https://loams.<tailnet>.ts.net`), an `lk_` API
  key and a namespace.

## Variant A: everything on Loams Postgres

```ts
import { Mastra } from '@mastra/core/mastra';
import { PgVector, PostgresStore } from '@mastra/pg';

export const mastra = new Mastra({
  storage: new PostgresStore({ id: 'loams-pg', connectionString: process.env.DATABASE_URL! }),
  vectors: { loams: new PgVector({ id: 'loams-pgvector', connectionString: process.env.DATABASE_URL! }) },
});
```

`DATABASE_URL=postgresql://cloud_admin:cloud_admin@127.0.0.1:55433/postgres` for the local
stack. Loams Postgres ships pgvector 0.8.0 on PostgreSQL 17.

## Variant B: vectors on the Loams Qdrant gateway

```ts
import { QdrantVector } from '@mastra/qdrant';

const vector = new QdrantVector({
  id: 'loams-qdrant',
  url: process.env.LOAMS_QDRANT_URL ?? 'http://127.0.0.1:6333',
  apiKey: process.env.LOAMS_API_KEY, // an lk_ key; omit it on loopback with auth off
  headers: { 'Loams-Namespace': process.env.LOAMS_NAMESPACE ?? 'default' },
});
```

## Memory with semantic recall

```ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistant',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory: new Memory({
    storage, // the PostgresStore above
    vector, // PgVector or QdrantVector
    embedder: 'openai/text-embedding-3-small',
    options: { lastMessages: 10, semanticRecall: { topK: 3, messageRange: 1, scope: 'resource' } },
  }),
});
```

Runnable versions, with an offline demo and an end-to-end test, are in
[`examples/quickstart-postgres`](../examples/quickstart-postgres) and
[`examples/quickstart-qdrant`](../examples/quickstart-qdrant).

## What works

Mastra's own adapter test suites run against Loams on every change; see
[COMPATIBILITY.md](../COMPATIBILITY.md). Known gaps: on the Qdrant gateway, deleting a payload
index, and geo, `nested` and `has_vector` filters (Memory and RAG use none of them).
