# Loams × Mastra

[Mastra](https://mastra.ai) agents need somewhere to keep their memory, their workflow
state, their traces and their embeddings. Usually that's four systems. With
[Loams](https://github.com/ostrium-labs/loams) it's one backend, in your own bucket:

- **Memory and storage**: threads, messages, working memory and workflow snapshots.
- **Vectors and RAG**: semantic recall and retrieval, with metadata filters.
- **Workflows** (in progress): durable execution on Loams Durable (Resonate).
- **Observability** (planned): traces, scores and usage on Loams streams and House.

Loams speaks the Qdrant and Postgres wire protocols, so Mastra's own `@mastra/qdrant` and
`@mastra/pg` work against it without changes. This repository holds the examples, the
conformance tests that check that claim against each Mastra release, and the native
packages that go further.

> Status: early. Phase 0 is examples and conformance against Mastra's unchanged
> packages; native packages come later.

## Layout

| Path | What |
|---|---|
| [`packages/mastra`](packages/mastra) | `@loams/mastra`, the native adapter (placeholder) |
| [`examples/`](examples) | Runnable Mastra apps on Loams |
| [`templates/`](templates) | Starter projects |
| [`test/conformance`](test/conformance) | Mastra's adapter test suites, run against Loams |

## Develop

Node 22 or later and pnpm (`corepack enable`):

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

`@mastra/*` dependencies are pinned to exact versions, and pnpm won't resolve a release
younger than three days. `pnpm check:pins` enforces the first; see
[CONTRIBUTING.md](CONTRIBUTING.md#dependencies).

## Community

- Questions and discussion: [Loams Discord](https://discord.gg/eK6NanHQq)
- Security reports: see [SECURITY.md](SECURITY.md)
- Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[Apache-2.0](LICENSE). Third-party provenance is listed in [NOTICE](NOTICE).
Mastra is a trademark of Kepler Software, Inc.; this project is not affiliated with or
endorsed by Mastra.
