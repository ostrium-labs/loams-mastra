# Quickstart: Mastra on Loams, with vectors on the Qdrant gateway

Storage on Loams Postgres through Mastra's own `@mastra/pg`, and the vector store for
semantic recall on the Loams Qdrant gateway through Mastra's own `@mastra/qdrant`. Both
unchanged.

## 1. Start Loams

```sh
loams dev                    # Qdrant gateway on 127.0.0.1:6333
cd loams-compose-0.1.0/loams-postgres-dev && docker compose up -d   # 127.0.0.1:55433
```

With API keys on (`LOAMS_AUTH_MODE=apikey`), mint one with
`loams auth new-key --label mastra --append "$LOAMS_API_KEYS_FILE"`. Loopback or a tailnet
only; never a public endpoint.

## 2. Set the environment

```sh
cp .env.example .env
export DATABASE_URL=postgresql://cloud_admin:cloud_admin@127.0.0.1:55433/postgres
export LOAMS_QDRANT_URL=http://127.0.0.1:6333
export LOAMS_API_KEY=lk_...        # omit with auth off
export LOAMS_NAMESPACE=default
```

The key travels in Qdrant's `api-key` header and the namespace in `Loams-Namespace`.

## 3. Run

```sh
pnpm install
pnpm demo
```

As in the Postgres quickstart, the demo runs offline with a mock model and a local embedder
unless you set `MODEL` and `EMBEDDER`. `pnpm test:e2e` runs
`quickstart_qdrant_remembers_across_threads`.
