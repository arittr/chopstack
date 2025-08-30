import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'bin/chopstack': 'src/bin/chopstack.ts',
    },
    platform: 'node',
    outDir: 'dist',
    format: ['esm'],
    target: 'node18',
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    dts: {
      entry: {
        index: 'src/index.ts',
      },
    },
    skipNodeModulesBundle: true,
    shims: false,
    // Preserve CLI shebang from src/bin/chopstack.ts
    // esbuild keeps the shebang on entry files automatically
  },
]);
