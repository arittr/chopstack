import { defineConfig } from 'tsup';

export default defineConfig([
  {
    clean: true,
    dts: {
      entry: {
        index: 'src/index.ts',
      },
    },
    entry: {
      index: 'src/index.ts',
    },
    esbuildPlugins: [],
    format: ['esm'],
    minify: false,
    outDir: 'dist',
    platform: 'node',
    shims: false,
    skipNodeModulesBundle: true,
    sourcemap: true,
    splitting: false,
    target: 'node18',
    treeshake: true,
  },
]);
