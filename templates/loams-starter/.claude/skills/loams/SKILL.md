---
name: loams
description: Use when working on this Mastra project's data layer (storage, memory, vectors, RAG) or when Loams needs to be started for development or tests.
---

# Loams for this project

This project keeps Mastra's storage, memory and vectors in **Loams Postgres** (Postgres 17
with pgvector) through `@mastra/pg`. Loams is self-hosted: loopback or a tailnet only. Never
add a public endpoint, and never commit an `lk_` key or a `.env` file.

## Start Loams for development

1. Loams Postgres: from the Loams release's `loams-compose-<version>.tar.gz`, run
   `docker compose up -d` in `loams-postgres-dev`. It listens on `127.0.0.1:55433`
   (user `cloud_admin`, password `cloud_admin`, database `postgres`).
2. `cp .env.example .env` and set `DATABASE_URL`.
3. Optional, for the Qdrant-compatible API: `loams dev` (127.0.0.1:6333). With API keys on,
   mint one with `loams auth new-key --label dev --append "$LOAMS_API_KEYS_FILE"`.

## Verify

`pnpm test:e2e` ingests documents, retrieves them, and checks that memory recalls a fact
across threads. It needs only `DATABASE_URL`.

## Where things are

- `src/mastra/storage.ts`: `PostgresStore`, `PgVector`, model and embedder.
- Docs: https://github.com/ostrium-labs/loams-mastra (quickstart, compatibility matrix).
