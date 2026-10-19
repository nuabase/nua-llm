---
"@nuabase/gateway": major
---

First release. `NuaGateway` is the client for the hosted Nuabase API, which was `Nua.gateway()` in `nuabase` 2.x: `new NuaGateway(config)` has the same `get()`, `list()`, `queueGet()` and `queueList()`. `queueGet()` and `queueList()` now return the queued request's id as `jobId`; `Nua.gateway()` returned it as `undefined`.
