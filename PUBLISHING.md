## Publishing to npm

Two packages are published:

| Package            | Directory      | Ships                                                                                   |
| ------------------ | -------------- | --------------------------------------------------------------------------------------- |
| `nuabase`          | `nua-client/`  | Runs casts in your process. Bundles `nua-llm-core`, so a change to either needs a release. |
| `@nuabase/gateway` | `nua-gateway/` | The Nuabase API client. Does not use `nua-llm-core`.                                    |

`scripts/packages.mjs` lists them, with the paths whose changes each one ships. The other workspace packages are marked `"private": true`, so npm refuses to publish them.

A release happens in three steps:

1. Record the version bump as a changeset. Run `pnpm changeset` at the workspace root and pick the package and a patch, minor or major bump. A changeset can name both packages, but its text then goes into both changelogs. The release train can also write the changeset for you.
2. Apply the changesets with `pnpm release:version` at the workspace root. This sets the new versions in each `package.json`, writes each `CHANGELOG.md`, and deletes the applied changesets.
3. Run the release train from `../sapporta-devtools` with `pnpm release-train`. The train commits the version change as "Version packages for release", runs `pnpm release:publish` in this workspace, and pushes.

`pnpm release:publish` runs `scripts/release-packages.mjs`, which handles one package after the other. For each, it skips the package if its current version is already on npm; otherwise it runs the package's `pnpm test`, then packs it with `pnpm pack` and uploads it with `npm publish --access public`. npm may ask you to log in through the browser or with a passkey. Pass package directories to release only those, and `--dry-run` to run the tests and a publish dry run: `mise exec -- node scripts/release-packages.mjs --dry-run nua-gateway`. The scripts never commit, push or pull; the release train does all git work.

`pnpm release:status` at the workspace root prints the release state as JSON: for each package, the current version, whether it is on npm, the pending bump, and the commits since the last release that touch its paths and that no changeset names.

The tests read the workspace's `mise.toml`, which is why `pnpm release:publish` runs through `mise exec`:

- `nuabase` runs the direct and local-agent tests: a provider key, and `NUA_LOCAL_AGENTS`. It never calls the Nuabase API.
- `@nuabase/gateway` runs its tests against the Nuabase API at `NUABASE_API_URL`, with `NUABASE_API_KEY`.

Publishing `@nuabase/gateway` needs an npm account with publish rights in the `@nuabase` scope.
