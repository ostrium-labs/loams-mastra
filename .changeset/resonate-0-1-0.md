---
'@loams/mastra-resonate': minor
---

First release: a Mastra workflow execution engine on any Resonate server (Loams Durable included). Steps are memoised in durable promises and recover after a crash. Sleeps are durable timers, retries follow Mastra's `retryConfig`, and suspended runs resume by settling a durable promise. Nested workflows, `cancel()`, and `stream()`/`watch()` through Mastra's PubSub are included.
