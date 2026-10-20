# @loams/mastra

A placeholder. This package will hold a native Loams adapter for [Mastra](https://mastra.ai):
a `MastraStorage` and a `MastraVector` that talk to Loams directly, with server-side
embeddings, hybrid (vector + BM25) search, and graph memory.

It is not published and has no code yet. Today, Mastra works with Loams through Mastra's
own packages, unchanged:

- `@mastra/qdrant` against the Loams Qdrant gateway, for vectors and semantic recall;
- `@mastra/pg` against Loams Postgres, for storage and `PgVector`.

See [`examples/quickstart`](../../examples) and the compatibility matrix in
[`test/conformance`](../../test/conformance).
