# Development

```bash
pnpm install
pnpm -r build
```

## Testing

| Command | Runs |
|---------|------|
| `pnpm -r test` | nua-llm-core unit tests; nua-client checks and live casts |
| `pnpm -r test:integration` | nua-llm-core live provider and local-agent tests |

nua-client's `test` is its live suite, so it needs a provider key or `NUA_LOCAL_AGENTS`. Run both commands to cover everything. The root `mise.toml` (not committed) sets the keys and `NUA_LOCAL_AGENTS`; run through `mise exec --` to use it.

Details: [nua-llm-core/TESTING.md](./nua-llm-core/TESTING.md), [nua-client/TESTING.md](./nua-client/TESTING.md).

## Publishing

See [PUBLISHING.md](./PUBLISHING.md).
