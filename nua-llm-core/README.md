# Nua LLM Core Library

A standalone, type-safe TypeScript library for performing structured data extraction using LLMs. This library handles prompt construction, model negotiation, and JSON schema validation, providing a clean API for "casting" unstructured data into typed values and arrays.

## Quick Start

### 1. Initialize the Client

```typescript
import { NuaLlmClient, ConsoleLogger } from "./index"; // Adjust import path

const client = new NuaLlmClient({
  logger: new ConsoleLogger(), // Optional: Inject your own logger
  providers: {
    // Provide keys for the models you intend to use
    openai: { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    groq: { apiKey: process.env.GROQ_API_KEY },
  },
});
```

### 2. Cast a Value (Single Object)

Extract a single structured object from natural language inputs.

```typescript
const result = await client.castValue({
  model: "fast", // or specific model names like "gpt-5", "gemini-2.5-flash"
  input: {
    prompt: "Extract the event details",
    data: "Join us for the Tech Conference on Dec 1st, 2025 at 10 AM.",
  },
  output: {
    name: "Event",
    effectiveSchema: {
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

Extract a list of items, enforcing a specific schema.

```typescript
const rawData = [
  "Apple - $1.20",
  "Banana - $0.50",
  "Orange - $0.80"
];

const result = await client.castArray({
  model: "claude-sonnet-4-5",
  input: {
    prompt: "Convert price list to structured objects",
    primaryKey: "name", // Required for tracking and caching logic
  },
  data: rawData,
  output: {
    name: "Product",
    effectiveSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number" },
      },
      required: ["name", "price"],
    },
  },
});

if (result.success) {
  // result.data is typed as generic T[] (you can pass <Product> generic to castArray)
  console.log("Products:", result.data);
}
```

---

## API Reference

### `NuaLlmClient`

#### Constructor(config: NuaLlmClientConfig)

*   `logger`: Instance implementing the `Logger` interface (debug, info, warn, error). Defaults to `ConsoleLogger`.
*   `providers`: Map of provider configuration.
    *   Supported providers: `openai`, `anthropic`, `groq`, `cerebras`, `google` (gemini), `openrouter`.
    *   Currently requires `apiKey` for each used provider.

### `castValue<T>(params)`

Performs a single LLM call to extract an object matching the schema.

*   `model`: Canonical model name (e.g., `fast`, `quality`) or provider specific string.
*   `input.prompt`: Instructions for the extraction.
*   `input.data`: The context data (string or object) to process.
*   `output.name`: Name of the entity (helps LLM context).
*   `output.effectiveSchema`: JSON Schema object defining the structure.
*   **Returns**: `Promise<CastResult<T>>`
    *   `success`: boolean
    *   `data`: T (if success)
    *   `error`: string (if failed)
    *   `usage`: Token usage statistics.

### `castArray<T>(params)`

Performs an extraction of a list of items.

*   `data`: Array of input items (can be strings or objects).
*   `input.primaryKey`: Unique identifier field name in the *input* data (or output if mapping 1:1) to track items. *Note: The library validates that input data items are objects containing this key if you pass structured input.*
*   `output.effectiveSchema`: JSON Schema for *a single item*.
*   **Returns**: `Promise<CastResult<T[]>>`

## Architecture

This library is designed to be "Operational Logic Free". It does **not**:
*   Connect to a database.
*   Connect to Redis.
*   Queue background jobs.

It **does**:
*   Handle HTTP requests to LLM providers.
*   Manage provider-specific configurations.
*   Construct optimized system prompts (`<json-schema-spec>`, `<input-data>` wrappers).
*   Parse "Thinking" blocks from advanced models.
*   Validate outputs using AJV against the provided JSON schema.
*   Retry failed requests (default generic retry logic).
