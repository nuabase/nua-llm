---
"nuabase": major
---

`nuabase` now only runs casts in your process, on LLM providers' APIs with your keys (`Nua.direct({ providers })`) or on a coding agent on your machine (`Nua.direct({ localAgent })`).

Removed: `Nua.gateway()`, `nua.queueGet()`, `nua.queueList()`, and the `GatewayConfig`, `GatewayMeta` and `QueueResult` types. A result's `source` is now always `'direct'`.

Also removed: the `LlmBackend`, `CastValueParams` and `CastArrayParams` types. `Nua`'s constructor is private, so nothing could implement or pass them.

`nuabase` now needs Node.js 18 or later (it said `>=16.6.0`), for the global `fetch` it calls LLM providers with.
