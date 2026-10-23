---
'@loams/mastra-resonate': patch
---

`run.restart()` restarts a run from its snapshot. A finished run is returned as it finished, and a run whose durable execution is still on the Resonate server is refused with a `RESONATE_ENGINE_RESTART_ACTIVE_ROOT` error instead of racing it. A restart that finds a nested workflow suspended, or claimed for a resume whose step never started, resumes it, as the default engine does.
