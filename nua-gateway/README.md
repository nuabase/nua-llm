## Nuabase Gateway

The TypeScript client for the hosted Nuabase API. Nuabase turns LLM prompts into type-safe functions in under five lines of code. Set up your free account at [Nuabase](https://nuabase.com).

You write a prompt, specify the output schema, and get back a well-typed function. You can invoke it with input data, like any other code in your application, and receive data that matches the exact schema you specified.

Example use-cases:

- Provide free-form text input for faster filling of complex HTML forms
- Enrich a list of food items with nutrition facts
- Tag sales leads with more details about the company

**Every call sends its prompt, input data and output schema to the Nuabase API**, which runs the LLM request and returns the result. Nuabase can also run requests as async jobs and, once ready, call your server with the results using webhooks, or stream them to your front-end using SSE. You can see all requests and responses as they happen in the [Nuabase Console](https://console.nuabase.com). All outputs are validated against the schema you specified.

One major reason I built Nuabase is the need for granular, row-level caching. For example, let's say you want to classify your bank transaction entries, and map them to your chart of accounts. With Nuabase's row-level caching, it will only send new entries to the LLM. Any specific entry that it has seen before will be returned from the cache. This also means you can make LLM requests multiple times with identical values, and after the first time, they will return immediately without needing to go through the LLM.

To run casts in your own process instead, on LLM providers with your own keys or on a coding agent on your machine, with nothing sent to Nuabase, use [`nuabase`](https://www.npmjs.com/package/nuabase).

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
const nua = new NuaGateway({ apiKey: 'YOUR_API_KEY' });

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

1. Add the client along with Zod:

```bash
npm install @nuabase/gateway zod
```

2. Get your API key from the [Nuabase Console](https://console.nuabase.com/dashboard/api-keys/new).

3. Set the `NUABASE_API_KEY` environment variable, or pass it directly in `new NuaGateway({ apiKey: 'KEY' })`.

## Lead Enrichment Example

```ts
import { NuaGateway, z } from '@nuabase/gateway';

const nua = new NuaGateway({ apiKey: 'API-KEY' });

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
```

`list()` and `get()` wait for completion and return the full result. Use `queueList()` or `queueGet()` to submit an asynchronous job instead, and receive the result by webhook or SSE.

## Why Nuabase

- Type-safe from prompt to runtime: Zod schemas compile to JSON Schema, and every response is validated before you see it.
- Zero glue code: Nuabase runs the queueing, retries, webhooks, SSE streaming, and polling so your application code stays clean.
- Built-in performance: granular caching, cost attribution, and usage metrics come for free on every request.
- Production visibility: every run shows up in the Nuabase dashboard with logs, prompt/response history, and tracing ids.

## In the browser

Your API key is a secret, so do not put it in front-end code. In the browser, pass `fetchToken` instead: a function that gets a short-lived token from your own server, which signs it with your Nuabase signing key.

```ts
const nua = new NuaGateway({
  fetchToken: async () => {
    const res = await fetch('/api/nua-token');
    if (!res.ok) throw new Error('Token fetch failed');
    return (await res.json()).token;
  },
});
```

The client calls `fetchToken` on its first request and reuses the token after that. See the [frontend integration guide](https://docs.nuabase.com) for the server side.

## API Response

Every call returns a discriminated union. When `success` is `false`, you get an error object. Otherwise `success` is `true`, and `data` contains your typed output along with metadata.

**Success**

| Field       | Type                                                                  | Description                                        |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `success`   | `true`                                                                | Indicates that the request completed successfully. |
| `data`      | `T` (for `get`) or `Array<{ [pk]: value; [output]: T }>` (for `list`) | The typed result matching your schema.             |
| `usage`     | `{ promptTokens, completionTokens, totalTokens }`                     | Tokens of the LLM call plus those served from cache. |
| `model`     | `string`                                                              | The LLM model used for this request.               |
| `latencyMs` | `number`                                                              | Request latency in milliseconds.                   |
| `source`    | `'gateway'`                                                           | The Nuabase API processed the request.             |
| `meta`      | `object`                                                              | See below.                                         |

`usage` also has `promptCacheReadTokens` and `promptCacheWriteTokens` when the provider reports them: prompt tokens it read from or wrote to its prompt cache. They are part of `promptTokens`.

**Metadata** (`meta`):

| Field        | Type      | Description                               |
| ------------ | --------- | ----------------------------------------- |
| `requestId`  | `string`  | Unique identifier for tracing.            |
| `cached`     | `boolean` | Whether the result was served from cache. |
| `llmUsage`   | `object`  | Token usage from LLM calls.               |
| `cacheUsage` | `object`  | Token usage served from cache.            |

**Error**

| Field       | Type        | Description                         |
| ----------- | ----------- | ----------------------------------- |
| `success`   | `false`     | Indicates the request failed.       |
| `error`     | `string`    | Message describing the error.       |
| `source`    | `'gateway'` | The Nuabase API returned the error. |
| `latencyMs` | `number`    | Time until failure in milliseconds. |

## API

**`new NuaGateway(config?)`**

- `apiKey?: string` – API key for authentication. Defaults to `process.env.NUABASE_API_KEY` in Node.js. In a browser it throws, unless `dangerouslyAllowBrowserApiKeyInLocalhost` is set and the page is on `localhost` or `127.0.0.1`, or `NODE_ENV` is `development`.
- `fetchToken?: () => Promise<string>` – Returns a token from your server; use it instead of `apiKey` in browsers.
- `baseUrl?: string` – Override the API host. Defaults to `process.env.NUABASE_API_URL` in Node.js, then `https://api.nuabase.com`.

**`nua.get(prompt)`** returns a string response from the LLM.

**`nua.get(prompt, options)`** returns a typed single value:

- `prompt: string` – Natural-language instructions sent to the LLM.
- `options.input?: unknown` – Optional input data to include in the prompt.
- `options.output: { name: string; schema: ZodSchema }` – Output name and Zod schema.
- `options.model?: ModelInput` – `{ provider, model }` or `{ alias }`, e.g. `{ alias: 'fast' }`.

**`nua.list(prompt, options)`** processes an array of items:

- `prompt: string` – Natural-language instructions for each item.
- `options.input: Array<Record<string, unknown>>` – Rows to process.
- `options.primaryKey: string` – Field that uniquely identifies each row.
- `options.output: { name: string; schema: ZodSchema }` – Output configuration.
- `options.model?: ModelInput`

**`nua.queueGet(prompt, options?)`** submits an async job for a single value. Returns `{ success: true, jobId }`.

**`nua.queueList(prompt, options)`** submits an async job for an array. Returns `{ success: true, jobId }`.

## Migrating from `nuabase` 2.x

In `nuabase` 2.x this client was `Nua.gateway()`. Install this package and replace `Nua.gateway(config)` with `new NuaGateway(config)`, imported from `@nuabase/gateway`. The methods take the same arguments. `GatewayConfig`, `GatewayMeta`, `QueueResult` and `CastResult` are exported from here.

Two things changed in the results:

- `source` is always `'gateway'`, so comparing it with `'direct'` no longer type-checks.
- `queueGet()` and `queueList()` return the queued request's id as `jobId`. In 2.x it was `undefined`.

## Support

Email us at [hello@nuabase.com](mailto:hello@nuabase.com). On X at [@NuabaseHQ](x.com/NuabaseHQ).

## Tests

See [TESTING.md](TESTING.md)

## License

MIT
