import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
      '@test': './test',
      '@tmp': './test/tmp',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/setup/worktree-cleanup.ts'],
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'test/tmp/**'],

    // Projects for different test types
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['test/setup/vitest-unit.setup.ts', 'test/setup/worktree-cleanup.ts'],
          include: ['src/**/__tests__/*.test.ts'],
          exclude: [
            'src/**/__tests__/*.integration.test.ts',
            'src/utils/__tests__/testing-harness-worktree-manager.test.ts',
            'src/utils/__tests__/cli-runner.test.ts',
            'test/e2e/**/*.test.ts',
            'test/execution/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          setupFiles: ['test/setup/vitest-integration.setup.ts', 'test/setup/worktree-cleanup.ts'],
          include: [
            'src/**/__tests__/*.integration.test.ts',
            'src/utils/__tests__/testing-harness-worktree-manager.test.ts',
            'src/utils/__tests__/cli-runner.test.ts',
          ],
          exclude: ['test/e2e/**/*.test.ts', 'test/execution/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          setupFiles: ['test/setup/vitest-e2e.setup.ts'],
          include: ['test/e2e/**/*.test.ts'],
          exclude: ['test/execution/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'execution',
          setupFiles: ['test/setup/vitest-execution.setup.ts'],
          include: ['test/execution/**/*.test.ts'],
          exclude: ['test/e2e/**/*.test.ts'],
        },
      },
    ],
  },
});
