# @loams/mastra-acp

Serve a [Mastra](https://mastra.ai) agent over the [Agent Client Protocol](https://agentclientprotocol.com)
(ACP), so that ACP clients run it as a coding-agent harness: Loams Studio (through
`loams-agentd`), Zed, or any other client.

Status: preview.

```sh
npm install @loams/mastra-acp @mastra/core
```

```ts
import { Agent } from '@mastra/core/agent';
import { serveAcp } from '@loams/mastra-acp';

const agent = new Agent({ id: 'helper', name: 'Helper', instructions: '…', model: 'openai/gpt-5' });
await serveAcp(agent); // stdin/stdout, until the client closes the connection
```

| ACP | Mastra |
| --- | --- |
| `session/new` | a thread: thread id = the session id, resource = the session's `cwd` (or `resource(params)`) |
| `session/prompt` | `agent.stream` on that thread (with the agent's memory, or a per-session history when it has none) |
| `agent_message_chunk`, `agent_thought_chunk` | `text-delta`, `reasoning-delta` |
| `tool_call`, `tool_call_update` | `tool-call`, `tool-result`, `tool-error` |
| `session/request_permission` | a `tool-call-approval` chunk (a tool with `requireApproval`); allow → `agent.approveToolCall`, decline → `agent.declineToolCall` |
| `session/cancel` | aborts the stream; the prompt ends `cancelled` |

Approvals resume a suspended run, so register the agent with a `Mastra` instance that has
storage. The bridge reads no environment and holds no credential.

Options: `resource(params)`, `toolKind(toolName)` (the ACP tool kind, `other` by default),
`agentInfo`, `maxApprovals`. `connectAcp(agent, stream)` takes any ACP `Stream` instead of
stdio.

Apache-2.0.
