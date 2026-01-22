## Nuabase TypeScript SDK

Nuabase turns LLM prompts into type-safe functions in under five lines of code. Set up your free account now at [Nuabase](https://nuabase.com).

With Nuabase, you write a prompt, specify the output schema, and get back a well-typed function. You can invoke it with input data, like any other code in your application, and receive data that matches the exact schema you specified.

Example use-cases:

- Provide free-form text input for faster filling of complex HTML forms
- Enrich a list of food items with nutrition facts
- Tag sales leads with more details about the company

Behind the scenes, Nuabase runs the LLM transformation as async jobs, and once ready, call your server API with the results using Webhooks. It can also stream the result directly to your front-end using SSE. You can also see all requests and responses as they happen in the [Nuabase Console](https://console.nuabase.com). All outputs are guaranteed to match the schema you specified.

One major reason I built Nuabase is the need for granular, row-level caching. For example, let's say you want to classify your bank transaction entries, and map them to your chart of accounts. With Nuabase's row-level caching, it will only send new entries to the LLM. Any specific entry that it has seen before will be returned from the cache. This also means you can make LLM requests multiple times with identical values, and after the first time, they will return immediately without needing to go through the LLM.

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
const nua = Nua.gateway({ apiKey: 'YOUR_API_KEY' });

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

2. Get your API key from the [Nuabase Console](https://console.nuabase.com/dashboard/api-keys/new).

3. Set `NUABASE_API_KEY` environment variable, or pass it directly in `Nua.gateway({ apiKey: "KEY" })`:

## Lead Enrichment Example

```ts
import { Nua } from 'nuabase';
import { z } from 'zod';

const nua = Nua.gateway({ apiKey: 'API-KEY' });

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

The default invocation waits for completion and returns the full result. Use `nua.queueList()` to submit an asynchronous job and receive streaming updates via SSE.

## Why Nuabase

- Type-safe from prompt to runtime: Zod schemas compile to JSON Schema, and the SDK re-validates every response before you see it.
- Zero glue code: Nuabase runs the queueing, retries, webhooks, SSE streaming, and polling so your application code stays clean.
- Built-in performance: granular caching, cost attribution, and usage metrics come for free on every request.
- Production visibility: every run shows up in the Nuabase dashboard with logs, prompt/response history, and tracing ids.

## API Response

Every call returns a discriminated union. When `success` is `false`, you get an error object. Otherwise `success` is `true`, and `data` contains your typed output along with metadata.

**Success**

| Field       | Type                                                      | Description                                             |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `success`   | `true`                                                    | Indicates that the request completed successfully.      |
| `data`      | `T` (for `get`) or `Array<{ [pk]: value; [output]: T }>` (for `list`) | The typed result matching your schema.    |
| `usage`     | `{ promptTokens, completionTokens, totalTokens }`         | Token usage statistics for the LLM request.             |
| `model`     | `string`                                                  | The LLM model used for this request.                    |
| `latencyMs` | `number`                                                  | Request latency in milliseconds.                        |
| `source`    | `'gateway'` \| `'direct'`                                 | Which backend processed the request.                    |
| `meta`      | `object`                                                  | Additional metadata (varies by source).                 |

**Gateway-specific metadata** (`meta` when `source` is `'gateway'`):

| Field        | Type      | Description                                    |
| ------------ | --------- | ---------------------------------------------- |
| `requestId`  | `string`  | Unique identifier for tracing.                 |
| `cached`     | `boolean` | Whether the result was served from cache.      |
| `llmUsage`   | `object`  | Token usage from LLM calls.                    |
| `cacheUsage` | `object`  | Token usage served from cache.                 |

**Error**

| Field       | Type                          | Description                                              |
| ----------- | ----------------------------- | -------------------------------------------------------- |
| `success`   | `false`                       | Indicates the request failed.                            |
| `error`     | `string`                      | Message describing the error.                            |
| `source`    | `'gateway'` \| `'direct'`     | Which backend returned the error.                        |
| `latencyMs` | `number`                      | Time until failure in milliseconds.                      |

## SDK API

### Constructors

**`Nua.gateway(config?)`**
Creates a client that connects to the Nuabase API gateway. Use this for production deployments with caching, request tracking, and async job support.

- `apiKey?: string` – API key for authentication. Defaults to `process.env.NUABASE_API_KEY`.
- `baseUrl?: string` – Override the API host. Defaults to `https://api.nuabase.com`.

**`Nua.direct(config)`**
Creates a client that calls LLM providers directly (in-process). Use this for serverless, edge functions, or CLI tools where you don't need the gateway infrastructure.

- `model: string` – The model to use (e.g., `'gpt-4o-mini'`).
- `providers: { openai?: { apiKey: string }, ... }` – Provider credentials.

### Methods

**`nua.get(prompt)`**
Returns a simple string response from the LLM.

```ts
const result = await nua.get("Tell me a joke");
if (result.success) console.log(result.data); // string
```

**`nua.get(prompt, options)`**
Returns a typed single value. Parameters:

- `prompt: string` – Natural-language instructions sent to the LLM.
- `options.input?: unknown` – Optional input data to include in the prompt.
- `options.output: { name: string; schema: ZodSchema }` – Output name and Zod schema.

```ts
const result = await nua.get("Extract the address", {
  input: "123 Main St, Springfield, IL 62701",
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
const result = await nua.list("Classify each lead", {
  input: leads,
  primaryKey: 'id',
  output: { name: 'classification', schema: ClassificationSchema },
});
if (result.success) {
  result.data.forEach(row => console.log(row.id, row.classification));
}
```

**`nua.queueGet(prompt, options?)`** *(Gateway mode only)*
Submits an async job for single-value operations. Returns `{ success: true, jobId }`.

**`nua.queueList(prompt, options)`** *(Gateway mode only)*
Submits an async job for array operations. Returns `{ success: true, jobId }`.

## Next Steps

- Create an API key or inspect request logs in the [Nuabase Console](https://console.nuabase.com/).
- Explore more SDK usage patterns (SSE streaming, webhooks, caching) in the full docs at https://docs.nuabase.com.

## Support

Email us at [hello@nuabase.com](mailto:hello@nuabase.com). On X at [@NuabaseHQ](x.com/NuabaseHQ).

## Tests

See [TESTING.md](TESTING.md)

## Credits

The template for this package comes from https://github.com/rtivital/ts-package-template

## License

MIT
