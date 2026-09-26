# Nua LLM Core Library

A standalone, type-safe TypeScript library for performing structured data extraction using LLMs. This library handles prompt construction, model negotiation, and JSON schema validation, providing a clean API for "casting" unstructured data into typed values and arrays.

## Quick Start

### 1. Initialize the Client

```typescript
import { NuaLlmClient, ConsoleLogger, providerEngines } from "nua-llm-core";

const client = new NuaLlmClient(
  providerEngines({
    logger: new ConsoleLogger(), // Optional: Inject your own logger
    providers: {
      // Provide keys for the models you intend to use
      groq: { apiKey: process.env.GROQ_API_KEY },
      cerebras: { apiKey: process.env.CEREBRAS_API_KEY },
      openrouter: { apiKey: process.env.OPENROUTER_API_KEY },
      gemini: { apiKey: process.env.GEMINI_API_KEY },
    },
  }),
);
```

### 2. Cast a Value (Single Object)

Extract a single structured object from natural language inputs.

```typescript
const result = await client.castValue({
  model: { alias: "fast" }, // optional; omitted model also defaults to fast
  input: {
    prompt: "Extract the event details",
    data: "Join us for the Tech Conference on Dec 1st, 2025 at 10 AM.",
  },
  output: {
    name: "Event",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", format: "date" },
        time: { type: "string" },
      },
      required: ["title", "date"],
    },
  },
});

if (result.success) {
  console.log("Event:", result.data); 
  // Output: { title: "Tech Conference", date: "2025-12-01", time: "10:00" }
} else {
  console.error(result.error);
}
```

### 3. Cast an Array (List of Objects)

Map each input row to one output value, keyed by the row's primary key.

```typescript
import { listSchema } from "nua-llm-core";

const rows = [
  { id: 1, line: "Apple - $1.20" },
  { id: 2, line: "Banana - $0.50" },
  { id: 3, line: "Orange - $0.80" },
];

const result = await client.castArray({
  model: { provider: "openrouter", model: "anthropic/claude-sonnet-4.6" },
  input: {
    prompt: "Convert price list to structured objects",
    data: rows,
  },
  output: listSchema(
    {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number" },
      },
      required: ["name", "price"],
    },
    { primaryKey: "id", outputName: "product" },
  ),
});
// result.data: [{ id: 1, product: { name: "Apple", price: 1.2 } }, ...]

if (result.success) {
  // result.data is typed as generic T[] (you can pass <Product> generic to castArray)
  console.log("Products:", result.data);
}
```

---

## API Reference

### `NuaLlmClient`

#### Constructor(engines: EngineRouter)

The client holds one engine router, which decides where each call runs. Every router answers the same question: for this call's model choice, which engine runs it, and on which model, or why no engine can. Create one of:

*   `providerEngines(config)`, for LLM providers' HTTP APIs:
    *   `providers`: API keys by provider. Supported providers: `groq`, `cerebras`, `gemini`, `openrouter`. Providers without a key are never used.
    *   `model`: Optional default model input. Defaults to `{ alias: "fast" }`.
    *   `logger`: Instance implementing the `Logger` interface (debug, info, warn, error). Defaults to `ConsoleLogger`.
*   `localAgent(config)` or `await findLocalAgent(options)` from `nua-llm-core/local-agent`, for a coding-agent CLI on this machine (Claude Code, Codex, or Pi), run with the user's own login. Node.js only:

```typescript
import { findLocalAgent, localAgent } from "nua-llm-core/local-agent";

const client = new NuaLlmClient(localAgent({ agent: "claude-code", model: "haiku" }));

// Or use the first agent that is installed and logged in:
const auto = new NuaLlmClient(await findLocalAgent());
```

`localAgent()` looks up the CLI on `PATH` when it is called and throws if it is missing; a missing login shows up as the first call's error. `findLocalAgent()` runs each CLI's version and login-status commands, and rejects when none is ready. Both set the agent up once; if you install or log in to an agent later, create a new one. Their options are `model` (the agent's own model name for calls that name none), `timeoutMs`, `concurrency`, `auth`, and `logger`; `localAgent()` also takes `binaryPath`.

`nua-llm-core/local-agent` is a separate entry point because it imports Node built-ins; the main entry point stays loadable in browsers. Local agents take model aliases they have an equivalent for (`haiku`, `sonnet`, `opus` for Claude Code), not provider models. Codex and Pi have no aliases: pass one of their own model names (`provider/id` for Pi) through `localAgent({ model })`.

The router's logger receives each call's log lines, and the client logs its retries there too, so there is one logger to configure.

### `castValue<T>(params)`

Performs a single LLM call to extract an object matching the schema.

*   `model`: Optional typed model input. Use `{ alias: "fast" }` for a product alias, or `{ provider: "openrouter", model: "z-ai/glm-5.2" }` for a provider-native model. If omitted, the router's default is used.
*   `input.prompt`: Instructions for the extraction.
*   `input.data`: The context data (string or object) to process.
*   `output.name`: Name of the entity (helps LLM context).
*   `output.schema`: JSON Schema object defining the structure.
*   **Returns**: `Promise<CastResult<T>>`, discriminated on `success`:
    *   `success: true`: `data: T`, `usage` (token usage of the successful attempt), `prompt` (`{ system, full }`: the prompt that attempt sent, and the part of it that describes the output shape), `origin` (which engine answered: `{ engine: "http", provider, model }` or `{ engine: "local-agent", agent, model, costUsdEstimate }`), and `schemaEnforcement` (`"in-prompt"` or `"native"`).
    *   `success: false`: `error: string`, and `prompt` when an attempt was made.

### `castArray<T>(params)`

Maps a list of input rows to one output value each.

*   `input.data`: Array of objects, each holding the primary key.
*   `output`: A list schema from `listSchema(itemSchema, { primaryKey, outputName })`. It is the schema of the whole result, an array of `{ [primaryKey], [outputName] }` objects, and it names the primary key. A list schema that was stored as JSON can be read back with `parseListSchema(json, { primaryKey, outputName })`, which uses it exactly as stored.
*   **Returns**: `Promise<CastResult<T[]>>`

### `runAgent(providers, params)`

Runs a multi-turn, tool-calling conversation. It takes the result of `providerEngines()`, because tool calling needs an LLM provider's API; local agents cannot run it.

## Architecture

How a cast flows:

1.  `NuaLlmClient.castValue` / `castArray` (`src/nua-llm-client.ts`) asks its router for the engine that runs the call's model choice, and describes the cast as plain data (`modules/cast/cast-request.ts`).
2.  The router answers: `ProviderEngines` (`modules/engine/http/provider-engines.ts`) looks the model up in the provider alias table (`modules/model-info`); `LocalAgent` (`modules/engine/local-agent/local-agent.ts`) looks it up in its CLI adapter's own alias table. Either returns an engine for one model, or the reason there is none.
3.  `runCast` (`modules/cast/run-cast.ts`) asks the engine whether it can enforce the schema itself, renders the prompt for that choice (`modules/cast/prompts/`), calls `engine.attempt`, checks the answer against the schema, and retries when another attempt could help.
4.  The engines (`modules/engine/llm-engine.ts` is their contract) do one attempt each: `HttpEngine` sends one HTTP request (`modules/engine/http/`), `LocalAgentEngine` runs one CLI process (`modules/engine/local-agent/`).

Tool-calling agent runs (`modules/agent/run-agent.ts`) resolve a provider model the same way, then send each turn with `modules/agent/agent-turn.ts`. It and the cast engine share one logged provider call (`modules/engine/http/provider-call.ts`).

This library is designed to be "Operational Logic Free". It does **not**:
*   Connect to a database.
*   Connect to Redis.
*   Queue background jobs.

It **does**:
*   Handle HTTP requests to LLM providers, or run coding-agent CLIs on this machine.
*   Manage provider-specific configurations.
*   Construct optimized system prompts (`<json-schema-spec>`, `<input-data>` wrappers).
*   Parse "Thinking" blocks from advanced models.
*   Validate outputs using AJV against the provided JSON schema.
*   Retry failed attempts, unless retrying cannot help (for example a rejected API key, or an agent that is not logged in).
