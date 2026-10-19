import path from 'node:path';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { dts } from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import nodeExternals from 'rollup-plugin-node-externals';

const input = path.join(process.cwd(), './src/index.ts');

export default [
  {
    input,
    output: [
      { format: 'es', file: './dist/esm/index.mjs' },
      { format: 'cjs', file: './dist/cjs/index.cjs' },
    ],
    plugins: [
      // The peer dependency (zod) stays external.
      nodeExternals(),
      nodeResolve({ extensions: ['.ts', '.js'] }),
      esbuild({
        sourceMap: false,
        tsconfig: path.resolve(process.cwd(), 'tsconfig.build.json'),
      }),
    ],
  },
  {
    // One self-contained declaration file per module format.
    input,
    output: [{ file: './dist/types/index.d.mts' }, { file: './dist/types/index.d.cts' }],
    plugins: [dts({ tsconfig: path.resolve(process.cwd(), 'tsconfig.build.json') })],
  },
];
