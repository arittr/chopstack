import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { ExecutionTask } from '@/types/execution';

import { GitSpiceBackend } from '@/vcs/git-spice';
import { WorktreeManager } from '@/vcs/worktree-manager';

const execAsync = promisify(exec);

describe('Worktree Cherry-pick Integration', () => {
  let testRepo: string;
  let worktreeManager: WorktreeManager;
  let gitSpice: GitSpiceBackend;

  beforeEach(async () => {
    // Create temporary test repository
    testRepo = path.join(__dirname, '../tmp', `test-repo-${Date.now()}`);
    await fs.mkdir(testRepo, { recursive: true });

    // Initialize git repo
    await execAsync('git init', { cwd: testRepo });
    await execAsync('git config user.name "Test User"', { cwd: testRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepo });

    // Create initial commit
    await fs.writeFile(path.join(testRepo, 'README.md'), '# Test Repo\n');
    await execAsync('git add README.md', { cwd: testRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepo });

    // Setup test instances
    worktreeManager = new WorktreeManager({
      shadowPath: '.chopstack-shadows',
      branchPrefix: 'chopstack/',
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });

    gitSpice = new GitSpiceBackend();
  });

  afterEach(async () => {
    // Clean up any worktrees
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: testRepo });
      const worktrees = stdout
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== testRepo);

      for (const worktreePath of worktrees) {
        await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: testRepo }).catch(
          () => {
            /* ignore */
          },
        );
      }
    } catch {
      // Ignore errors
    }

    // Cleanup test repo
    try {
      await fs.rm(testRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Commit Transfer from Worktrees', () => {
    it('should successfully cherry-pick commits from worktree branches', async () => {
      // Create a task
      const task: ExecutionTask = {
        id: 'test-task-1',
        title: 'Test Task',
        description: 'A test task',
        touches: [],
        produces: ['test-file.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create a test file',
        state: 'completed',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      // Create worktree for the task
      const context = await worktreeManager.createWorktree({
        taskId: task.id,
        branchName: `chopstack/${task.id}`,
        worktreePath: `.chopstack-shadows/${task.id}`,
        baseRef: 'HEAD',
        workdir: testRepo,
      });

      // Create a file in the worktree and commit it
      const testFilePath = path.join(context.absolutePath, 'test-file.txt');
      await fs.writeFile(testFilePath, 'Test content for cherry-pick\n');
      await execAsync('git add test-file.txt', { cwd: context.absolutePath });
      await execAsync('git commit -m "Test commit in worktree"', { cwd: context.absolutePath });

      // Get the commit hash
      const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
        cwd: context.absolutePath,
      });
      task.commitHash = commitHash.trim();

      // Now test the git-spice createStack with the new fetch workflow
      const stackInfo = await gitSpice.createStack([task], testRepo, 'main');

      // Verify the stack was created
      expect(stackInfo.branches).toHaveLength(1);
      expect(stackInfo.branches[0]?.taskId).toBe(task.id);

      // Verify the commit was cherry-picked to the new branch
      await execAsync(`git checkout ${stackInfo.branches[0]?.name}`, { cwd: testRepo });
      const { stdout: files } = await execAsync('git ls-tree --name-only HEAD', {
        cwd: testRepo,
      });
      expect(files).toContain('test-file.txt');

      // Verify the file content
      const content = await fs.readFile(path.join(testRepo, 'test-file.txt'), 'utf8');
      expect(content).toBe('Test content for cherry-pick\n');
    });

    it('should handle multiple parallel worktree commits', async () => {
      // Create multiple tasks
      const tasks: ExecutionTask[] = [
        {
          id: 'task-a',
          title: 'Task A',
          description: 'First task',
          touches: [],
          produces: ['file-a.txt'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file A',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'task-b',
          title: 'Task B',
          description: 'Second task',
          touches: [],
          produces: ['file-b.txt'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file B',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      // Create worktrees and commits for each task
      for (const task of tasks) {
        const context = await worktreeManager.createWorktree({
          taskId: task.id,
          branchName: `chopstack/${task.id}`,
          worktreePath: `.chopstack-shadows/${task.id}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        const fileName = task.id === 'task-a' ? 'file-a.txt' : 'file-b.txt';
        const testFilePath = path.join(context.absolutePath, fileName);

        await fs.writeFile(testFilePath, `Content for ${task.id}\n`);

        await execAsync(`git add ${fileName}`, { cwd: context.absolutePath });

        await execAsync(`git commit -m "Commit for ${task.id}"`, { cwd: context.absolutePath });

        const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
          cwd: context.absolutePath,
        });
        task.commitHash = commitHash.trim();
      }

      // Create stack from both tasks
      const stackInfo = await gitSpice.createStack(tasks, testRepo, 'main');

      // Verify both branches were created
      expect(stackInfo.branches).toHaveLength(2);

      // Verify each task's commit was cherry-picked correctly
      for (const branch of stackInfo.branches) {
        await execAsync(`git checkout ${branch.name}`, { cwd: testRepo });

        const { stdout: files } = await execAsync('git ls-tree --name-only HEAD', {
          cwd: testRepo,
        });

        const expectedFile = branch.taskId === 'task-a' ? 'file-a.txt' : 'file-b.txt';
        expect(files).toContain(expectedFile);
      }
    });

    it('should handle dependent tasks with proper branch hierarchy', async () => {
      // Create tasks with dependencies
      const taskA: ExecutionTask = {
        id: 'task-a',
        title: 'Base Task',
        description: 'Base task',
        touches: [],
        produces: ['base.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create base file',
        state: 'completed',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const taskB: ExecutionTask = {
        id: 'task-b',
        title: 'Dependent Task',
        description: 'Depends on task A',
        touches: ['base.txt'],
        produces: ['dependent.txt'],
        requires: ['task-a'],
        estimatedLines: 10,
        agentPrompt: 'Create dependent file',
        state: 'completed',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      // Create worktrees and commits
      for (const task of [taskA, taskB]) {
        const context = await worktreeManager.createWorktree({
          taskId: task.id,
          branchName: `chopstack/${task.id}`,
          worktreePath: `.chopstack-shadows/${task.id}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        const fileName = task.id === 'task-a' ? 'base.txt' : 'dependent.txt';
        const testFilePath = path.join(context.absolutePath, fileName);

        await fs.writeFile(testFilePath, `Content for ${task.id}\n`);

        await execAsync(`git add ${fileName}`, { cwd: context.absolutePath });

        await execAsync(`git commit -m "Commit for ${task.id}"`, { cwd: context.absolutePath });

        const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
          cwd: context.absolutePath,
        });
        task.commitHash = commitHash.trim();
      }

      // Create stack with dependency order
      const stackInfo = await gitSpice.createStack([taskA, taskB], testRepo, 'main');

      // Verify branches were created with proper hierarchy
      expect(stackInfo.branches).toHaveLength(2);

      const branchA = stackInfo.branches.find((b) => b.taskId === 'task-a');
      const branchB = stackInfo.branches.find((b) => b.taskId === 'task-b');

      expect(branchA?.parent).toBe('main');
      expect(branchB?.parent).toBe(branchA?.name);

      // Verify task B's branch contains both files
      await execAsync(`git checkout ${branchB?.name}`, { cwd: testRepo });
      const { stdout: files } = await execAsync('git ls-tree --name-only HEAD', {
        cwd: testRepo,
      });
      expect(files).toContain('base.txt');
      expect(files).toContain('dependent.txt');
    });
  });
});
