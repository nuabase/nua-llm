## Publishing to npm

One package is published: `nuabase`, from `nua-client/`. It bundles `nua-llm-core`, so a change to either needs a release.

`scripts/packages.mjs` lists it, with the paths whose changes it ships. `nua-llm-core` is marked `"private": true`, so npm refuses to publish it.

A release happens in three steps:

1. Record the version bump as a changeset. Run `pnpm changeset` at the workspace root and pick a patch, minor or major bump. The release train can also write the changeset for you.
2. Apply the changesets with `pnpm release:version` at the workspace root. This sets the new version in `nua-client/package.json`, writes `nua-client/CHANGELOG.md`, and deletes the applied changesets.
3. Run the release train from `../sapporta-devtools` with `pnpm release-train`. The train commits the version change as "Version packages for release", runs `pnpm release:publish` in this workspace, and pushes.

`pnpm release:publish` runs `scripts/release-packages.mjs`. It skips a package whose current version is already on npm; otherwise it runs the package's `pnpm test`, then packs it with `pnpm pack` and uploads it with `npm publish --access public`. npm may ask you to log in through the browser or with a passkey. Pass `--dry-run` to run the tests and a publish dry run: `mise exec -- node scripts/release-packages.mjs --dry-run nua-client`. The scripts never commit, push or pull; the release train does all git work.

`pnpm release:status` at the workspace root prints the release state as JSON: for each package, the current version, whether it is on npm, the pending bump, and the commits since the last release that touch its paths and that no changeset names.

The tests read the workspace's `mise.toml`, which is why `pnpm release:publish` runs through `mise exec`: `nuabase` runs the direct and local-agent tests, which need a provider key and `NUA_LOCAL_AGENTS`.
