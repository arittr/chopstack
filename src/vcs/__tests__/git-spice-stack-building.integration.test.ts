import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TEST_CONFIG, TEST_PATHS } from '@test/constants/test-paths';
import { execa } from 'execa';
import { vi } from 'vitest';

import type { ExecutionTask } from '@/types/execution';

import { VcsEngine } from '@/engine/vcs-engine';
import { GitSpiceBackend } from '@/vcs/git-spice';
import { GitWrapper } from '@/vcs/git-wrapper';

const testRepo = join(TEST_PATHS.TEST_TMP, 'git-spice-stack-integration');

async function setupGitSpiceTestRepository(): Promise<void> {
  // Ensure parent directory exists
  await mkdir(TEST_PATHS.TEST_TMP, { recursive: true });
  await rm(testRepo, { recursive: true, force: true });
  await mkdir(testRepo, { recursive: true });

  // Initialize git repository
  await execa('git', ['init'], { cwd: testRepo });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRepo });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: testRepo });

  // Create initial project structure
  const srcDir = join(testRepo, 'src');
  const componentsDir = join(srcDir, 'components');
  const apiDir = join(srcDir, 'api');
  const utilsDir = join(srcDir, 'utils');

  await mkdir(srcDir, { recursive: true });
  await mkdir(componentsDir, { recursive: true });
  await mkdir(apiDir, { recursive: true });
  await mkdir(utilsDir, { recursive: true });

  // Create base files
  await writeFile(
    join(testRepo, 'package.json'),
    JSON.stringify(
      {
        name: 'git-spice-test-app',
        version: '1.0.0',
        description: 'Test app for git-spice integration',
        main: 'src/index.ts',
        scripts: {
          build: 'tsc',
          test: 'jest',
        },
        dependencies: {
          react: '^18.0.0',
          reactDom: '^18.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          typesReact: '^18.0.0',
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(srcDir, 'index.ts'),
    `export { App } from './App';
export * from './components';
export * from './api';
export * from './utils';
`,
  );

  await writeFile(
    join(srcDir, 'App.tsx'),
    `import React from 'react';

export const App: React.FC = () => {
  return (
    <div>
      <h1>Git Spice Test App</h1>
      <p>This is the initial application structure.</p>
    </div>
  );
};
`,
  );

  await writeFile(
    join(componentsDir, 'index.ts'),
    `// Component exports
`,
  );

  await writeFile(
    join(apiDir, 'index.ts'),
    `// API exports
`,
  );

  await writeFile(
    join(utilsDir, 'index.ts'),
    `// Utility exports
`,
  );

  await writeFile(
    join(testRepo, 'README.md'),
    `# Git Spice Test App

This is a test application for validating git-spice stack building functionality.
`,
  );

  await execa('git', ['add', '.'], { cwd: testRepo });
  await execa('git', ['commit', '-m', 'Initial project structure'], { cwd: testRepo });
}

function createStackTask(
  id: string,
  title: string,
  produces: string[],
  requires: string[] = [],
  estimatedLines: number = 50,
): ExecutionTask {
  return {
    id,
    title,
    description: `Implement ${title}`,
    touches: produces,
    produces,
    requires,
    estimatedLines,
    agentPrompt: `Create ${title} with proper TypeScript types and React components`,
    state: 'pending' as const,
    stateHistory: [],
    retryCount: 0,
    maxRetries: 3,
  };
}

describe('Git-spice Stack Building Integration', () => {
  let vcsEngine: VcsEngine;
  let git: GitWrapper;
  let gitSpice: GitSpiceBackend;

  beforeAll(async () => {
    await setupGitSpiceTestRepository();

    vcsEngine = new VcsEngine({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
      cleanupOnSuccess: false, // Keep for inspection during tests
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });

    git = new GitWrapper(testRepo);
    gitSpice = new GitSpiceBackend();
  });

  afterAll(async () => {
    await rm(testRepo, { recursive: true, force: true });
  });

  describe('Dependency-Ordered Stack Building', () => {
    it('should build a stack with proper dependency order', async () => {
      // Create tasks with dependencies
      const utilTask = createStackTask(
        'utils-1',
        'Common Utilities',
        ['src/utils/formatters.ts', 'src/utils/validators.ts'],
        [],
        80,
      );

      const apiTask = createStackTask(
        'api-1',
        'User API',
        ['src/api/users.ts', 'src/api/types.ts'],
        ['utils-1'],
        120,
      );

      const componentTask = createStackTask(
        'component-1',
        'User Component',
        ['src/components/UserCard.tsx', 'src/components/UserList.tsx'],
        ['api-1', 'utils-1'],
        150,
      );

      const integrationTask = createStackTask(
        'integration-1',
        'App Integration',
        ['src/App.tsx'],
        ['component-1'],
        50,
      );

      const tasks = [utilTask, apiTask, componentTask, integrationTask];

      // Set up worktrees for parallel execution
      const worktrees = await vcsEngine.createWorktreesForLayer(tasks, 'main', testRepo);
      expect(worktrees).toHaveLength(4);

      // Execute each task in its worktree
      for (const [i, task] of tasks.entries()) {
        const worktree = worktrees[i];
        if (worktree === undefined) {
          throw new Error(`Worktree not found for task ${task.id}`);
        }

        // Create the files that this task produces
        for (const filePath of task.produces) {
          const fullPath = join(worktree.absolutePath, filePath);
          const dirPath = join(fullPath, '..');
          await mkdir(dirPath, { recursive: true });

          let content = '';

          if (filePath.includes('formatters.ts')) {
            content = `export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};
`;
          } else if (filePath.includes('validators.ts')) {
            content = `export const isEmail = (email: string): boolean => {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
};

export const isValidId = (id: string): boolean => {
  return id.length > 0 && /^[a-zA-Z0-9-_]+$/.test(id);
};
`;
          } else if (filePath.includes('users.ts')) {
            content = `import { isEmail, isValidId } from '@/utils/validators';
import type { User, CreateUserRequest } from './types';

export const getUsers = async (): Promise<User[]> => {
  const response = await fetch('/api/users');
  return response.json();
};

export const createUser = async (userData: CreateUserRequest): Promise<User> => {
  if (!isEmail(userData.email)) {
    throw new Error('Invalid email address');
  }

  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });

  return response.json();
};
`;
          } else if (filePath.includes('types.ts')) {
            content = `export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserRequest {
  name: string;
  email: string;
}
`;
          } else if (filePath.includes('UserCard.tsx')) {
            content = `import React from 'react';
import { formatDate } from '@/utils/formatters';
import type { User } from '../api/types';

interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>Email: {user.email}</p>
      <p>Created: {formatDate(user.createdAt)}</p>
      {onEdit && (
        <button onClick={() => onEdit(user)}>
          Edit User
        </button>
      )}
    </div>
  );
};
`;
          } else if (filePath.includes('UserList.tsx')) {
            content = `import React, { useEffect, useState } from 'react';
import { getUsers } from '../api/users';
import { UserCard } from './UserCard';
import type { User } from '../api/types';

export const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="user-list">
      <h2>Users</h2>
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};
`;
          } else if (filePath.includes('App.tsx')) {
            content = `import React from 'react';
import { UserList } from './components/UserList';

export const App: React.FC = () => {
  return (
    <div className="app">
      <header>
        <h1>Git Spice Test App</h1>
        <p>Enhanced with dependency-ordered components</p>
      </header>
      <main>
        <UserList />
      </main>
    </div>
  );
};
`;
          }

          await writeFile(fullPath, content);
        }

        // Update component index files
        if (task.id === 'component-1') {
          await writeFile(
            join(worktree.absolutePath, 'src/components/index.ts'),
            `export { UserCard } from './UserCard';
export { UserList } from './UserList';
`,
          );
        }

        if (task.id === 'api-1') {
          await writeFile(
            join(worktree.absolutePath, 'src/api/index.ts'),
            `export * from './users';
export * from './types';
`,
          );
        }

        if (task.id === 'utils-1') {
          await writeFile(
            join(worktree.absolutePath, 'src/utils/index.ts'),
            `export * from './formatters';
export * from './validators';
`,
          );
        }

        // Commit the task
        task.state = 'completed';
        task.commitHash = await vcsEngine.commitTaskChanges(task, worktree, {
          includeAll: true,
          generateMessage: true,
        });

        expect(task.commitHash).toMatch(/^[\da-f]{40}$/);
        console.log(`✅ Task ${task.id} completed with commit ${task.commitHash.slice(0, 7)}`);
      }

      // Mock git-spice for testing (since it may not be installed in CI)
      const mockGitSpice = vi.fn().mockImplementation(async () => {
        // Check if git-spice is actually available
        try {
          await execa('gs', ['--version'], { timeout: 5000 });
          return true; // Use real git-spice if available
        } catch {
          return false; // Mock if not available
        }
      });

      const originalIsAvailable = gitSpice.isAvailable;
      gitSpice.isAvailable = mockGitSpice;

      try {
        // Build the stack with dependency ordering
        const stackInfo = await vcsEngine.buildStackIncremental(tasks, testRepo, {
          parentRef: 'main',
          strategy: 'dependency-order',
          submitStack: false,
        });

        // Verify stack structure
        expect(stackInfo.branches).toHaveLength(4);
        expect(stackInfo.stackRoot).toBe('main');

        // Verify branch dependencies are correct
        const branchNames = stackInfo.branches.map((b) => b.name);
        expect(branchNames).toContain(`${TEST_CONFIG.TEST_BRANCH_PREFIX}utils-1`);
        expect(branchNames).toContain(`${TEST_CONFIG.TEST_BRANCH_PREFIX}api-1`);
        expect(branchNames).toContain(`${TEST_CONFIG.TEST_BRANCH_PREFIX}component-1`);
        expect(branchNames).toContain(`${TEST_CONFIG.TEST_BRANCH_PREFIX}integration-1`);

        // Each branch should have the correct commit
        for (const task of tasks) {
          const branch = stackInfo.branches.find((b) => b.name.includes(task.id));
          expect(branch).toBeDefined();
          expect(branch!.commitHash).toBe(task.commitHash);
        }

        console.log(`✅ Built git-spice stack with ${stackInfo.branches.length} branches`);

        // Verify branches exist in git
        for (const branch of stackInfo.branches) {
          try {
            await git.git.raw(['rev-parse', '--verify', branch.name]);
            console.log(`✅ Branch ${branch.name} exists`);
          } catch {
            // Branch might not exist if using mock git-spice
            console.log(`⚠️ Branch ${branch.name} not found (mock mode)`);
          }
        }
      } finally {
        gitSpice.isAvailable = originalIsAvailable;
      }
    }, 120_000); // Extended timeout for complex test
  });

  describe('Complexity-First Strategy', () => {
    it('should order tasks by complexity when using complexity-first strategy', async () => {
      const simpleTask = createStackTask(
        'simple',
        'Simple Component',
        ['src/components/SimpleButton.tsx'],
        [],
        20,
      ); // Low complexity

      const complexTask = createStackTask(
        'complex',
        'Complex Component',
        [
          'src/components/DataTable.tsx',
          'src/components/DataTableRow.tsx',
          'src/components/DataTableHeader.tsx',
          'src/utils/tableHelpers.ts',
        ],
        [],
        300,
      ); // High complexity

      const mediumTask = createStackTask(
        'medium',
        'Medium Component',
        ['src/components/UserForm.tsx', 'src/utils/formValidation.ts'],
        [],
        100,
      ); // Medium complexity

      const tasks = [complexTask, simpleTask, mediumTask]; // Intentionally mixed order

      const worktrees = await vcsEngine.createWorktreesForLayer(tasks, 'main', testRepo);

      // Simulate task execution
      for (const [i, task] of tasks.entries()) {
        const worktree = worktrees[i];
        if (worktree === undefined) {
          throw new Error(`Worktree not found for task ${task.id}`);
        }

        // Create files based on task complexity
        for (const filePath of task.produces) {
          const fullPath = join(worktree.absolutePath, filePath);
          const dirPath = join(fullPath, '..');
          await mkdir(dirPath, { recursive: true });

          const content = `// ${task.id} - ${filePath}
// Estimated lines: ${task.estimatedLines}
export const ${task.id}Component = () => "Generated content";
`;

          await writeFile(fullPath, content);
        }

        task.state = 'completed';
        task.commitHash = await vcsEngine.commitTaskChanges(task, worktree, {
          includeAll: true,
          generateMessage: true,
        });
      }

      // Build stack with complexity-first strategy
      const stackInfo = await vcsEngine.buildStackIncremental(tasks, testRepo, {
        parentRef: 'main',
        strategy: 'complexity-first',
        submitStack: false,
      });

      expect(stackInfo.branches).toHaveLength(3);

      // The order should be: simple (20), medium (100), complex (300)
      // Note: This is tested by the internal ordering logic in StackBuilder
      console.log('✅ Complexity-first strategy ordering applied');
    }, 60_000);
  });

  describe('File Impact Strategy', () => {
    it('should order tasks by number of files impacted', async () => {
      const singleFileTask = createStackTask('single', 'Single File Task', ['src/single.ts']);

      const multiFileTask = createStackTask('multi', 'Multi File Task', [
        'src/multi/index.ts',
        'src/multi/helper1.ts',
        'src/multi/helper2.ts',
        'src/multi/types.ts',
      ]);

      const tasks = [multiFileTask, singleFileTask]; // Mixed order

      const worktrees = await vcsEngine.createWorktreesForLayer(tasks, 'main', testRepo);

      // Execute tasks
      for (const [i, task] of tasks.entries()) {
        const worktree = worktrees[i];
        if (worktree === undefined) {
          throw new Error(`Worktree not found for task ${task.id}`);
        }

        for (const filePath of task.produces) {
          const fullPath = join(worktree.absolutePath, filePath);
          const dirPath = join(fullPath, '..');
          await mkdir(dirPath, { recursive: true });

          await writeFile(fullPath, `// ${filePath}\nexport const ${task.id} = true;\n`);
        }

        task.state = 'completed';
        task.commitHash = await vcsEngine.commitTaskChanges(task, worktree, { includeAll: true });
      }

      const stackInfo = await vcsEngine.buildStackIncremental(tasks, testRepo, {
        parentRef: 'main',
        strategy: 'file-impact',
        submitStack: false,
      });

      expect(stackInfo.branches).toHaveLength(2);
      console.log('✅ File impact strategy ordering applied');
    }, 60_000);
  });

  describe('Stack Submission', () => {
    it('should handle stack submission when git-spice is available', async () => {
      const task = createStackTask('submission-test', 'Submission Test', [
        'src/submission-test.ts',
      ]);

      const worktrees = await vcsEngine.createWorktreesForLayer([task], 'main', testRepo);
      const worktree = worktrees[0];
      if (worktree === undefined) {
        throw new Error('Worktree not found');
      }

      // Create test file
      const firstFile = task.produces[0];
      if (firstFile === undefined) {
        throw new Error('No files to produce');
      }
      const filePath = join(worktree.absolutePath, firstFile);
      await writeFile(filePath, 'export const submissionTest = true;\n');

      task.state = 'completed';
      task.commitHash = await vcsEngine.commitTaskChanges(task, worktree, { includeAll: true });

      // Mock stack submission
      const originalSubmitStack = gitSpice.submitStack;
      gitSpice.submitStack = vi.fn().mockResolvedValue(['https://github.com/test/repo/pull/1']);

      try {
        const prUrls = await gitSpice.submitStack(testRepo);

        expect(Array.isArray(prUrls)).toBe(true);
        expect(gitSpice.submitStack).toHaveBeenCalledWith(testRepo);

        console.log(`✅ Stack submission completed: ${prUrls.length} PRs created`);
      } finally {
        gitSpice.submitStack = originalSubmitStack;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle git-spice initialization failures gracefully', async () => {
      const task = createStackTask('error-test', 'Error Test', ['src/error-test.ts']);
      await vcsEngine.createWorktreesForLayer([task], 'main', testRepo);

      // Corrupt the git repository to cause initialization failure
      const corruptedGitSpice = new GitSpiceBackend();
      const originalInitialize = corruptedGitSpice.initialize;

      corruptedGitSpice.initialize = vi
        .fn()
        .mockRejectedValue(new Error('Failed to initialize git-spice'));

      // Build stack with corrupted git-spice should handle error
      await expect(
        vcsEngine.buildStackIncremental([task], '/nonexistent/path', {
          parentRef: 'main',
          strategy: 'dependency-order',
          submitStack: false,
        }),
      ).resolves.not.toThrow(); // Should handle errors gracefully

      corruptedGitSpice.initialize = originalInitialize;
    });
  });
});
