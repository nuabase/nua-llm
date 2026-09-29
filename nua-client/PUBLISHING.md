## Publishing to npm

Only this package is published, as `nuabase`. It bundles `nua-llm-core`, so a change to either package needs a release.

A release happens in three steps:

1. Record the version bump as a changeset. Run `pnpm changeset` at the workspace root and pick `nuabase` with a patch, minor or major bump. The release train can also write the changeset for you.
2. Apply the changesets with `pnpm release:version` at the workspace root. This sets the new version in `package.json`, writes `CHANGELOG.md`, and deletes the applied changesets.
3. Run the release train from `../sapporta-devtools` with `pnpm release-train`. The train commits the version change as "Version packages for release", runs `pnpm release:publish` in this workspace, and pushes.

`pnpm release:publish` runs `pnpm release` in this package. That script runs `pnpm test` without the gateway tests, then publishes the current version with `pnpm publish --access public`, unless that version is already on npm. npm may ask you to log in through the browser or with a passkey. Pass `--dry-run` (`pnpm release --dry-run`) to run the tests and a publish dry run. The scripts never commit, push or pull; the release train does all git work.

`pnpm release:status` at the workspace root prints the release state as JSON: the current version, whether it is on npm, the pending bump, and the commits since the last release that no changeset names.

A release runs the direct and local-agent tests but not the gateway tests: `scripts/release.ts` sets `SKIP_GATEWAY_TESTS=1`, so no Nuabase API key is needed. The direct tests need a provider key and the local-agent tests read `NUA_LOCAL_AGENTS`; both come from the workspace's `mise.toml`, which is why `pnpm release:publish` runs the release through `mise exec`. Running `pnpm release` in this package directly uses whatever your shell has set.

## Publishing with GitHub Actions

1. Create [npm authentication token](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) and add it as `NPM_TOKEN` to your repository secrets (Settings -> Secrets and variables -> Actions -> New repository secret).

2. Create `.github/workflows/publish.yml` with the following content. _Note that if your default branch is main, you should change it in the publish action_.

```yaml
on:
  push:
    branches: master

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
