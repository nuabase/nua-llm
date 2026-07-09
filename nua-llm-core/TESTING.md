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

| Provider    | Provider-native model     | Env Var              |
|-------------|---------------------------|----------------------|
| Groq        | `qwen/qwen3.6-27b`        | `GROQ_API_KEY`       |
| Cerebras    | `zai-glm-4.7`             | `CEREBRAS_API_KEY`   |
| Gemini      | `gemini-2.5-flash`        | `GEMINI_API_KEY`     |
| OpenRouter  | `z-ai/glm-5.2`            | `OPENROUTER_API_KEY` |

Tests for providers without a configured API key are automatically skipped.

### Running a single provider

```sh
GROQ_API_KEY=gsk_... pnpm test:integration
```

### Timeout

Integration tests have a 30-second timeout per test to accommodate real network latency.
