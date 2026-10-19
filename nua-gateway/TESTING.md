# Testing

All tests are integration tests. Do not stub or mock actual API calls.

The tests call a running Nuabase API:

| Variable          | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `NUABASE_API_URL` | The API to call. Defaults to `https://api.nuabase.com`.    |
| `NUABASE_API_KEY` | An API key for it. Required.                               |

| File                   | Covers                                                                        |
| ---------------------- | ----------------------------------------------------------------------------- |
| `get.test.ts`          | `get()`: response shape, usage, gateway `meta`                                |
| `list.test.ts`         | `list()`: response shape, usage, gateway `meta`                               |
| `queue.test.ts`        | `queueGet()` and `queueList()` return a job id                                |
| `gateway-only.test.ts` | What the API keeps per request: request ids, `GET /requests/:id`, cache usage |

## Environment

The repo root's `mise.toml` (not committed) sets the Nuabase API URL and key. Run tests through mise to use it:

```bash
# Against the hosted Nuabase API
mise exec -- pnpm jest

# Against an api-server on localhost:3030 (key in the root mise.localhost.toml)
MISE_ENV=localhost mise exec -- pnpm jest
```

Or set the variables yourself:

```bash
NUABASE_API_URL=http://localhost:3030 NUABASE_API_KEY=YOUR_KEY pnpm jest
```

An API served with a certificate from a local CA also needs `NODE_OPTIONS=--use-system-ca`.
