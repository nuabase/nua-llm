# Instructions

- All tests must be integration tests - do not stub or mock actual API calls.
- See [TESTING.md](TESTING.md) for running tests.
- The main entry point must work in both Node.js and edge runtimes (such as Cloudflare Workers or Vercel Edge). So avoid any `node:` imports outside the Node-only `local-agent` entry point; edge runtimes lack most Node built-ins. Use web-standard globals instead.
- `nua-llm-core` is a **devDependency** because Rollup bundles it directly into the nua-client `dist/` output (see `rollup.config.js` — it's excluded from `nodeExternals`). It is not published to npm, so consumers of the `nuabase` package never install it separately.
- nua-llm-core has no build of its own: its `exports` point at its TypeScript source, which Rollup bundles directly, JavaScript and declarations alike. `pnpm build` writes one self-contained `.d.mts` and `.d.cts` per entry point, and `pnpm pack:test` checks them with `attw` for every module resolution consumers use.
