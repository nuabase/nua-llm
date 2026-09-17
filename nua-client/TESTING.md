# Testing

All tests are integration tests. Do not stub or mock actual API calls.

## Test modes

`get.test.ts` and `list.test.ts` run the same cast value and cast list tests once per mode:

| Mode                   | Runs casts through                               | Runs when                                                              |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `gateway`              | The Nuabase API at `NUABASE_API_URL`             | Unless `SKIP_GATEWAY_TESTS` is set. Needs `NUABASE_API_KEY`.           |
| `direct`               | An LLM provider's API (the first key found)      | A provider key is set, unless `SKIP_DIRECT_TESTS` is set.              |
| `local-agent:<agent>`  | A coding-agent CLI on this machine, headless     | For each agent in `NUA_LOCAL_AGENTS`: `claude-code`, `codex`, `auto`.  |

Local-agent modes go through `Nua.direct({ localAgent })`, so results report `source: 'direct'`. Calls use that agent's own login and count against its plan. Claude Code runs with `haiku`; Codex with its default model. `auto` uses `findLocalAgent()`.

`gateway-only.test.ts` covers features only the Nuabase API has (request IDs, request lookup, cache usage).

## Environment

The repo root's `mise.toml` (not committed) sets the Nuabase API URL and key, the provider keys, and `NUA_LOCAL_AGENTS`, for every package. Run tests through mise to use it:

```bash
# All modes, against the hosted Nuabase API
mise exec -- pnpm jest

# Gateway tests against an api-server on localhost:3030 (key in the root mise.localhost.toml)
MISE_ENV=localhost mise exec -- pnpm jest
```

Or set the variables yourself:

```bash
# Run against local (localhost:3030)
NUABASE_API_URL=http://localhost:3030 NUABASE_API_KEY=YOUR_KEY pnpm jest

# Run against production
NUABASE_API_URL=https://api.nuabase.com NUABASE_API_KEY=YOUR_KEY pnpm jest

# Skip direct mode tests (only run gateway tests)
SKIP_DIRECT_TESTS=1 NUABASE_API_KEY=YOUR_KEY pnpm jest

# Skip gateway tests (only run direct mode tests)
SKIP_GATEWAY_TESTS=1 GROQ_API_KEY=YOUR_KEY pnpm jest

# Only run local-agent modes, against locally installed, logged-in coding agents
NUA_LOCAL_AGENTS=claude-code,codex SKIP_GATEWAY_TESTS=1 SKIP_DIRECT_TESTS=1 pnpm jest get list
```

## Direct Mode Providers

Direct mode requires one of these API keys:

- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `CEREBRAS_API_KEY`
- `GEMINI_API_KEY`
