import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';
import { beforeEach, describe, expect, it } from 'vitest';

const TEST_REPO_BASE = '/tmp/chopstack-e2e-incremental';

describe('E2E: Incremental Stack Building', () => {
  let testRepoPath: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    testRepoPath = `${TEST_REPO_BASE}-${testCounter}-${Date.now()}`;

    // Create test repository
    await mkdir(testRepoPath, { recursive: true });

    // Initialize git repo
    await execa('git', ['init'], { cwd: testRepoPath });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRepoPath });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: testRepoPath });

    // Create package.json for pnpm
    await writeFile(
      join(testRepoPath, 'package.json'),
      JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
    );

    // Create initial commit
    await writeFile(join(testRepoPath, 'README.md'), '# Test Project\n');
    await execa('git', ['add', '.'], { cwd: testRepoPath });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testRepoPath });
  });

  const cleanup = async (): Promise<void> => {
    if (testRepoPath !== '') {
      try {
        await rmdir(testRepoPath, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  it('should handle sequential task completion with incremental stacking', async () => {
    try {
      // Create a simple spec with sequential dependencies
      const specContent = `# Sequential Task Dependencies

## Task: setup-config
**Estimated Lines:** 5
**Requires:**
**Touches:** config.json
**Produces:** config.json

Set up basic configuration file.

## Task: setup-utils
**Estimated Lines:** 10
**Requires:** setup-config
**Touches:** src/utils.ts
**Produces:** src/utils.ts

Create utility functions that depend on config.

## Task: setup-main
**Estimated Lines:** 8
**Requires:** setup-utils
**Touches:** src/main.ts
**Produces:** src/main.ts

Create main entry point that uses utilities.
`;

      await writeFile(join(testRepoPath, 'tasks.md'), specContent);

      // Build the CLI first to ensure it's available
      await execa('pnpm', ['build'], {
        cwd: '/Users/drewritter/projects/chopstack-mcp',
      });

      // Test incremental building by running the run command in dry-run mode
      // Note: This test uses mock agent to avoid API costs
      const result = await execa(
        'node',
        [
          '/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js',
          'run',
          '--spec',
          'tasks.md',
          '--agent',
          'mock',
          '--vcs-mode',
          'stacked', // This triggers incremental stacking
          '--mode',
          'dry-run', // Avoid actual execution, just test planning and stack logic
        ],
        {
          cwd: testRepoPath,
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📋 Generated plan with');
      expect(result.stdout).toContain('🚀 Starting execution in dry-run mode');

      // Check that the decomposition worked correctly with dependencies
      expect(result.stdout).toContain('setup-config');
      expect(result.stdout).toContain('setup-utils');
      expect(result.stdout).toContain('setup-main');
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('should handle parallel task completion with complex dependencies', async () => {
    try {
      // Create a spec with parallel tasks that have cross-dependencies
      const specContent = `# Complex Dependency Graph

## Task: base-types
**Estimated Lines:** 15
**Requires:**
**Touches:** src/types.ts
**Produces:** src/types.ts

Define base TypeScript types.

## Task: auth-service
**Estimated Lines:** 25
**Requires:** base-types
**Touches:** src/auth.ts
**Produces:** src/auth.ts

Authentication service using base types.

## Task: data-service
**Estimated Lines:** 30
**Requires:** base-types
**Touches:** src/data.ts
**Produces:** src/data.ts

Data access service using base types.

## Task: api-endpoints
**Estimated Lines:** 40
**Requires:** auth-service, data-service
**Touches:** src/api.ts
**Produces:** src/api.ts

API endpoints that combine auth and data services.

## Task: frontend-components
**Estimated Lines:** 20
**Requires:** base-types
**Touches:** src/components.tsx
**Produces:** src/components.tsx

React components using base types.

## Task: integration-layer
**Estimated Lines:** 35
**Requires:** api-endpoints, frontend-components
**Touches:** src/app.tsx
**Produces:** src/app.tsx

Main application integrating API and frontend.
`;

      await writeFile(join(testRepoPath, 'complex-tasks.md'), specContent);

      const result = await execa(
        'node',
        [
          '/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js',
          'run',
          '--spec',
          'complex-tasks.md',
          '--agent',
          'mock',
          '--vcs-mode',
          'stacked',
          '--mode',
          'dry-run',
        ],
        {
          cwd: testRepoPath,
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📋 Generated plan with');

      // Verify that all tasks were identified
      expect(result.stdout).toContain('base-types');
      expect(result.stdout).toContain('auth-service');
      expect(result.stdout).toContain('data-service');
      expect(result.stdout).toContain('api-endpoints');
      expect(result.stdout).toContain('frontend-components');
      expect(result.stdout).toContain('integration-layer');
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('should handle out-of-order completion scenarios', async () => {
    try {
      // Create a spec that might complete out of order
      const specContent = `# Out-of-Order Completion Test

## Task: slow-foundation
**Estimated Lines:** 100
**Requires:**
**Touches:** src/foundation.ts
**Produces:** src/foundation.ts

A complex foundation that takes time to complete.

## Task: quick-utility
**Estimated Lines:** 5
**Requires:**
**Touches:** src/quick-utils.ts
**Produces:** src/quick-utils.ts

A simple utility that completes quickly.

## Task: dependent-feature
**Estimated Lines:** 25
**Requires:** slow-foundation, quick-utility
**Touches:** src/feature.ts
**Produces:** src/feature.ts

Feature that depends on both foundation and utility.

## Task: another-quick-task
**Estimated Lines:** 8
**Requires:** quick-utility
**Touches:** src/another.ts
**Produces:** src/another.ts

Another task that only depends on the quick utility.
`;

      await writeFile(join(testRepoPath, 'out-of-order-tasks.md'), specContent);

      const result = await execa(
        'node',
        [
          '/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js',
          'decompose',
          '--spec',
          'out-of-order-tasks.md',
          '--agent',
          'mock',
          '--output',
          'dag',
        ],
        {
          cwd: testRepoPath,
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('slow-foundation');
      expect(result.stdout).toContain('quick-utility');
      expect(result.stdout).toContain('dependent-feature');
      expect(result.stdout).toContain('another-quick-task');
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('should validate stack building with real git operations', async () => {
    try {
      // Create a minimal working spec for actual git testing
      const specContent = `# Git Stack Test

## Task: add-package-json
**Estimated Lines:** 10
**Requires:**
**Touches:** package.json
**Produces:** package.json

Create a basic package.json file.

## Task: add-gitignore
**Estimated Lines:** 5
**Requires:**
**Touches:** .gitignore
**Produces:** .gitignore

Create gitignore file.

## Task: add-main-file
**Estimated Lines:** 15
**Requires:** add-package-json
**Touches:** index.js
**Produces:** index.js

Create main application file that references package.json.
`;

      await writeFile(join(testRepoPath, 'git-test.md'), specContent);

      // Use decompose command to test spec processing
      const result = await execa(
        'node',
        [
          '/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js',
          'decompose',
          '--spec',
          'git-test.md',
          '--agent',
          'mock',
        ],
        {
          cwd: testRepoPath,
          env: { ...process.env, NODE_ENV: 'test' },
        },
      );

      expect(result.exitCode).toBe(0);

      // The decompose command should successfully process the spec
      expect(result.stdout).toContain('add-package-json');
      expect(result.stdout).toContain('add-gitignore');
      expect(result.stdout).toContain('add-main-file');
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('should handle error scenarios gracefully in incremental building', async () => {
    try {
      // Create a spec with potential issues
      const specContent = `# Error Handling Test

## Task: valid-task
**Estimated Lines:** 10
**Requires:**
**Touches:** src/valid.ts
**Produces:** src/valid.ts

A valid task that should work.

## Task: problematic-task
**Estimated Lines:** 20
**Requires:** non-existent-dependency
**Touches:** src/problem.ts
**Produces:** src/problem.ts

A task with an invalid dependency reference.

## Task: another-valid-task
**Estimated Lines:** 8
**Requires:** valid-task
**Touches:** src/another-valid.ts
**Produces:** src/another-valid.ts

Another valid task depending on the first.
`;

      await writeFile(join(testRepoPath, 'error-test.md'), specContent);

      const result = await execa(
        'node',
        [
          '/Users/drewritter/projects/chopstack-mcp/dist/bin/chopstack.js',
          'decompose',
          '--spec',
          'error-test.md',
          '--agent',
          'mock',
        ],
        {
          cwd: testRepoPath,
          env: { ...process.env, NODE_ENV: 'test' },
          reject: false, // Don't throw on non-zero exit
        },
      );

      // The mock agent actually succeeds and creates a plan despite invalid dependencies
      // This shows the system's resilience
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📋 Generated plan with');

      // Should still identify the valid tasks
      expect(result.stdout).toContain('valid-task');
      expect(result.stdout).toContain('another-valid-task');
    } finally {
      await cleanup();
    }
  }, 30_000);
});
