// Tests and publishes the current version of each published package to npm,
// one package after the other, in the order of packages.mjs.
//
// The versions are set beforehand by `pnpm release:version`, and the release
// train in ../sapporta-devtools does all git work. This script never commits,
// pushes or pulls.
//
// Usage: node scripts/release-packages.mjs [--dry-run] [package-dir...]
//
// The packages' tests read what the workspace's mise.toml sets: provider keys
// and NUA_LOCAL_AGENTS for nuabase, NUABASE_API_URL and NUABASE_API_KEY for
// @nuabase/gateway. That is why `pnpm release:publish` runs this script through
// `mise exec`.

import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHED_PACKAGES } from "./packages.mjs";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd, stdio = "inherit") {
  const result = spawnSync(command, args, { cwd, stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

// npm answers E404 for a version that was never published. Any other failure
// stops the release, because guessing could publish twice or not at all.
function isPublished(name, version, cwd) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;

  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    if (output.includes("E404")) return false;
    throw new Error(`npm view ${name}@${version} failed:\n${output.trim()}`);
  }

  const trimmed = result.stdout.trim();
  if (trimmed === "") return false;
  const value = JSON.parse(trimmed);
  return Array.isArray(value) ? value.includes(version) : value === version;
}

// npm's web or passkey login reads from the terminal. When this script runs
// with stdin redirected, the publish still gets the terminal through /dev/tty.
function publishStdin() {
  if (process.stdin.isTTY) {
    return { fd: "inherit", close: () => {} };
  }

  try {
    const fd = openSync("/dev/tty", "r");
    return { fd, close: () => closeSync(fd) };
  } catch {
    return { fd: "inherit", close: () => {} };
  }
}

function release(pkg, dryRun) {
  const packageDir = join(repoDir, pkg.dir);
  const { name, version } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

  // Checked before the tests, so that releasing one package does not depend on
  // the other package's tests, or on the services they call.
  if (isPublished(name, version, packageDir)) {
    console.log(`${name}@${version} is already published, skipping`);
    return;
  }

  console.log(`Testing ${name}@${version}`);
  run("pnpm", ["test"], packageDir);

  console.log(`Publishing ${name}@${version}${dryRun ? " (dry run)" : ""}`);

  // `pnpm pack` writes the tarball and `npm publish` uploads it. The upload is
  // made by npm and not by `pnpm publish` because an account that requires 2FA
  // for writes is asked to approve the publish in the browser, and only npm
  // asks. pnpm 11 sends the upload without the approval, and npm answers it
  // with a 404.
  const packDir = mkdtempSync(join(tmpdir(), "nuabase-release-"));
  const tarball = join(packDir, "package.tgz");
  const args = ["publish", tarball, "--access", "public"];
  if (dryRun) args.push("--dry-run");

  const stdin = publishStdin();
  try {
    run("pnpm", ["pack", "--out", tarball], packageDir);
    run("npm", args, packDir, [stdin.fd, "inherit", "inherit"]);
  } finally {
    stdin.close();
    rmSync(packDir, { recursive: true, force: true });
  }
  console.log(`${name}@${version} has been ${dryRun ? "packed (dry run)" : "published"}`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dirs = args.filter((arg) => arg !== "--dry-run");

  const unknown = dirs.filter((dir) => !PUBLISHED_PACKAGES.some((pkg) => pkg.dir === dir));
  if (unknown.length > 0) {
    throw new Error(`Not a published package: ${unknown.join(", ")}`);
  }

  const packages =
    dirs.length === 0 ? PUBLISHED_PACKAGES : PUBLISHED_PACKAGES.filter((pkg) => dirs.includes(pkg.dir));

  // One at a time: each runs its own tests and may ask for npm's 2FA approval.
  for (const pkg of packages) {
    release(pkg, dryRun);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
