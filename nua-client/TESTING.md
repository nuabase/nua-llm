# Testing

All tests are integration tests. Do not stub or mock actual API calls.

## Test modes

`get.test.ts` and `list.test.ts` run the same cast value and cast list tests once per mode:

| Mode                   | Runs casts through                               | Runs when                                                              |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `direct`               | An LLM provider's API (the first key found)      | A provider key is set, unless `SKIP_DIRECT_TESTS` is set.              |
| `local-agent:<agent>`  | A coding-agent CLI on this machine, headless     | For each agent in `NUA_LOCAL_AGENTS`: `claude-code`, `codex`, `auto`.  |

At least one mode must be available, or the tests fail with a message saying so.

Local-agent modes go through `Nua.direct({ localAgent })`, so results report `source: 'direct'`. Calls use that agent's own login and count against its plan. Claude Code runs with `haiku`; Codex with its default model. `auto` uses `findLocalAgent()`.

`pnpm test` builds `nua-llm-core` first: the tests, the type check and the bundle all load it from its `dist/`. `pnpm jest` alone uses whatever `dist/` is there.

## Environment

The repo root's `mise.toml` (not committed) sets the provider keys and `NUA_LOCAL_AGENTS`, for every package. Run tests through mise to use it:

```bash
mise exec -- pnpm jest
```

Or set the variables yourself:

```bash
# Only direct mode
GROQ_API_KEY=YOUR_KEY pnpm jest

# Only local-agent modes, against locally installed, logged-in coding agents
NUA_LOCAL_AGENTS=claude-code,codex SKIP_DIRECT_TESTS=1 pnpm jest get list
```

## Direct Mode Providers

Direct mode requires one of these API keys:

- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `CEREBRAS_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
