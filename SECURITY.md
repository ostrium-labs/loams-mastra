# Security Policy

## Supported versions

Nothing here has a stable release yet. Security fixes land on `main` only.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, pull requests or discussions.**

Report them privately through GitHub's private vulnerability reporting: open the
repository's **Security** tab and choose **Report a vulnerability**
([direct link](../../security/advisories/new)).

If you cannot use GitHub, email **security@ostriumlabs.org**.

Please include the affected package or example and its version or commit, steps to
reproduce, and your assessment of the impact.

A vulnerability in Loams itself (the server, its gateways or its SDKs) belongs to
[ostrium-labs/loams](https://github.com/ostrium-labs/loams/security); one in Mastra belongs
to [mastra-ai/mastra](https://github.com/mastra-ai/mastra/security). If you aren't sure,
report it here and we'll route it.

## What to expect

- We acknowledge a report within **3 business days**.
- We agree on a disclosure timeline with you; the default is an advisory once a fix is on
  `main`, within **90 days** of the report.
- We credit reporters unless you ask us not to.

## Supply chain

`@mastra/*` itself was compromised on npm in June 2026. Our controls:

- **Publishing:** npm trusted publishing (OIDC) with provenance, from one workflow on
  GitHub-hosted runners, in a protected `npm` environment with required reviewers. No
  long-lived npm tokens.
- **Installing:** `pnpm install --frozen-lockfile`; dependency lifecycle scripts blocked
  except an explicit allowlist; no third-party release younger than three days
  (`minimumReleaseAge`; the nightly `alpha` conformance cell is exempt and runs without
  secrets); `npm audit signatures` in CI.
- **Pins:** exact versions of every `@mastra/*` package in examples, templates and the
  conformance pins; ranges only in a published package's peer dependencies.
- **Workflows:** actions pinned by commit SHA, read-only permissions by default, no
  `pull_request_target`, Dependabot with a cooldown.
- **Licences:** CI refuses GPL, AGPL, BSL, SSPL, Elastic-2.0 and the Mastra Enterprise
  Edition licence in the dependency tree and in vendored files.

If you see a compromised package version in our lockfile, report it as above.
