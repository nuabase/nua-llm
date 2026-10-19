# Nuabase Monorepo

A pnpm workspace containing the Nuabase platform: type-safe LLM transformations with structured data extraction.

## Packages

| Package | Description |
|---------|-------------|
| [`nua-client`](./nua-client) | TypeScript SDK that runs casts in your process, on LLM providers or local coding agents (published as `nuabase` on npm). |
| [`nua-llm-core`](./nua-llm-core) | Core library for LLM-based structured data extraction |


## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run unit tests (nua-llm-core only, no API keys needed)
pnpm --filter nua-llm-core test

# Run integration tests (requires real API keys)
GROQ_API_KEY=your_key_here pnpm --filter nuabase test
```

See [PUBLISHING.md](./PUBLISHING.md) for releasing the npm package.

