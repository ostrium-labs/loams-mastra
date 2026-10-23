---
'@loams/mastra-acp': minor
---

First release: `serveAcp(agent)` serves a Mastra agent over the Agent Client Protocol on stdio. Sessions are Mastra threads, text and tool calls stream as ACP session updates, a `requireApproval` tool becomes `session/request_permission`, and `session/cancel` aborts the stream.
