import path from 'path';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

const nodeVersion = parseInt(process.version.substring(1));
if (isNaN(nodeVersion) || nodeVersion < 20) {
  console.error('need node >= v20');
  process.exit(1);
}

const outPath = 'out';

function wgslPlugin() {
  return {
    name: 'wgsl-plugin',
    transform(code, id) {
      if (id.endsWith('.wgsl')) {
        return {
          code: `export default \`${code}\`;`,
          map: { mappings: '' },
        };
      }
    },
  };
}

function makeRelativeToCWD(id) {
  return path.relative(process.cwd(), path.normalize(id)).replaceAll('\\', '/');
}

function filenamePlugin() {
  return {
    name: 'filename-plugin',
    transform(code, id) {
      return {
        code: code.replaceAll(
          '__DIRNAME__',
          () => `${JSON.stringify(makeRelativeToCWD(path.dirname(id)))}`
        ),
        map: { mappings: '' },
      };
    },
  };
}

export default [
  {
    input: 'src/main.ts',
    output: [{ file: `${outPath}/main.js`, format: 'esm', sourcemap: true }],
    plugins: [
      wgslPlugin(),
      nodeResolve(),
      commonjs(),
      filenamePlugin(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    watch: { clearScreen: false },
  },
];
