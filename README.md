# Loams for Mastra

[![Compatibility](https://img.shields.io/badge/Mastra_compatibility-pending-lightgrey)](COMPATIBILITY.md)

[Mastra](https://mastra.ai) agents keep memory, workflow state, traces and embeddings
somewhere. [Loams](https://github.com/ostrium-labs/loams) can be that one backend, in your
own bucket: memory and storage, vectors and RAG, durable workflows, observability.

This repository proves compatibility first, in public, and lets Mastra's own tests be the
judge. It runs Mastra's pg and Qdrant adapter test suites, vendored at pinned release
tags, against `loams dev` and Loams Postgres, and ships a three-block quickstart. In
parallel it builds a Resonate execution engine for Mastra workflows, contributed upstream
as `@mastra/resonate`, and later a native `@loams/mastra` package for hybrid search,
storage on collections, Streams pubsub, a cache and a span exporter.

## Phases

| Phase | What | Status |
|---|---|---|
| MA0 | Compatibility with no new package: the conformance gate, quickstarts, a template, a docs page in Mastra's integrations list | In progress |
| MAR | The Resonate execution engine (`packages/resonate`, `@loams/mastra-resonate`, upstream as `@mastra/resonate`) | In progress |
| MA1 | Loams API fixes the gate finds (in [ostrium-labs/loams](https://github.com/ostrium-labs/loams)) | In progress |
| MA2 | Native `@loams/mastra` on `@loams/client` | Planned |
| MA3 | Loams Memory as Mastra processors and tools; `loams-mcp` from Mastra's MCP client | Planned |

## Quickstart

See [docs/quickstart.md](docs/quickstart.md) (coming with the examples). In short: Mastra's
own `@mastra/pg` against Loams Postgres, and `@mastra/qdrant` against the Loams Qdrant
gateway, with no Loams-specific package.

## The engine is never public

Every example, template and test here runs against Loams on loopback (`127.0.0.1`) or
over a tailnet (Tailscale or Headscale). Don't expose a Loams engine to the internet to
follow these docs.

## Layout

| Path | What |
|---|---|
| [`packages/mastra`](packages/mastra) | `@loams/mastra` (empty until MA2) |
| `packages/resonate` | `@loams/mastra-resonate` (MAR) |
| [`examples/`](examples) | Runnable Mastra apps on Loams |
| [`templates/`](templates) | Starter projects |
| [`test/conformance`](test/conformance) | Mastra's adapter suites against Loams |
| [`scripts/`](scripts) | Vendoring, licence and repository checks |

## Develop

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License and contact

[Apache-2.0](LICENSE); third-party provenance in [NOTICE](NOTICE). Mastra is a trademark
of Kepler Software, Inc.; this project is not affiliated with or endorsed by Mastra.

- Questions: [Loams Discord](https://discord.gg/eK6NanHQq)
- Contact: support@ostriumlabs.org. Built by [Ostrium Labs](https://ostriumlabs.org), a research lab building open-source Loams.
- Security: [SECURITY.md](SECURITY.md) (security@ostriumlabs.org)
