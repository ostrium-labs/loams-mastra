# Contributing

Thanks for helping. This repository connects [Mastra](https://mastra.ai) to
[Loams](https://github.com/ostrium-labs/loams); changes to Loams itself go to that repository.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the shape.
- A Loams gap found here (an API Mastra needs that Loams doesn't serve) is filed in
  [ostrium-labs/loams](https://github.com/ostrium-labs/loams/issues) with a title starting
  `mastra:`, the exact request and the response.

## Setup

Node 22 or later, and pnpm through corepack:

```sh
corepack enable
pnpm install
pnpm lint        # Biome
pnpm typecheck   # TypeScript
pnpm test        # Vitest
```

The examples and the conformance tests need a Loams running on loopback; each README says how.
Never point them at a public endpoint.

## Dependencies

`@mastra/*` packages (and the `mastra` CLI) are pinned to **exact** versions, in every
`package.json`, because of the 2026-06 `@mastra/*` npm compromise. `pnpm check:pins` fails CI
on a range. pnpm also refuses releases younger than three days (`minimumReleaseAge` in
`pnpm-workspace.yaml`). Dependabot proposes bumps with the same delay; review the release
notes and the diff of a Mastra bump before merging it, and rerun the conformance tests.

`peerDependencies` of a published package may use a range.

## Copying code

Mastra is Apache-2.0, except directories named `ee/` (the Mastra Enterprise Edition licence)
and the Elastic-2.0 provider code in `@mastra/connect`. **Never copy from those.** When you
adapt Apache-2.0 code from Mastra or another project:

1. keep its copyright line and add a header naming the source path, the commit, and that
   you changed it;
2. add an entry to [NOTICE](NOTICE).

## Commits and pull requests

- Keep a pull request to one change. CI must be green before it merges.
- Write commit subjects as a short sentence in the present tense.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/). There is no
contributor licence agreement. CI fails if a commit has no matching sign-off. Sign off every
commit:

```sh
git commit -s -m "quickstart: add semantic recall"
```

This adds `Signed-off-by: Your Name <you@example.com>`, certifying that you wrote the change
or otherwise have the right to submit it under the project's licence. To sign off commits
you already made, run `git rebase --signoff main`.

## Questions

Join the [Loams Discord](https://discord.gg/eK6NanHQq). Keep GitHub issues for bugs and
feature requests.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
