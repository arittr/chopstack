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
      'bin/chopstack': 'src/entry/cli/chopstack.ts',
      index: 'src/index.ts',
    },
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
    // Preserve CLI shebang from src/bin/chopstack.ts
    // esbuild keeps the shebang on entry files automatically
  },
]);
