import { readFileSync } from 'node:fs';
import signale from 'signale';
import { $ } from 'zx';

const ALLOWED_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', 'package.json'];
const DIST_FILES = [
  'dist/cjs/index.cjs',
  'dist/esm/index.mjs',
  'dist/types/index.d.cts',
  'dist/types/index.d.mts',
];

// A node: import would break the package in browsers, where it runs with fetchToken.
const NODE_IMPORT = /['"]node:/;

function fail(message: string, paths: string[]): never {
  signale.error(message);
  paths.forEach((p) => signale.log(p));
  process.exit(1);
}

async function packCheck() {
  const result = await $`npm pack --dry-run --json`;
  const files: string[] = JSON.parse(result.stdout)[0].files.map(
    (file: { path: string }) => file.path
  );

  const unexpected = files.filter(
    (file) => !ALLOWED_FILES.includes(file) && !DIST_FILES.includes(file)
  );
  if (unexpected.length > 0) {
    fail('The packed package contains unexpected files:', unexpected);
  }

  const missing = DIST_FILES.filter((file) => !files.includes(file));
  if (missing.length > 0) {
    fail('The packed package is missing build output:', missing);
  }

  const nodeImports = DIST_FILES.filter((file) => NODE_IMPORT.test(readFileSync(file, 'utf8')));
  if (nodeImports.length > 0) {
    fail('These packed files import a Node.js built-in, which breaks browsers:', nodeImports);
  }
}

packCheck();
