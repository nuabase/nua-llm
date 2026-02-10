# Testing

## Unit tests

```sh
pnpm test
```

No API keys needed. Runs fast. Tests parsing, orchestration, schemas, and the agent loop with mocked providers.

## Integration tests

```sh
pnpm test:integration
```

Hits real LLM endpoints. Requires API keys set as environment variables. Tests that message formats work correctly with each provider through the full `NuaLlmClient.runAgent()` path.

### Environment variables

| Provider    | Model                      | Env Var              |
|-------------|----------------------------|----------------------|
| Groq        | `llama-3.3-70b-versatile`  | `GROQ_API_KEY`       |
| Cerebras    | `llama-3.3-70b`            | `CEREBRAS_API_KEY`   |
| Gemini      | `gemini-2.0-flash`         | `GEMINI_API_KEY`     |
| OpenRouter  | `gpt-oss-120b`             | `OPENROUTER_API_KEY` |

Tests for providers without a configured API key are automatically skipped.

### Running a single provider

```sh
GROQ_API_KEY=gsk_... pnpm test:integration
```

### Timeout

Integration tests have a 30-second timeout per test to accommodate real network latency.
