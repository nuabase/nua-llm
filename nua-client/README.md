## Nuabase TypeScript SDK

Nuabase turns LLM prompts into type-safe functions in under five lines of code.

With Nuabase, you write a prompt, specify the output schema, and get back a well-typed function. You can invoke it with input data, like any other code in your application, and receive data that matches the exact schema you specified.

Example use-cases:

- Provide free-form text input for faster filling of complex HTML forms
- Enrich a list of food items with nutrition facts
- Tag sales leads with more details about the company

This package runs every call in your own process: on LLM providers' APIs with your own API keys, or on a coding agent already installed on your machine (Claude Code, Codex or Pi). It never sends anything to Nuabase; see [Where your data goes](#where-your-data-goes). All outputs are validated against the schema you specified.

The hosted Nuabase API, with row-level caching, async jobs delivered by webhook or SSE, and request logs in the [Nuabase Console](https://console.nuabase.com), has its own client: [`@nuabase/gateway`](https://www.npmjs.com/package/@nuabase/gateway).

## Usage at a glance

**1. Input.** Start with the data you want to send to the LLM:

```ts
const leads = [{ id: 'lead-101', notes: 'Growth-stage SaaS, ~80 employees, wants a demo.' }];
```

**2. Desired shape.** Describe the structure you expect back:

```ts
const LeadInsights = z.object({
  industry: z.string(),
  company_size: z.enum(['SMB', 'Mid-market', 'Enterprise']),
});
```

**3. Call the API.** Use `list()` for array operations:

```ts
const nua = Nua.direct({ providers: { openrouter: { apiKey: 'YOUR_OPENROUTER_KEY' } } });

const result = await nua.list('Classify each lead with industry and company_size bucket.', {
  input: leads,
  primaryKey: 'id',
  output: { name: 'leadInsights', schema: LeadInsights },
});
```

**4. Use the result.** Check for success and access typed data:

```ts
if (!result.success) throw new Error(result.error);
console.log(result.data[0].leadInsights);
// -> { industry: 'Software', company_size: 'Mid-market' }
```

## Quick Start

1. Add the Nuabase SDK along with Zod:

```bash
npm install nuabase zod
```

2. Get an API key from one of the supported LLM providers (Groq, Cerebras, Gemini, OpenRouter or DeepSeek) and pass it to `Nua.direct({ providers })`. Or, in Node.js, use a coding agent that is installed and logged in on your machine, with no API key: see [Constructors](#constructors).

## Lead Enrichment Example

```ts
import { Nua } from 'nuabase';
import { z } from 'zod';

const nua = Nua.direct({ providers: { openrouter: { apiKey: process.env.OPENROUTER_API_KEY! } } });

const LeadInsights = z.object({
  company_name: z.string(),
  industry: z.string(),
  company_size: z.enum(['SMB', 'Mid-market', 'Enterprise']),
  recommended_follow_up: z.enum(['Call', 'Email', 'Event']),
});

const rows = [
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
  {
    leadId: 'lead-103',
    name: 'Nimbus Retail',
    notes:
      'Enterprise retailer. Mentioned they will send the procurement team to our booth at NRF.',
  },
];

const response = await nua.list(
  'Summarize each inbound lead by extracting company_name, industry, company_size bucket (SMB, Mid-market, Enterprise), and the recommended_follow_up channel (Call, Email, or Event) based on their notes.',
  {
    input: rows,
    primaryKey: 'leadId',
    output: { name: 'leadInsights', schema: LeadInsights },
  }
);

if (!response.success) {
  console.error(response.error);
  return;
}

response.data.forEach(({ leadId, leadInsights }) => {
  // leadInsights satisfies the LeadInsights schema
  console.log(leadId, leadInsights.company_name, leadInsights.industry, leadInsights.company_size);
});

console.log(response.data);
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
// ];
```

## Where your data goes

Your prompt, input data and output schema go only to the engine you configure:

- With `providers`, to the APIs of the LLM providers you gave keys for, called directly from your process.
- With `localAgent`, to the coding-agent CLI on your machine, which sends them on to its own vendor under your login.

Nothing goes to Nuabase. This package contains no code that calls the Nuabase API, and its build fails if any appears. To use the hosted Nuabase API, install [`@nuabase/gateway`](https://www.npmjs.com/package/@nuabase/gateway).

Zod schemas compile to JSON Schema, and the SDK validates every response against it before you see it.

## API Response

Every call returns a discriminated union. When `success` is `false`, you get an error object. Otherwise `success` is `true`, and `data` contains your typed output along with metadata.

**Success**

| Field       | Type                                                                  | Description                                        |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `success`   | `true`                                                                | Indicates that the request completed successfully. |
| `data`      | `T` (for `get`) or `Array<{ [pk]: value; [output]: T }>` (for `list`) | The typed result matching your schema.             |
| `usage`     | `{ promptTokens, completionTokens, totalTokens }`                     | Token usage statistics for the LLM request.        |
| `model`     | `string`                                                              | The LLM model used for this request.               |
| `latencyMs` | `number`                                                              | Request latency in milliseconds.                   |
| `source`    | `'direct'`                                                            | The request ran in this process.                   |
| `meta`      | `object`                                                              | Which engine answered; see below.                  |

`usage` also has `promptCacheReadTokens` and `promptCacheWriteTokens` when the provider reports them: prompt tokens it read from or wrote to its prompt cache. They are part of `promptTokens`. Cache reads are billed at a steep discount, so keep `prompt` the same on every call of a cast and pass anything that varies in `data`: the prompt and schema come first in what the model sees, and providers cache that repeated start. On Claude, a cast whose prompt never repeats pays a 25% premium on it.

**Metadata** (`meta`):

| Field               | Type                         | Description                                                                                               |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `engine`            | `'http'` \| `'local-agent'`  | Whether an LLM provider's API or a coding agent on this machine answered.                                 |
| `schemaEnforcement` | `'in-prompt'` \| `'native'`  | Whether the schema was described in the prompt or enforced by the engine. Output is validated either way. |
| `provider`          | `string`                     | `engine: 'http'` only. The LLM provider.                                                                  |
| `agent`             | `'claude-code'` \| `'codex'` \| `'pi'` | `engine: 'local-agent'` only. Which coding agent answered.                                                |
| `costUsdEstimate`   | `number \| undefined`        | `engine: 'local-agent'` only. The agent's own estimate. On a subscription this is not what you pay.       |

**Error**

| Field       | Type                      | Description                         |
| ----------- | ------------------------- | ----------------------------------- |
| `success`   | `false`                   | Indicates the request failed.       |
| `error`     | `string`                  | Message describing the error.       |
| `source`    | `'direct'`                | The request ran in this process.    |
| `latencyMs` | `number`                  | Time until failure in milliseconds. |

## SDK API

### Constructors

**`Nua.direct(config)`**
Creates a client that runs casts in this process. It runs on one of two kinds of engine, chosen by the config.

With API keys for LLM providers:

- `providers: { groq?: { apiKey: string }, cerebras?: { apiKey: string }, gemini?: { apiKey: string }, openrouter?: { apiKey: string }, deepseek?: { apiKey: string } }` – Provider credentials.
- `model?: ModelInput` – Optional default model. Omit it to use `{ alias: 'fast' }`.

Model inputs are objects, not provider-prefixed strings:

```ts
await nua.get('Extract the company name', {
  output: { name: 'companyName', schema: z.string() },
  model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
});

await nua.get('Extract the company name', {
  output: { name: 'companyName', schema: z.string() },
  model: { alias: 'fast' },
});
```

With a coding agent on this machine (Node.js only):

- `localAgent: LocalAgent` – Created with `localAgent()` or `findLocalAgent()` from `nuabase/local-agent`.

```ts
import { Nua } from 'nuabase';
import { detectLocalAgents, findLocalAgent, localAgent } from 'nuabase/local-agent';

const nua = Nua.direct({ localAgent: localAgent({ agent: 'claude-code', model: 'haiku' }) });

// Or use the first agent that is installed and logged in:
const auto = Nua.direct({ localAgent: await findLocalAgent() });

const agents = await detectLocalAgents();
// [{ agent: 'claude-code', installed: true, loggedIn: true, version: '...', binaryPath: '...' }, ...]
```

This runs a coding-agent CLI already installed and logged in on this machine, in its headless mode (`claude -p`, `codex exec`, or `pi --mode json`). Calls use the user's own logged-in subscription or provider login, so no API key is needed. `get()` and `list()` behave as with providers: the output is validated against your schema and typed the same way. `nuabase/local-agent` is a separate entry point so that browser bundles of `nuabase` never include it.

The agent is set up once, when you create it. If you install an agent or log in after that, create a new one.

**`localAgent(config)`** sets up a named agent. It throws right away if the agent's executable cannot be found; if the agent is not logged in, the first call fails with that error.

- `agent: 'claude-code' | 'codex' | 'pi'`
- `binaryPath?: string` – Path to the agent executable. Defaults to looking it up on `PATH`. On Windows, point this at a native executable; `.cmd` shims are not supported.
- and the options below.

**`findLocalAgent(options?)`** returns a promise of the first agent that is installed and logged in, trying Claude Code first. It rejects when there is none. Checking runs each CLI's version and login-status commands, which make no model calls.

Options for both:

- `model?: string` – The agent's own model name, e.g. `'haiku'` for Claude Code, for calls that name no model. Defaults to the agent's default. Per-call `model: { alias }` works for aliases the agent understands (`haiku`, `sonnet`, `opus` for Claude Code). Codex and Pi have no aliases: pass one of their own model names, and for Pi a `provider/id` name such as `'openrouter/z-ai/glm-5.3-flash'`.
- `timeoutMs?: number` – Per-call limit. Defaults to `180000`.
- `concurrency?: number` – Maximum agent processes at once. Defaults to `2`.
- `auth?: 'subscription' | 'inherit'` – `subscription` (default) hides `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and similar variables from the agent so it bills the logged-in plan rather than an API key.
- `logger?` – An object with `debug`, `info`, `warn` and `error` methods, where calls and retries are logged. Defaults to the console.

How it works: each call runs the agent in a fresh, empty temporary directory with its tools, project settings and MCP servers turned off. The schema is wrapped as `{ value: ... }` (the agents require an object at the top level) and passed to the agent's own schema option. Codex only accepts OpenAI strict-mode schemas, so a schema with optional properties or open-ended objects is instead described in the prompt, and the output is validated as usual. Pi has no schema flag at all, so its schemas are always described in the prompt. If an agent rejects a schema, the call is retried with the schema in the prompt. `maxTokens` has no CLI equivalent and is ignored. Calls count against the user's plan limits; check each vendor's terms before offering this to other users.

### Methods

**`nua.get(prompt)`**
Returns a simple string response from the LLM.

```ts
const result = await nua.get('Tell me a joke');
if (result.success) console.log(result.data); // string
```

**`nua.get(prompt, options)`**
Returns a typed single value. Parameters:

- `prompt: string` – Natural-language instructions sent to the LLM.
- `options.input?: unknown` – Optional input data to include in the prompt.
- `options.output: { name: string; schema: ZodSchema }` – Output name and Zod schema.

```ts
const result = await nua.get('Extract the address', {
  input: '123 Main St, Springfield, IL 62701',
  output: { name: 'address', schema: AddressSchema },
});
if (result.success) console.log(result.data); // typed as z.infer<typeof AddressSchema>
```

**`nua.list(prompt, options)`**
Processes an array of items. Parameters:

- `prompt: string` – Natural-language instructions for each item.
- `options.input: Array<Record<string, unknown>>` – Rows to process.
- `options.primaryKey: string` – Field that uniquely identifies each row.
- `options.output: { name: string; schema: ZodSchema }` – Output configuration.

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

## Migrating from 2.x

Version 3 removed gateway mode. `Nua.direct()`, `get()` and `list()` are unchanged.

If you used `Nua.gateway()`, `queueGet()` or `queueList()`, install [`@nuabase/gateway`](https://www.npmjs.com/package/@nuabase/gateway) and replace `Nua.gateway(config)` with `new NuaGateway(config)`:

```ts
import { NuaGateway } from '@nuabase/gateway';

const nua = new NuaGateway({ apiKey: 'YOUR_API_KEY' });
```

Its `get()`, `list()`, `queueGet()` and `queueList()` take the same arguments. Their results always have `source: 'gateway'`, and `queueGet()` and `queueList()` now return the queued request's id as `jobId`, which was `undefined` before. Import `GatewayConfig`, `GatewayMeta` and `QueueResult` from `@nuabase/gateway` as well.

## Next Steps

- Read the full docs at https://docs.nuabase.com.
- For row-level caching, async jobs and request logs, use the hosted Nuabase API through [`@nuabase/gateway`](https://www.npmjs.com/package/@nuabase/gateway).

## Support

Email us at [hello@nuabase.com](mailto:hello@nuabase.com). On X at [@NuabaseHQ](x.com/NuabaseHQ).

## Tests

See [TESTING.md](TESTING.md)

## Credits

The template for this package comes from https://github.com/rtivital/ts-package-template

## License

MIT
