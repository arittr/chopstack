import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { ExecutionTask } from '../../src/types/execution';

import { VcsEngine } from '../../src/engine/vcs-engine';

const execAsync = promisify(exec);

describe('VcsEngine Integration Tests', () => {
  let testRepo: string;
  let vcsEngine: VcsEngine;

  beforeEach(async () => {
    testRepo = path.join(__dirname, '../tmp', `vcs-test-${Date.now()}`);
    await fs.mkdir(testRepo, { recursive: true });

    await execAsync('git init', { cwd: testRepo });
    await execAsync('git config user.name "Test User"', { cwd: testRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepo });

    await fs.writeFile(path.join(testRepo, 'README.md'), '# Test Repo\n');
    await execAsync('git add README.md', { cwd: testRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepo });

    vcsEngine = new VcsEngine({
      shadowPath: '.test-shadows',
      branchPrefix: 'test/',
      cleanupOnSuccess: false, // Keep for inspection during tests
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Worktree Workflow', () => {
    it('should create worktrees, commit changes, and cleanup', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'add-component',
          title: 'Add User Component',
          description: 'Create a reusable user component',
          touches: [],
          produces: ['src/components/User.tsx'],
          requires: [],
          estimatedLines: 50,
          agentPrompt: 'Create a user component',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'add-api',
          title: 'Add User API',
          description: 'Create user API endpoints',
          touches: [],
          produces: ['src/api/users.ts'],
          requires: [],
          estimatedLines: 80,
          agentPrompt: 'Create user API',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      // Phase 1: Create worktrees
      const contexts = await vcsEngine.createWorktreesForLayer(tasks, 'main', testRepo);

      expect(contexts).toHaveLength(2);
      expect(contexts[0]?.taskId).toBe('add-component');
      expect(contexts[1]?.taskId).toBe('add-api');

      // Verify worktrees exist on filesystem
      const verificationPromises = contexts.map(async (context) => {
        const worktreeExists = await fs
          .access(path.join(testRepo, context.worktreePath))
          .then(() => true)
          .catch(() => false);
        expect(worktreeExists).toBe(true);

        // Verify it's a git repo
        const gitDirExists = await fs
          .access(path.join(testRepo, context.worktreePath, '.git'))
          .then(() => true)
          .catch(() => false);
        expect(gitDirExists).toBe(true);
      });

      await Promise.all(verificationPromises);

      // Phase 2: Simulate task execution by creating files
      const componentContext = contexts.find((c) => c.taskId === 'add-component')!;
      const apiContext = contexts.find((c) => c.taskId === 'add-api')!;

      // Create component file
      const componentPath = path.join(testRepo, componentContext.worktreePath);
      await fs.mkdir(path.join(componentPath, 'src/components'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(componentPath, 'src/components/User.tsx'),
        'export const User = () => <div>User Component</div>;',
      );

      // Create API file
      const apiPath = path.join(testRepo, apiContext.worktreePath);
      await fs.mkdir(path.join(apiPath, 'src/api'), { recursive: true });
      await fs.writeFile(
        path.join(apiPath, 'src/api/users.ts'),
        'export const getUserById = (id: string) => ({ id, name: "Test User" });',
      );

      // Phase 3: Commit changes
      const componentTask = tasks.find((t) => t.id === 'add-component')!;
      const apiTask = tasks.find((t) => t.id === 'add-api')!;

      const componentCommit = await vcsEngine.commitTaskChanges(componentTask, componentContext, {
        includeAll: true,
        generateMessage: true,
      });

      const apiCommit = await vcsEngine.commitTaskChanges(apiTask, apiContext, {
        includeAll: true,
        generateMessage: true,
      });

      expect(componentCommit).toMatch(/^[\da-f]{40}$/);
      expect(apiCommit).toMatch(/^[\da-f]{40}$/);

      // Verify commits exist
      const { stdout: componentLog } = await execAsync('git log --oneline', {
        cwd: componentPath,
      });
      expect(componentLog).toContain('Add User Component');
      expect(componentLog).toContain('🤖 Generated with Claude via chopstack');

      const { stdout: apiLog } = await execAsync('git log --oneline', {
        cwd: apiPath,
      });
      expect(apiLog).toContain('Add User API');
      expect(apiLog).toContain('🤖 Generated with Claude via chopstack');

      // Phase 4: Cleanup worktrees
      await vcsEngine.cleanupWorktrees(contexts);

      // Verify worktrees are removed
      const cleanupVerificationPromises = contexts.map(async (context) => {
        const worktreeExists = await fs
          .access(path.join(testRepo, context.worktreePath))
          .then(() => true)
          .catch(() => false);
        expect(worktreeExists).toBe(false);
      });

      await Promise.all(cleanupVerificationPromises);
    });

    it('should handle worktree creation for tasks with dependencies', async () => {
      const plan = {
        tasks: [
          {
            id: 'base-types',
            title: 'Create Base Types',
            description: 'Create foundational TypeScript types',
            touches: [],
            produces: ['src/types.ts'],
            requires: [],
            estimatedLines: 30,
            agentPrompt: 'Create base types',
          },
          {
            id: 'user-service',
            title: 'Create User Service',
            description: 'Create service using base types',
            touches: [],
            produces: ['src/services/user.ts'],
            requires: ['base-types'],
            estimatedLines: 50,
            agentPrompt: 'Create user service',
          },
        ],
      };

      const analysis = await vcsEngine.analyzeWorktreeNeeds(plan, testRepo);

      expect(analysis.requiresWorktrees).toBe(false); // Sequential tasks
      expect(analysis.maxConcurrentTasks).toBe(1);
      expect(analysis.parallelLayers).toBe(2);
      expect(analysis.estimatedDiskUsage).toBe(0); // No parallel execution needed
    });

    it('should generate intelligent commit messages for different file types', async () => {
      const testCases = [
        {
          task: {
            id: 'add-component',
            title: 'Add Button Component',
            description: 'Create reusable button',
            produces: ['src/components/Button.tsx'],
          },
          expectedPattern: /add.*component/i,
        },
        {
          task: {
            id: 'add-api',
            title: 'Add Auth API',
            description: 'Create authentication endpoints',
            produces: ['src/api/auth.ts'],
          },
          expectedPattern: /implement.*api/i,
        },
        {
          task: {
            id: 'add-tests',
            title: 'Add Button Tests',
            description: 'Create test coverage',
            produces: ['src/components/Button.test.tsx'],
          },
          expectedPattern: /add.*test/i,
        },
      ];

      const messagePromises = testCases.map(async (testCase) => {
        const task = {
          ...testCase.task,
          touches: [],
          requires: [],
          estimatedLines: 40,
          agentPrompt: 'Test prompt',
          state: 'pending' as const,
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        };

        const message = await vcsEngine.generateCommitMessage(
          task,
          { files: testCase.task.produces },
          testRepo,
        );

        return { message, testCase };
      });

      const messageResults = await Promise.all(messagePromises);

      for (const { message, testCase } of messageResults) {
        expect(message).toMatch(testCase.expectedPattern);
        expect(message).toContain('🤖 Generated with Claude via chopstack');
        expect(message).toContain('Co-Authored-By: Claude');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle git command failures gracefully', async () => {
      const task: ExecutionTask = {
        id: 'invalid-task',
        title: 'Invalid Task',
        description: 'Task that will fail',
        touches: [],
        produces: ['invalid-file.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Invalid prompt',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      // Try to create worktree with invalid base ref
      await expect(
        vcsEngine.createWorktreesForLayer([task], 'nonexistent-branch', testRepo),
      ).rejects.toThrow();
    });

    it('should handle commit failures when no changes exist', async () => {
      const task: ExecutionTask = {
        id: 'no-changes',
        title: 'No Changes Task',
        description: 'Task with no actual changes',
        touches: [],
        produces: [],
        requires: [],
        estimatedLines: 0,
        agentPrompt: 'Do nothing',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const context = {
        taskId: 'no-changes',
        branchName: 'test/no-changes',
        worktreePath: '.test-shadows/no-changes',
        baseRef: 'main',
        absolutePath: testRepo, // Use main repo for this test
      };

      await expect(
        vcsEngine.commitTaskChanges(task, context, { includeAll: true }),
      ).rejects.toThrow('No changes to commit');
    });
  });
});
