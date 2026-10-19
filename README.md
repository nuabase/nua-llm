# Nuabase Monorepo

A pnpm workspace containing the Nuabase platform: type-safe LLM transformations with structured data extraction.

## Packages

| Package | Description |
|---------|-------------|
| [`nua-client`](./nua-client) | TypeScript SDK that runs casts in your process, on LLM providers or local coding agents (published as `nuabase` on npm). Never calls the Nuabase API. |
| [`nua-gateway`](./nua-gateway) | Client for the hosted Nuabase API (published as `@nuabase/gateway` on npm) |
| [`nua-llm-core`](./nua-llm-core) | Core library for LLM-based structured data extraction |
| [`nua-llm-caching`](./nua-llm-caching) | Row-level caching layer for LLM requests |
| [`api-server`](./api-server) | Node.js/Express API server for hosted Nuabase gateway |


## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run unit tests (nua-llm-caching only, no API keys needed)
pnpm --filter nua-llm-caching test

# Run integration tests (requires real API keys)
GROQ_API_KEY=your_key_here pnpm --filter nuabase test
NUABASE_API_KEY=gateway-key pnpm --filter @nuabase/gateway test
```

See [PUBLISHING.md](./PUBLISHING.md) for releasing the two npm packages.

