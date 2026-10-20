# Quickstart: Mastra on Loams Postgres

A Mastra agent whose memory (threads, messages, semantic recall) lives in Loams Postgres,
through Mastra's own `@mastra/pg`, unchanged.

## 1. Start Loams Postgres

On your machine, from the Loams release's `loams-compose-<version>.tar.gz`:

```sh
cd loams-compose-0.1.0/loams-postgres-dev
docker compose up -d        # compute1 answers on 127.0.0.1:55433
```

Or reach a self-hosted Loams over your tailnet. Never expose it publicly.

## 2. Set `DATABASE_URL`

```sh
cp .env.example .env
export DATABASE_URL=postgresql://cloud_admin:cloud_admin@127.0.0.1:55433/postgres
```

## 3. Run

```sh
pnpm install
pnpm demo
```

With no `MODEL` set, the demo uses a mock model and a local embedder, so it needs no provider
key. It tells the agent a fact in one thread, asks for it in another thread of the same user,
and prints whether semantic recall found it:

```
recalled in thread B: yes
thread B's prompt mentions teal: yes
```

Set `MODEL` (for example `openai/gpt-5-mini`), `EMBEDDER` (for example
`openai/text-embedding-3-small`) and the provider's key to use real models.

The code is in [`src/mastra/index.ts`](src/mastra/index.ts). `pnpm test:e2e` runs the same
scenario as a test (`quickstart_postgres_remembers_across_threads`).
