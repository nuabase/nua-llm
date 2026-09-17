import path from 'node:path';
import fs from 'fs-extra';
import signale from 'signale';
import { $ } from 'zx';

const TYPES_DIR = path.join(process.cwd(), 'dist/types');
const ENTRY_POINTS = ['index', 'local-agent'];

// nua-llm-core is bundled into this package rather than published, so its
// declarations are copied in, and imports of it are pointed at the copy.
const CORE_DIST = path.join(process.cwd(), '../nua-llm-core/dist');
const CORE_TYPES_DIR = path.join(TYPES_DIR, 'nua-llm-core');
const CORE_IMPORT = /(from\s+|import\()(['"])nua-llm-core(\/local-agent)?\2/g;

async function generateDts() {
  try {
    await $`pnpm tsc --project tsconfig.build.json`;
    await vendorCoreTypes();

    for (const entry of ENTRY_POINTS) {
      const declaration = path.join(TYPES_DIR, `${entry}.d.ts`);
      await fs.copy(declaration, path.join(TYPES_DIR, `${entry}.d.mts`));
      await fs.copy(declaration, path.join(TYPES_DIR, `${entry}.d.cts`));
      await fs.remove(declaration);
    }
  } catch (err) {
    signale.error('Failed to generate d.ts files');
    signale.error(err);
    process.exit(1);
  }
}

async function vendorCoreTypes() {
  await fs.copy(CORE_DIST, CORE_TYPES_DIR, {
    filter: (source) => fs.statSync(source).isDirectory() || source.endsWith('.d.ts'),
  });

  for (const file of await declarationFiles(TYPES_DIR)) {
    if (file.startsWith(CORE_TYPES_DIR + path.sep)) continue;

    const content = await fs.readFile(file, 'utf8');
    const rewritten = content.replace(
      CORE_IMPORT,
      (_match, prefix: string, quote: string, subpath: string | undefined) => {
        const target = path.join(CORE_TYPES_DIR, subpath ? 'local-agent' : 'index');
        const relative = path.relative(path.dirname(file), target).split(path.sep).join('/');
        const specifier = relative.startsWith('.') ? relative : `./${relative}`;
        return `${prefix}${quote}${specifier}${quote}`;
      }
    );
    if (rewritten !== content) {
      await fs.writeFile(file, rewritten);
    }
  }
}

async function declarationFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return declarationFiles(fullPath);
      return Promise.resolve(entry.name.endsWith('.d.ts') ? [fullPath] : []);
    })
  );
  return nested.flat();
}

generateDts();
