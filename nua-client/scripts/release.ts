// Tests and publishes the current version of nuabase to npm.
//
// The version is set beforehand by `pnpm release:version` at the workspace
// root, and the release train in ../sapporta-devtools does all git work. This
// script never commits, pushes or pulls.
//
// Usage: tsx scripts/release [--dry-run]

import { spawnSync, type StdioOptions } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import signale from 'signale';

const clientDir = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(clientDir, 'package.json'), 'utf8'));
const dryRun = process.argv.slice(2).includes('--dry-run');

// The gateway tests call the Nuabase API, which a release does not need to
// check. The direct and local-agent tests still run; they read the provider
// keys and NUA_LOCAL_AGENTS that the workspace's mise.toml sets, which is why
// `pnpm release:publish` runs this script through `mise exec`.
function testEnv(): NodeJS.ProcessEnv {
  return { ...process.env, SKIP_GATEWAY_TESTS: '1' };
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdio: StdioOptions,
  cwd = clientDir
) {
  const result = spawnSync(command, args, { cwd, env, stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

// npm answers E404 for a version that was never published. Any other failure
// stops the release, because guessing could publish twice or not at all.
function isPublished(name: string, version: string): boolean {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], {
    cwd: clientDir,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;

  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    if (output.includes('E404')) return false;
    throw new Error(`npm view ${name}@${version} failed:\n${output.trim()}`);
  }

  const trimmed = result.stdout.trim();
  if (trimmed === '') return false;
  const value = JSON.parse(trimmed);
  return Array.isArray(value) ? value.includes(version) : value === version;
}

// npm's web or passkey login reads from the terminal. When this script runs
// with stdin redirected, the publish still gets the terminal through /dev/tty.
function publishStdin(): { fd: number | 'inherit'; close: () => void } {
  if (process.stdin.isTTY) {
    return { fd: 'inherit', close: () => {} };
  }

  try {
    const fd = openSync('/dev/tty', 'r');
    return { fd, close: () => closeSync(fd) };
  } catch {
    return { fd: 'inherit', close: () => {} };
  }
}

function release() {
  const { name, version } = packageJson;

  signale.info(`Testing ${name}@${version}`);
  run('pnpm', ['test'], testEnv(), 'inherit');

  if (isPublished(name, version)) {
    signale.success(`${name}@${version} is already published, skipping`);
    return;
  }

  signale.info(`Publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`);

  // `pnpm pack` writes the tarball and `npm publish` uploads it. The upload is
  // made by npm and not by `pnpm publish` because an account that requires 2FA
  // for writes is asked to approve the publish in the browser, and only npm
  // asks. pnpm 11 sends the upload without the approval, and npm answers it
  // with a 404.
  const packDir = mkdtempSync(path.join(tmpdir(), 'nuabase-release-'));
  const tarball = path.join(packDir, 'package.tgz');
  const args = ['publish', tarball, '--access', 'public'];
  if (dryRun) args.push('--dry-run');

  const stdin = publishStdin();
  try {
    run('pnpm', ['pack', '--out', tarball], process.env, 'inherit');
    run('npm', args, process.env, [stdin.fd, 'inherit', 'inherit'], packDir);
  } finally {
    stdin.close();
    rmSync(packDir, { recursive: true, force: true });
  }
  signale.success(`${name}@${version} has been ${dryRun ? 'packed (dry run)' : 'published'}`);
}

try {
  release();
} catch (err) {
  signale.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
