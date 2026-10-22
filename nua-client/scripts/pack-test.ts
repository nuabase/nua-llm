import signale from 'signale';
import { $ } from 'zx';

const ALLOWED_FILES = ['CHANGELOG.md', 'LICENSE', 'README.md', 'package.json'];

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

  // Every entry point resolves, with the right module format, for node10,
  // node16 from CJS and from ESM, and bundler consumers.
  await $`attw --pack .`;
}

packCheck();
