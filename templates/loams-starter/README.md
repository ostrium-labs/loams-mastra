# loams-starter

A Mastra project on [Loams](https://github.com/ostrium-labs/loams): an agent with memory
(recent messages and semantic recall) on Loams Postgres, a RAG tool over `PgVector`, and a
two-step workflow that ingests documents. Mastra's own `@mastra/pg`, unchanged.

## Create

`create-mastra` takes a whole repository as a template, so the starter is mirrored to its own
repository:

```sh
npx create-mastra@1.34.2 --template https://github.com/ostrium-labs/loams-mastra-template
```

Or copy this directory.

## Start Loams Postgres

On your machine, from the Loams release's `loams-compose-<version>.tar.gz`:

```sh
cd loams-compose-0.1.0/loams-postgres-dev && docker compose up -d   # 127.0.0.1:55433
cp .env.example .env    # DATABASE_URL=postgresql://cloud_admin:cloud_admin@127.0.0.1:55433/postgres
```

Or reach a self-hosted Loams over your tailnet. Never expose Loams publicly.

## Run

```sh
pnpm install
pnpm dev            # Mastra's dev server and Studio
pnpm test:e2e       # ingest, retrieve, remember (mock model, offline embedder)
```

## Use real models

- `MODEL` picks the agent's model (a Mastra model-router id such as `openai/gpt-5-mini`; set
  the provider's key too).
- The embedder in `src/mastra/storage.ts` is an offline toy so the starter runs without keys.
  Replace it with a real embedding model, for example `openai.embedding('text-embedding-3-small')`
  from `@ai-sdk/openai`, and set `EMBEDDING_DIMENSIONS` to its size.

## Layout

| Path | What |
|---|---|
| `src/mastra/storage.ts` | `PostgresStore` and `PgVector` on Loams Postgres; the model and embedder |
| `src/mastra/agents/assistant.ts` | The agent, with `Memory` |
| `src/mastra/tools/search-docs.ts` | RAG over `PgVector` |
| `src/mastra/workflows/ingest-docs.ts` | Chunk, then embed and store |
| `llms.txt`, `.claude/skills/loams/SKILL.md` | Context for coding agents |
