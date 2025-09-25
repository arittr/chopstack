import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('src', import.meta.url).pathname,
      '@test': new URL('test', import.meta.url).pathname,
      '@tmp': new URL('test/tmp', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**', 'test/tmp/**'],
    globals: true,
    // Base patterns - will be overridden by projects
    include: [],
    // Projects for different test types
    projects: [
      {
        extends: true,
        test: {
          exclude: [
            'src/**/__tests__/*.integration.test.ts',
            'test/e2e/**/*.test.ts',
            'test/execution/**/*.test.ts',
          ],
          include: ['src/**/__tests__/*.test.ts'],
          name: 'unit',
          setupFiles: ['test/setup/vitest-unit.setup.ts', 'test/setup/worktree-cleanup.ts'],
          testTimeout: 5000,
        },
      },
      {
        extends: true,
        test: {
          exclude: ['test/e2e/**/*.test.ts', 'test/execution/**/*.test.ts'],
          include: ['src/**/__tests__/*.integration.test.ts'],
          name: 'integration',
          setupFiles: ['test/setup/vitest-integration.setup.ts', 'test/setup/worktree-cleanup.ts'],
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          exclude: ['test/execution/**/*.test.ts'],
          include: ['test/e2e/**/*.test.ts'],
          name: 'e2e',
          setupFiles: ['test/setup/vitest-e2e.setup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          exclude: ['test/e2e/**/*.test.ts'],
          include: ['test/execution/**/*.test.ts'],
          name: 'execution',
          setupFiles: ['test/setup/vitest-execution.setup.ts'],
          testTimeout: 60_000,
        },
      },
    ],

    setupFiles: ['test/setup/worktree-cleanup.ts'],
  },
});
