import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import esbuild from 'rollup-plugin-esbuild';
import nodeExternals from 'rollup-plugin-node-externals';

export default {
  input: path.join(process.cwd(), './src/index.ts'),
  output: [
    { format: 'es', file: './dist/esm/index.mjs' },
    { format: 'cjs', file: './dist/cjs/index.cjs' },
  ],
  // Plugin order matters. Rollup runs each plugin's resolveId/load/transform
  // hooks in the order listed here, so the pipeline for a file like
  // `ajv/dist/refs/json-schema-draft-07.json` is:
  //
  //   1. nodeExternals decides whether the module stays external (left as a
  //      bare `import`/`require` in the output) or is bundled. ajv must NOT
  //      be external — see the `exclude` list below for why.
  //   2. nodeResolve turns the bare specifier into an absolute file path.
  //   3. json() loads the .json file and emits it as an ES module whose
  //      default export is the parsed object. This is what lets the JSON get
  //      inlined into the bundle as a plain JS object literal.
  //   4. commonjs() rewrites ajv's CJS `require("./refs/*.json")` calls into
  //      ESM `import` bindings that point at the module json() produced.
  //
  // If json() is missing, step 4 still rewrites the require() into an
  // `import` — but the target is the raw .json file with no loader in front
  // of it, producing `import x from '.../foo.json'` with no
  // `with { type: "json" }` attribute. Node 24 rejects that at load time
  // with ERR_IMPORT_ATTRIBUTE_MISSING, crashing any ESM consumer of the
  // bundle. json() has to be listed here (before commonjs cares) so the
  // JSON file is already a JS module by the time commonjs rewrites imports.
  plugins: [
    json(),
    commonjs(),
    nodeExternals({
      // `exclude` here means "do NOT treat as external" — i.e. bundle it.
      //
      // - nua-llm-core: not published to npm, so consumers cannot resolve it
      //   at runtime; it must be inlined.
      // - ajv: must be bundled so @rollup/plugin-json can inline its
      //   meta-schema JSON files (see the plugin-order comment above).
      //   Leaving ajv external would put bare `import ... from
      //   'ajv/dist/refs/json-schema-draft-07.json'` statements in the ESM
      //   output, which Node 24 refuses to load without an import attribute.
      exclude: ['nua-llm-core', 'ajv'],
    }),
    nodeResolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
    esbuild({
      sourceMap: false,
      tsconfig: path.resolve(process.cwd(), 'tsconfig.build.json'),
    }),
    replace({ preventAssignment: true }),
  ],
};
