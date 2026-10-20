# Mastra workflows on Loams Durable

[`@loams/mastra-resonate`](../packages/resonate/README.md) runs Mastra workflows on any
Resonate server. Loams Durable is one: Loams embeds the Resonate server and speaks the
standard Resonate protocol, so the engine needs no Loams-specific code. This page covers
what is specific to running it on Loams.

## Start Loams with Durable

A Loams release build carries the durable feature. `loams dev` serves the Resonate
protocol on `127.0.0.1:8001`, on SQLite under the data directory:

```sh
loams dev --data-dir ./.loams
```

Point a Resonate client at it:

```ts
import { Resonate } from '@resonatehq/sdk/async';
import { init } from '@loams/mastra-resonate';

const resonate = new Resonate({ url: 'http://127.0.0.1:8001', group: 'mastra' });
export const { createWorkflow, createStep } = init(resonate);
```

Use `@resonatehq/sdk` 0.11.5 or a later 0.11 release (protocol `2026-04-01`); the 0.10
releases do not speak the protocol Loams serves.

Mastra still needs a storage backend for workflow snapshots, run listings and Studio. Any
Mastra store works. On Loams, `@mastra/pg` can point at Loams Postgres; see the
repository README.

## Where it may listen

- The durable listener accepts loopback addresses only (`--durable-listen`, default
  `127.0.0.1:8001`). It has no authentication, and Loams refuses a non-loopback address
  at startup.
- Loams' main port also serves the protocol at `/durable/`, behind authentication. Run
  workers on the Loams host, or reach that host over a tailnet (Tailscale or Headscale).
- Never expose the durable listener on a public address.

## Keys and tenancy

Durable on Loams is instance-wide: one Resonate server per Loams instance, not per
namespace.

- On `loams dev` (loopback, no authentication) nothing changes.
- Through the main port, calls need an operator or organisation key. A key bound to an
  environment is refused.
- This suits a self-hosted, single-tenant install. Multi-tenant use waits for per-namespace
  Durable.

## Crash recovery

Every process that registers the same workflows with a Resonate client in the same group is
a worker. If the process running a workflow dies, Loams hands its task to another worker
once its lease expires, and the run continues after the last completed step. The lease is
the client's `ttl` (one minute by default).

The engine's tests cover two crashes:

- `kill -9` of a worker, then a new worker finishes the run;
- `kill -9` of Loams itself, then `loams dev` restarts on the same data directory.

In the second case, keep the worker's `ttl` longer than the restart. Otherwise the step in
flight is handed to another worker while it is still running and completes twice
(at-least-once delivery).

## Resuming from outside Mastra

A suspended run waits on a Resonate promise at `<runId>:<2k+1>`, tagged `mastra:runId` and
`mastra:workflowId`. Settling it with a resume request resumes the run, so an approval can
come from any Resonate client or another service. The value is encoded as the Resonate
SDKs encode values (`new Codec().encode(value)` in `@resonatehq/sdk`):

```json
{ "resumeId": "approval-7f3c", "step": "approve", "resumeData": { "approved": true } }
```

The promise settles once. A second resume of the same suspension is refused.
