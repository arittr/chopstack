import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutionTask } from '@/types/execution';

import { GitWrapper } from '@/utils/git-wrapper';
import { GitSpiceBackend } from '@/vcs/git-spice';
import { WorktreeManager } from '@/vcs/worktree-manager';

import { withTestWorktree } from '../utils/testing-harness-worktree-manager';

const createWorktreeManager = (): WorktreeManager =>
  new WorktreeManager({
    shadowPath: '.chopstack/shadows',
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

const runInTestRepo = async (
  testFn: (context: {
    gitSpice: GitSpiceBackend;
    repoGit: GitWrapper;
    testRepo: string;
    worktreeManager: WorktreeManager;
  }) => Promise<void>,
): Promise<void> => {
  await withTestWorktree(async ({ absolutePath }) => {
    const worktreeManager = createWorktreeManager();
    const gitSpice = new GitSpiceBackend();
    const repoGit = new GitWrapper(absolutePath);

    await testFn({ testRepo: absolutePath, worktreeManager, gitSpice, repoGit });
  });
};

describe('Worktree Cherry-pick Integration', () => {
  describe('Commit Transfer from Worktrees', () => {
    it('should successfully cherry-pick commits from worktree branches', async () => {
      await runInTestRepo(async ({ testRepo, worktreeManager, gitSpice, repoGit }) => {
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

        const context = await worktreeManager.createWorktree({
          taskId: task.id,
          branchName: `chopstack/${task.id}`,
          worktreePath: `.chopstack/shadows/${task.id}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        try {
          const testFilePath = path.join(context.absolutePath, 'test-file.txt');
          await fs.writeFile(testFilePath, 'Test content for cherry-pick\n');
          const worktreeGit = new GitWrapper(context.absolutePath);
          await worktreeGit.git.raw(['add', 'test-file.txt']);
          task.commitHash = (await worktreeGit.commit('Test commit in worktree')).trim();

          const stackInfo = await gitSpice.createStack([task], testRepo, 'main');

          expect(stackInfo.branches).toHaveLength(1);
          expect(stackInfo.branches[0]?.taskId).toBe(task.id);

          const branchName = stackInfo.branches[0]?.name;
          if (branchName === undefined) {
            throw new Error('Expected git-spice to return branch name');
          }

          await repoGit.checkout(branchName);
          const files = await repoGit.git.raw(['ls-tree', '--name-only', 'HEAD']);
          expect(files).toContain('test-file.txt');

          const content = await fs.readFile(path.join(testRepo, 'test-file.txt'), 'utf8');
          expect(content).toBe('Test content for cherry-pick\n');
        } finally {
          await worktreeManager.removeWorktree(task.id, true).catch(() => {
            /* ignore cleanup failures */
          });
        }
      });
    });

    it('should handle multiple parallel worktree commits', async () => {
      await runInTestRepo(async ({ testRepo, worktreeManager, gitSpice, repoGit }) => {
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

        const createdTaskIds: string[] = [];

        try {
          for (const task of tasks) {
            const context = await worktreeManager.createWorktree({
              taskId: task.id,
              branchName: `chopstack/${task.id}`,
              worktreePath: `.chopstack/shadows/${task.id}`,
              baseRef: 'HEAD',
              workdir: testRepo,
            });
            createdTaskIds.push(task.id);

            const fileName = task.id === 'task-a' ? 'file-a.txt' : 'file-b.txt';
            const testFilePath = path.join(context.absolutePath, fileName);

            await fs.writeFile(testFilePath, `Content for ${task.id}\n`);
            const worktreeGit = new GitWrapper(context.absolutePath);
            await worktreeGit.git.raw(['add', fileName]);
            task.commitHash = (await worktreeGit.commit(`Commit for ${task.id}`)).trim();
          }

          const stackInfo = await gitSpice.createStack(tasks, testRepo, 'main');

          expect(stackInfo.branches).toHaveLength(2);

          for (const branch of stackInfo.branches) {
            await repoGit.checkout(branch.name);
            const files = await repoGit.git.raw(['ls-tree', '--name-only', 'HEAD']);

            const expectedFile = branch.taskId === 'task-a' ? 'file-a.txt' : 'file-b.txt';
            expect(files).toContain(expectedFile);
          }
        } finally {
          for (const taskId of createdTaskIds) {
            await worktreeManager.removeWorktree(taskId, true).catch(() => {
              /* ignore cleanup failures */
            });
          }
        }
      });
    });

    it('should handle dependent tasks with proper branch hierarchy', async () => {
      await runInTestRepo(async ({ testRepo, worktreeManager, gitSpice, repoGit }) => {
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

        const createdTaskIds: string[] = [];

        try {
          for (const task of [taskA, taskB]) {
            const context = await worktreeManager.createWorktree({
              taskId: task.id,
              branchName: `chopstack/${task.id}`,
              worktreePath: `.chopstack/shadows/${task.id}`,
              baseRef: 'HEAD',
              workdir: testRepo,
            });
            createdTaskIds.push(task.id);

            const fileName = task.id === 'task-a' ? 'base.txt' : 'dependent.txt';
            const testFilePath = path.join(context.absolutePath, fileName);

            await fs.writeFile(testFilePath, `Content for ${task.id}\n`);
            const worktreeGit = new GitWrapper(context.absolutePath);
            await worktreeGit.git.raw(['add', fileName]);
            task.commitHash = (await worktreeGit.commit(`Commit for ${task.id}`)).trim();
          }

          const stackInfo = await gitSpice.createStack([taskA, taskB], testRepo, 'main');

          expect(stackInfo.branches).toHaveLength(2);

          const branchA = stackInfo.branches.find((b) => b.taskId === 'task-a');
          const branchB = stackInfo.branches.find((b) => b.taskId === 'task-b');

          expect(branchA?.parent).toBe('main');
          expect(branchB?.parent).toBe(branchA?.name);

          if (branchB?.name === undefined) {
            throw new Error('Expected dependent branch name to be defined');
          }

          await repoGit.checkout(branchB.name);
          const files = await repoGit.git.raw(['ls-tree', '--name-only', 'HEAD']);
          expect(files).toContain('base.txt');
          expect(files).toContain('dependent.txt');
        } finally {
          for (const taskId of createdTaskIds) {
            await worktreeManager.removeWorktree(taskId, true).catch(() => {
              /* ignore cleanup failures */
            });
          }
        }
      });
    });
  });
});
