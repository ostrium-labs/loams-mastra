# Contributing

Thanks for helping. This repository connects [Mastra](https://mastra.ai) to
[Loams](https://github.com/ostrium-labs/loams). Changes to Loams itself go to that repository.

## Upstream first

- A generic Mastra bug or feature (one that isn't about Loams) is an issue in
  [mastra-ai/mastra](https://github.com/mastra-ai/mastra/issues), not a patch here.
- A Loams gap (an API Mastra needs that Loams doesn't serve) is an issue in
  [ostrium-labs/loams](https://github.com/ostrium-labs/loams/issues), titled `mastra: …`, with
  the exact request and response, and an entry in the conformance gate's expected failures.
- For anything bigger than a small fix here, open an issue first.

## Setup

Node 22.13 or later, and pnpm through corepack:

```sh
corepack enable
pnpm install --frozen-lockfile
```

## Tests

```sh
pnpm lint         # Biome
pnpm typecheck    # TypeScript
pnpm test         # packages and scripts
```

The conformance gate needs Loams running on loopback (`loams dev`, and the Loams Postgres
development stack for the pg suites); see `test/conformance/loams/README.md`:

```sh
pnpm conformance:pinned
```

Never point any example, template or test at a public endpoint.

## Licences

Mastra is Apache-2.0, except directories named `ee/` (the Mastra Enterprise Edition
licence) and the Elastic-2.0 provider code in `packages/connect`.

- Never read into this repository, copy or import any path with an `ee/` segment,
  `packages/connect/src/providers`, or anything under the Mastra Enterprise Edition licence
  or Elastic-2.0.
- A vendored or adapted Apache-2.0 file keeps a first-line header
  `Vendored from mastra-ai/mastra@<commit>:<path> (Apache-2.0). Changes: <list or none>.`
  and is listed in [NOTICE](NOTICE).
- No GPL, AGPL, BSL, SSPL or Elastic-2.0 dependency; `pnpm licences` enforces it.

## Dependencies

Every `@mastra/*` package in examples, templates and `test/conformance/pins.json` is pinned to
an exact version, because `@mastra/*` itself was compromised on npm in June 2026. pnpm refuses
third-party releases younger than three days (`minimumReleaseAge`) and runs no dependency
lifecycle scripts unless they are allowlisted in `pnpm-workspace.yaml`.

## Updating the vendored Mastra suites

The suites under `test/conformance/upstream/` are fetched file by file from a Mastra release
tag (never cloned):

```sh
pnpm vendor -- --package @mastra/pg --tag @mastra/pg@<version>
```

Update `test/conformance/pins.json` in the same change, rerun the gate, and update the
expected-failures lists.

## Commits and pull requests

- One change per pull request, into `main`. CI must be green.
- Commit subjects are short present-tense sentences.

## Developer Certificate of Origin

We use the Developer Certificate of Origin 1.1. There is no contributor licence agreement.
Every commit must carry a `Signed-off-by` trailer matching its author; CI's `DCO sign-off`
check fails otherwise. Use `git commit -s`. To sign off commits you already made, run
`git rebase --signoff main`. If they are already on a shared branch, add a signed-off commit
instead, with one line per commit in its body:

```
I, Your Name <you@example.com>, hereby add my Signed-off-by to this commit: <full sha>
```

(your author email must match the commit's).

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Questions

Join the [Loams Discord](https://discord.gg/eK6NanHQq). Keep GitHub issues for bugs and
feature requests. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
