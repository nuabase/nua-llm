# Testing

All tests are integration tests. Do not stub or mock actual API calls.

## Running Tests

```bash
# Run against local (localhost:3030)
NUABASE_API_URL=http://localhost:3030 NUABASE_API_KEY=YOUR_KEY pnpm jest

# Run against production
NUABASE_API_URL=https://api.nuabase.com NUABASE_API_KEY=YOUR_KEY pnpm jest

# Skip direct mode tests (only run gateway tests)
SKIP_DIRECT_TESTS=1 NUABASE_API_KEY=YOUR_KEY pnpm jest

# Skip gateway tests (only run direct mode tests)
SKIP_GATEWAY_TESTS=1 GROQ_API_KEY=YOUR_KEY pnpm jest
```

## Direct Mode Providers

Direct mode requires one of these API keys:
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `CEREBRAS_API_KEY`
- `GEMINI_API_KEY`
