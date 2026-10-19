---
"nuabase": major
---

`nuabase` no longer sends anything to the Nuabase API. It only runs casts in your process, on LLM providers' APIs with your keys (`Nua.direct({ providers })`) or on a coding agent on your machine (`Nua.direct({ localAgent })`). The client for the hosted Nuabase API is now its own package, `@nuabase/gateway`.

Removed: `Nua.gateway()`, `nua.queueGet()`, `nua.queueList()`, and the `GatewayConfig`, `GatewayMeta` and `QueueResult` types. A result's `source` is now always `'direct'`.

Also removed: the `LlmBackend`, `CastValueParams` and `CastArrayParams` types. `Nua`'s constructor is private, so nothing could implement or pass them.

`nuabase` now needs Node.js 18 or later (it said `>=16.6.0`), for the global `fetch` it calls LLM providers with.

To keep using the Nuabase API, install `@nuabase/gateway` and replace `Nua.gateway(config)` with `new NuaGateway(config)`, imported from `@nuabase/gateway`. `get()`, `list()`, `queueGet()` and `queueList()` take the same arguments as before, and the gateway types are exported from there. Their results always have `source: 'gateway'`, and `queueGet()` and `queueList()` now return the queued request's id as `jobId`, which was `undefined` before.
