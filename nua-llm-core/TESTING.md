# Testing

## Unit tests

```sh
pnpm test
```

No API keys needed. Runs fast. Tests parsing, orchestration, schemas, prompts, and the agent loop with mocked providers, and local-agent setup with the Node binary standing in for a CLI. `cast-prompts.test.ts` pins the in-prompt prompt text, which the API server stores; change it only on purpose.

## Integration tests

```sh
pnpm test:integration
```

Hits real LLM endpoints. Requires API keys set as environment variables. Tests that message formats work correctly with each provider through the full `runAgent()` path.

### Environment variables

| Provider    | Provider-native model     | Env Var              |
|-------------|---------------------------|----------------------|
| Groq        | `qwen/qwen3.8-27b`        | `GROQ_API_KEY`       |
| Cerebras    | `qwen-3.8-27b`            | `CEREBRAS_API_KEY`   |
| Gemini      | `gemini-2.5-flash`        | `GEMINI_API_KEY`     |
| OpenRouter  | `z-ai/glm-5.2`            | `OPENROUTER_API_KEY` |

Tests for providers without a configured API key are automatically skipped.

The repo root's `mise.toml` (not committed) sets the provider keys and `NUA_LOCAL_AGENTS` for every package. To use it, run `mise exec -- pnpm test:integration`.

Local-agent integration tests run the coding-agent CLIs installed on this machine, using their own logins, and are skipped unless you opt in:

```sh
NUA_LOCAL_AGENTS=claude-code,codex pnpm test:integration -- local-agent-integration
```

### Running a single provider

```sh
GROQ_API_KEY=gsk_... pnpm test:integration
```

### Timeout

Integration tests have a 30-second timeout per test to accommodate real network latency.
