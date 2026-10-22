---
"nuabase": patch
---

Type declarations now resolve under every module resolution, including `node16`/`nodenext` from ES modules and CommonJS, where nuabase's exports used to type as `any`. Each entry point ships one self-contained `.d.mts` and `.d.cts`, bundled by the same build as the JavaScript. `LlmProviderId` and `Logger` are now exported. The ES module build imports Node's built-ins directly instead of through `createRequire`.
