# @loams/mastra

Empty until phase MA2. It will hold the native Loams integration for
[Mastra](https://mastra.ai), built on the typed `@loams/client`:

- `LoamsVector`: hybrid (BM25 + vector) search in one call, with server-side embeddings;
- `LoamsStore`: Mastra storage domains on Loams collections;
- `LoamsPubSub` on Loams Streams, `LoamsCache`, and `LoamsExporter` for spans.

Until then, Mastra works with Loams through Mastra's own packages, unchanged:
`@mastra/pg` against Loams Postgres and `@mastra/qdrant` against the Loams Qdrant gateway.
See the [quickstart](../../docs/quickstart.md) and [COMPATIBILITY.md](../../COMPATIBILITY.md).

Not published (`private: true`).
