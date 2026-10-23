# nuabase

## 3.0.0

### Major Changes

- be95150: `nuabase` now only runs casts in your process, on LLM providers' APIs with your keys (`Nua.direct({ providers })`) or on a coding agent on your machine (`Nua.direct({ localAgent })`).
  
  Removed: `Nua.gateway()`, `nua.queueGet()`, `nua.queueList()`, and the `GatewayConfig`, `GatewayMeta` and `QueueResult` types. A result's `source` is now always `'direct'`.
  
  Also removed: the `LlmBackend`, `CastValueParams` and `CastArrayParams` types. `Nua`'s constructor is private, so nothing could implement or pass them.
  
  `nuabase` now needs Node.js 18 or later (it said `>=16.6.0`), for the global `fetch` it calls LLM providers with.

### Minor Changes

- 9ed74c9: `nuabase/local-agent` can now start an interactive coding-agent session in the user's project, for the user to carry on in a terminal: `startAgentSession()` writes the first message and a shell launcher that starts Claude Code, Codex or Pi on it (in the agent's auto mode with `approval: 'auto'`), and on macOS opens it in a new terminal window. It answers with what it did: `opened`, `command` (the user runs it in a terminal), `open_failed` (the files are written but the window didn't open, with the error) or `refused` with the reason. `agentSessionMode()` says beforehand which of these the platform allows.
- 61eaba5: A failed cast now says why on its own: `reason` is the last attempt's failure in the engine's own words (a coding agent's or provider's message, fit to show a user), and `attempts` is how many were made (0 when the request was refused before any). `error` stays the one-line summary for logs. Coding-agent failures no longer prefix the agent's name (`claude: `) to its message, and Codex's API errors are reported by their message instead of as JSON.
- 5028584: DeepSeek is now a direct provider: pass `providers: { deepseek: { apiKey } }` and name a DeepSeek model such as `deepseek-flash` or `deepseek-v4-pro`. DeepSeek requests run with thinking turned off, and schemas are described in the prompt because DeepSeek has no strict structured outputs. A new `deepseek` alias uses DeepSeek V4 Pro, directly or through OpenRouter.
  
  The model aliases now point at current models: `gemini` → Gemini 3.8 Flash, `qwen` → Qwen3.8 2.4T A95B, `kimi` → Kimi K3, `sonnet` → Claude Sonnet 5.5, `opus` → Claude Opus 5.5, `gpt` → GPT-6.1 Sol, and the OpenRouter fallback for `fast` → GLM-5.3 Flash.
- 25569d9: Local agents take an `effort` option (`'low' | 'medium' | 'high'`), passed to the CLI's own setting: Claude Code `--effort`, Codex `model_reasoning_effort`, Pi `--thinking`. Left out, the CLI's default applies. Codex casts no longer run at low reasoning effort unless you ask for it with `effort: 'low'`.
- 25569d9: `LocalAgent.with({ model, effort, timeoutMs })` gives the same agent with other call options, sharing its executable, environment, logger and `concurrency` limit. One `localAgent()` per CLI can now serve casts on several of its models, such as Codex models that have no alias, without each getting its own limit on processes running at once.
- 449e580: `usage` now reports `promptCacheReadTokens` and `promptCacheWriteTokens` when the provider does: the prompt tokens it read from or wrote to its prompt cache. They are part of `promptTokens`. Reported for OpenRouter, DeepSeek and Gemini, and for the Claude Code, Codex and Pi local agents.
- 3abfeee: Casts and agents now make use of provider prompt caching. Claude on OpenRouter caches the prompt, instructions and schema of a cast, so repeat calls of the same cast read them at about a tenth of the price, and agent turns read the conversation the previous turn sent. Casts through OpenRouter stay on one upstream provider, so models that cache automatically (DeepSeek, GLM, Kimi, GPT) reuse it too.
- 4f38416: Results are now parsed with your Zod schema instead of being checked against its JSON Schema with AJV. `data` is Zod's parsed output: `.default()`s are filled in, `.transform()`s run, `.refine()` checks apply (a failing answer is retried), and unknown object keys are dropped. The JSON Schema shown to the model now describes the schema's input side, so schemas with `.transform()` no longer throw. AJV is no longer bundled.

### Patch Changes

- b9b5da9: Type declarations now resolve under every module resolution, including `node16`/`nodenext` from ES modules and CommonJS, where nuabase's exports used to type as `any`. Each entry point ships one self-contained `.d.mts` and `.d.cts`, bundled by the same build as the JavaScript. `LlmProviderId` and `Logger` are now exported. The ES module build imports Node's built-ins directly instead of through `createRequire`.
- dec76aa: Schemas with `$ref`s, such as those using `.meta({ id })` or recursive schemas, now work with native schema enforcement. The schema sent to the engine had refs that pointed nowhere, so engines either rejected it or did not enforce it.
- 267e07a: Tool-calling agents on Gemini 3 models now work: Gemini's thought signatures are sent back with each function call, which Gemini 3 and later require.
- 3bbdc4c: `list()` rows are typed by the output's name when it is a literal: with `output: { name: 'account', schema: z.string() }`, each row is `{ id: string | number; account: string }` instead of a row whose every field has the output's type.

## 2.3.11

### Patch Changes

- Ship the changelog in the npm package

## 2.3.10

### Patch Changes

- 0303881: The "fast" model alias now uses `openai/gpt-oss-120b` on Groq instead of the preview `qwen/qwen3.8-27b`. On Groq models that support strict structured outputs, casts now enforce the output schema natively instead of describing it in the prompt.

## 2.3.9

### Patch Changes

- Format the release script with Prettier

## 2.3.8

### Patch Changes

- Publish the packed tarball with npm, so 2FA is approved in the browser
  Release nuabase through changesets and the release train
