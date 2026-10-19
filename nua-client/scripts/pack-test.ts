import { readFileSync } from 'node:fs';
import signale from 'signale';
import { $ } from 'zx';

const ALLOWED_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', 'package.json'];

// nuabase never sends data to the Nuabase API; that client is the separate
// @nuabase/gateway package. A built file that names the API means gateway code
// has been bundled in, and one that names the package means it is imported:
// rollup leaves a dependency's import in place, without the API's URL.
const NUABASE_API_REFERENCE = /api\.nuabase\.com|NUABASE_API|@nuabase\/gateway/;

async function packCheck() {
  const result = await $`npm pack --dry-run --json`;
  const files: { path: string }[] = JSON.parse(result.stdout)[0].files;
  const extraFiles = files
    .filter((file) => !file.path.startsWith('dist/') && !ALLOWED_FILES.includes(file.path))
    .map((file) => file.path);

  if (extraFiles.length > 0) {
    signale.error(
      'The packed package contains unexpected extra files. Add these files to the .npmignore file to exclude them from the published package.'
    );
    extraFiles.forEach((file) => signale.log(file));
    process.exit(1);
  }

  const testFiles = files
    .filter((file) => file.path.startsWith('dist/types/__tests__/'))
    .map((file) => file.path);

  if (testFiles.length > 0) {
    signale.error('The packed package contains test declarations:');
    testFiles.forEach((file) => signale.log(file));
    process.exit(1);
  }

  const filesNamingTheApi = files
    .filter((file) => file.path.startsWith('dist/'))
    .filter((file) => NUABASE_API_REFERENCE.test(readFileSync(file.path, 'utf8')))
    .map((file) => file.path);

  if (filesNamingTheApi.length > 0) {
    signale.error(
      'These packed files refer to the Nuabase API or import @nuabase/gateway. nuabase must not call the API; that code belongs in @nuabase/gateway.'
    );
    filesNamingTheApi.forEach((file) => signale.log(file));
    process.exit(1);
  }
}

packCheck();
