# Nuabase TypeScript SDK

Nuabase turns LLM prompts and Zod schemas into type-safe functions. Pass a prompt, input data, and a Zod schema; receive validated, typed data back.

Every call runs directly in your process—either against the LLM provider API you choose, using your API keys, or via a local coding agent CLI already installed on your machine (`claude`, `codex`, or `pi`).

**Common use cases:**
- Extract structured fields from free-form text to auto-fill complex forms
- Enrich arrays of items (e.g., adding nutrition facts to a list of foods)
- Classify and tag sales leads with company metadata

---

## Quick Start

### 1. Install

```bash
npm install nuabase zod
```

### 2. Initialize and Call

Configure `Nua.direct()` with an LLM provider API key (or a [local agent](#2-local-coding-agent-nodejs-only)), define your expected Zod schema, and call `get()` or `list()`:

```ts
import { Nua } from 'nuabase';
import { z } from 'zod';

// 1. Initialize client
const nua = Nua.direct({
  providers: { openrouter: { apiKey: process.env.OPENROUTER_API_KEY! } },
});

// 2. Define output schema
const LeadInsights = z.object({
  company_name: z.string(),
  industry: z.string(),
  company_size: z.enum(['SMB', 'Mid-market', 'Enterprise']),
  recommended_follow_up: z.enum(['Call', 'Email', 'Event']),
});

// 3. Prepare input data
const leads = [
  {
    leadId: 'lead-101',
    name: 'Acme Analytics',
    notes: 'Signed up after webinar, growth-stage SaaS, 80 employees. Wants a live demo next week.',
  },
  {
    leadId: 'lead-102',
    name: 'Bright Logistics',
    notes: 'Regional freight operator asking for pricing via email. 12 depots across the Midwest.',
  },
];

// 4. Execute batch request (sends all rows in a single LLM request)
const result = await nua.list(
  'Extract company_name, industry, company_size, and recommended_follow_up from each lead.',
  {
    input: leads,
    primaryKey: 'leadId',
    output: { name: 'leadInsights', schema: LeadInsights },
  }
);

// 5. Access typed output
if (!result.success) {
  throw new Error(result.error);
}

console.log(result.data);
// -> [
//   {
//     leadId: 'lead-101',
//     leadInsights: {
//       company_name: 'Acme Analytics',
//       industry: 'Software',
//       company_size: 'Mid-market',
//       recommended_follow_up: 'Call',
//     },
//   },
//   // ...
// ]
```

---

## Core Methods

### `nua.get(prompt, options?)`

Generates a single value. Omit `options` to receive a plain `string`, or pass an `output` schema for a typed object or primitive.

```ts
// Plain string response
const joke = await nua.get('Tell me a one-line joke');
if (joke.success) console.log(joke.data); // string

// Typed structured response
const address = await nua.get('Extract the postal address', {
  input: 'Ship to 123 Main St, Springfield, IL 62701',
  output: { name: 'address', schema: AddressSchema },
});
if (address.success) console.log(address.data); // z.infer<typeof AddressSchema>
```

**Options:**

* `input?: unknown` – Context or data to include with the prompt.
* `output: { name: string; schema: ZodSchema }` – Identifier and Zod schema for the output.
* `model?: ModelInput` – Override the client's default model for this call.

### `nua.list(prompt, options)`

Processes an array of records in a **single request**. Each returned row carries the `primaryKey` value the model echoed back, next to the output. Rows can come back in a different order than the input, so match them to your input by key.

```ts
const result = await nua.list('Classify each lead', {
  input: leads,
  primaryKey: 'id',
  output: { name: 'classification', schema: ClassificationSchema },
});

if (result.success) {
  result.data.forEach((row) => console.log(row.id, row.classification));
}
```

**Options:**

* `input: Array<Record<string, unknown>>` – Array of objects to process.
* `primaryKey: string` – Unique key on each input object. Each output row carries it, so you can match rows to inputs.
* `output: { name: string; schema: ZodSchema }` – Property name and Zod schema attached to each returned row.
* `model?: ModelInput` – Override the client's default model for this call.

---

## Client Configuration (`Nua.direct`)

`Nua.direct(config)` runs in-process using one of two execution engines: **HTTP Providers** or a **Local Coding Agent**.

### 1. HTTP Providers

Call LLM APIs directly using your own API keys:

```ts
const nua = Nua.direct({
  providers: {
    groq: { apiKey: '...' },
    cerebras: { apiKey: '...' },
    gemini: { apiKey: '...' },
    openrouter: { apiKey: '...' },
    deepseek: { apiKey: '...' },
  },
  model: { alias: 'fast' }, // optional default; defaults to { alias: 'fast' }
});
```

**Specifying Models:**
Models can be set globally on the client or per-call using either a provider-specific model object or an alias. Each alias lists provider models in a fixed order and uses the first one whose provider you supplied an API key for: `{ alias: 'fast' }` tries Cerebras, then Groq, then OpenRouter. If you have a key for none of an alias's providers, the call fails. Some aliases, such as `sonnet`, only go through OpenRouter.

```ts
// Specific provider and model
await nua.get('Extract company name', {
  output: { name: 'companyName', schema: z.string() },
  model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
});

// Provider-agnostic alias
await nua.get('Extract company name', {
  output: { name: 'companyName', schema: z.string() },
  model: { alias: 'fast' },
});
```

### 2. Local Coding Agent (Node.js only)

Run prompts through a coding agent CLI already installed and logged in on your machine (`claude -p`, `codex exec`, or `pi --mode json`). This uses your existing CLI login or subscription—no API key required.

Import helpers from `nuabase/local-agent` (kept at a separate entry point so the main `nuabase` entry point stays free of Node built-ins, which edge runtimes such as Cloudflare Workers or Vercel Edge lack):

```ts
import { Nua } from 'nuabase';
import { localAgent, findLocalAgent, detectLocalAgents } from 'nuabase/local-agent';

// Option A: Target a specific agent
const nua = Nua.direct({
  localAgent: localAgent({ agent: 'claude-code', model: 'haiku' }),
});

// Option B: Automatically pick the first installed & logged-in agent (checks Claude Code first)
const autoNua = Nua.direct({
  localAgent: await findLocalAgent(),
});

// Optional: Inspect available agents on the machine (makes no model calls)
const agents = await detectLocalAgents();
// -> [{ agent: 'claude-code', installed: true, loggedIn: true, version: '...', binaryPath: '...' }, ...]
```

**Agent Functions & Options:**

* `localAgent(config)` – Configures a named agent (`'claude-code' | 'codex' | 'pi'`). Throws immediately if the executable isn't found; fails on the first call if not logged in. Note: Agent lookup happens once at creation.
* `findLocalAgent(options?)` – Checks version and login status across supported CLIs (without making model calls) and resolves to the first ready agent, or rejects if none are available.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `agent` | `'claude-code' \| 'codex' \| 'pi'` | Required for `localAgent()` | Which CLI agent to run. |
| `binaryPath` | `string` | Looked up on `PATH` | Path to executable (`localAgent` only). On Windows, point to a native executable (`.cmd` shims are not supported). |
| `model` | `string` | Agent's default | The agent's own model name for calls that name no model. Claude Code accepts aliases (`'haiku'`, `'sonnet'`, `'opus'`), and so does a per-call `model: { alias }`. Codex and Pi have no aliases: Codex uses its own model names; Pi uses `'provider/id'` (e.g., `'openrouter/z-ai/glm-5.3-flash'`). |
| `timeoutMs` | `number` | `180000` | Maximum execution time per call in milliseconds. |
| `concurrency` | `number` | `2` | Maximum concurrent agent processes. |
| `auth` | `'subscription' \| 'inherit'` | `'subscription'` | `'subscription'` strips env vars like `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` so calls bill your logged-in plan instead of API keys. |
| `logger` | object | `console` | Object with `debug`, `info`, `warn`, and `error` methods for call and retry logs. |

> **Note:** Local agent calls count against your personal subscription limits. Check each vendor's terms before exposing local-agent execution to end users.

---

## Response Format & Error Handling

Every `get()` and `list()` call returns a discriminated union (`result.success`). Every failure of the LLM call itself comes back as `success: false`.

The call rejects (throws) only for invalid arguments, before anything is sent: an empty prompt, a non-array `input`, an empty `primaryKey`, or a Zod schema that JSON Schema can't express (such as `.transform()` or `z.date()`).

### Success (`result.success === true`)

| Field | Type | Description |
| --- | --- | --- |
| `success` | `true` | Request succeeded and passed schema validation. |
| `data` | `T` or `Array<{ [pk]: K } & { [output]: T }>` | Validated output matching your schema. |
| `usage` | `{ promptTokens, completionTokens, totalTokens, promptCacheReadTokens?, promptCacheWriteTokens? }` | Token usage stats (`promptCache*` included when reported by the provider as subsets of `promptTokens`). |
| `model` | `string` | What answered: `provider:model` (e.g., `openrouter:z-ai/glm-5.3-flash`) or `agent:model` (e.g., `claude-code:haiku`; `default` when the agent's model isn't known). |
| `latencyMs` | `number` | Total request duration in milliseconds, including retries. |
| `source` | `'direct'` | Indicates the request executed in-process. |
| `meta` | `DirectMeta` | Execution details (see table below). |

**`DirectMeta` (`result.meta`):**

| Field | Type | Description |
| --- | --- | --- |
| `engine` | `'http' \| 'local-agent'` | Execution engine used. |
| `schemaEnforcement` | `'native' \| 'in-prompt'` | Whether the engine enforced the schema natively or via prompt instructions. The output is validated either way. |
| `provider` | `string` | *(`engine: 'http'` only)* LLM provider name. |
| `agent` | `'claude-code' \| 'codex' \| 'pi'` | *(`engine: 'local-agent'` only)* Local agent CLI used. |
| `model` | `string \| undefined` | The provider's model, or the model the agent reported or was asked for (`undefined` when neither is known). |
| `costUsdEstimate` | `number \| undefined` | *(`engine: 'local-agent'` only)* The CLI's estimated API cost (does not reflect subscription billing). |

### Error (`result.success === false`)

| Field | Type | Description |
| --- | --- | --- |
| `success` | `false` | Request failed (see retries below). |
| `error` | `string` | Error description. |
| `source` | `'direct'` | Indicates the request executed in-process. |
| `latencyMs` | `number` | Time elapsed until failure in milliseconds. |

> **💡 Tip: Maximize Prompt Caching**
> Keep your `prompt` string static across calls and pass dynamic values via `input`. Nuabase places the prompt and schema at the beginning of the payload so providers can cache that prefix. Cache reads are heavily discounted—whereas on providers like Claude, changing the prompt prefix on every call incurs a 25% cache-write premium without ever getting a cache hit.

---

## How It Works Under the Hood

Each `get()` or `list()` call converts your Zod schema to JSON Schema, sends it alongside your prompt and input data, and validates the returned payload against that JSON Schema. Zod checks that JSON Schema can't express, such as `.refine()`, are not applied.

Transient errors and outputs that fail validation are **automatically retried up to 2 times**. Fatal errors fail at once: a bad API key, an agent that isn't logged in, an exhausted quota, a timeout, or a model none of your providers serves.

### HTTP Provider Endpoints

When using `Nua.direct({ providers })`, your process makes 1 HTTPS request per call (plus up to 2 retries) directly to the selected provider:

| Provider | Endpoint |
| --- | --- |
| **Groq** | `https://api.groq.com/openai/v1/chat/completions` |
| **Cerebras** | `https://api.cerebras.ai/v1/chat/completions` |
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **OpenRouter** | `https://openrouter.ai/api/v1/chat/completions` |
| **DeepSeek** | `https://api.deepseek.com/chat/completions` |

OpenRouter is itself a router: it forwards each request to a provider that hosts the model.

### Local Agent Sandboxing & Schema Handling

When using `Nua.direct({ localAgent })`, each call spawns the CLI in a fresh, empty temporary directory with all tools, project settings, and MCP servers disabled.

* **Schema wrapping:** Because agent CLIs require a top-level object, Nuabase wraps your schema as `{ value: ... }` and passes it to the CLI's schema flag.
* **Fallback to in-prompt schemas:**
  * **Codex** only accepts OpenAI strict-mode schemas; schemas with optional properties or open-ended objects are injected into the prompt instead.
  * **Pi** has no native schema flag, so schemas are always described in the prompt.
  * If any agent rejects a native schema flag, Nuabase automatically retries with the schema injected into the prompt. The output is validated against the JSON Schema either way.

---

## Resources & Community

* **Documentation:** [docs.nuabase.com](https://docs.nuabase.com)
* **Testing Guide:** [TESTING.md](TESTING.md)
* **Support:** [hello@nuabase.com](mailto:hello@nuabase.com) | [@NuabaseHQ on X](https://x.com/NuabaseHQ)
* **Credits:** Package template based on [rtivital/ts-package-template](https://github.com/rtivital/ts-package-template)
* **License:** MIT
