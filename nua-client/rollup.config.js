import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { dts } from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import nodeExternals from 'rollup-plugin-node-externals';

// Two entry points: "nuabase", which must load in edge runtimes (such as
// Cloudflare Workers or Vercel Edge), and the Node-only "nuabase/local-agent",
// which runs coding-agent CLIs. Code both use goes into shared chunks.
const input = {
  index: path.join(process.cwd(), './src/index.ts'),
  'local-agent': path.join(process.cwd(), './src/local-agent.ts'),
};

const js = {
  input,
  output: [
    {
      format: 'es',
      dir: './dist/esm',
      entryFileNames: '[name].mjs',
      chunkFileNames: 'chunks/[name]-[hash].mjs',
    },
    {
      format: 'cjs',
      dir: './dist/cjs',
      entryFileNames: '[name].cjs',
      chunkFileNames: 'chunks/[name]-[hash].cjs',
    },
  ],
  plugins: [
    commonjs(),
    nodeExternals({
      // `exclude` here means "do NOT treat as external" — i.e. bundle it.
      //
      // nua-llm-core (and its "nua-llm-core/local-agent" entry point) is not
      // published to npm, so consumers cannot resolve it at runtime; it must
      // be inlined.
      exclude: [/^nua-llm-core(\/.*)?$/],
    }),
    nodeResolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
    esbuild({
      sourceMap: false,
      tsconfig: path.resolve(process.cwd(), 'tsconfig.build.json'),
    }),
    replace({ preventAssignment: true }),
  ],
};

// One self-contained declaration file per entry and format, nua-llm-core
// inlined, from the same entry points as the JavaScript above.
const types = (ext) => ({
  input,
  output: { dir: './dist', entryFileNames: `[name].d.${ext}`, chunkFileNames: `chunks/[name]-[hash].d.${ext}` },
  plugins: [dts({ tsconfig: 'tsconfig.build.json', respectExternal: true })],
  external: ['zod'],
});

export default [js, types('mts'), types('cts')];
