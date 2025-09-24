import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ExecutionTask } from '@/types/execution';

import { GitWrapper } from '@/utils/git-wrapper';
import { isNonNullish } from '@/utils/guards';
import { GitSpiceBackend, GitSpiceError } from '@/vcs/git-spice';
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

const commitFileInWorktree = async (
  worktreePath: string,
  fileName: string,
  fileContents: string,
  commitMessage: string,
): Promise<string> => {
  const absoluteFilePath = path.join(worktreePath, fileName);
  await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });
  await fs.writeFile(absoluteFilePath, fileContents);

  const git = new GitWrapper(worktreePath);
  await git.git.raw(['add', fileName]);
  await git.git.raw(['commit', '-m', commitMessage]);
  const commitHash = await git.git.raw(['rev-parse', 'HEAD']);
  return commitHash.trim();
};

const getCurrentBranch = async (git: GitWrapper): Promise<string> => {
  const branchName = await git.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
  return branchName.trim();
};

const resolveStackBaseBranch = async (git: GitWrapper): Promise<string> => {
  try {
    await git.git.raw(['rev-parse', '--verify', 'main']);
    return 'main';
  } catch {
    return getCurrentBranch(git);
  }
};

describe('Worktree Cherry-pick Integration', () => {
  describe('Commit Transfer from Worktrees', () => {
    it('should successfully cherry-pick commits from worktree branches', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const gitSpice = new GitSpiceBackend();
        const repoGit = new GitWrapper(testRepo);
        const originalBranch = await getCurrentBranch(repoGit);
        const baseBranch = await resolveStackBaseBranch(repoGit);

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

        const worktreeContext = await worktreeManager.createWorktree({
          taskId: task.id,
          branchName: `chopstack/${task.id}`,
          worktreePath: `.chopstack/shadows/${task.id}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        let branchName: string | undefined;

        try {
          task.commitHash = await commitFileInWorktree(
            worktreeContext.absolutePath,
            'test-file.txt',
            'Test content for cherry-pick\n',
            'Test commit in worktree',
          );

          const stackInfo = await gitSpice
            .createStack([task], testRepo, baseBranch)
            .catch((error: unknown) => {
              if (error instanceof GitSpiceError) {
                console.error('git-spice stderr:', error.stderr ?? '');
              }
              throw error;
            });

          expect(stackInfo.branches).toHaveLength(1);
          const [branch] = stackInfo.branches;
          branchName = branch?.name;

          expect(branch?.taskId).toBe(task.id);
          expect(isNonNullish(branchName)).toBe(true);

          if (isNonNullish(branchName)) {
            await repoGit.checkout(branchName);
            const fileContent = await fs.readFile(path.join(testRepo, 'test-file.txt'), 'utf8');
            expect(fileContent).toContain('Test content for cherry-pick');
          }
        } finally {
          await repoGit.checkout(originalBranch);

          // Clean up worktree and its branch (force removal for tests)
          await worktreeManager.removeWorktree(task.id, true).catch(() => {
            /* ignore cleanup errors */
          });

          // Clean up the worktree branch
          await repoGit.git.raw(['branch', '-D', `chopstack/${task.id}`]).catch(() => {
            /* ignore cleanup errors */
          });

          // Clean up the git-spice created branch
          if (isNonNullish(branchName)) {
            await repoGit.git.raw(['branch', '-D', branchName]).catch(() => {
              /* ignore cleanup errors */
            });
          }
        }
      });
    });

    it('should handle multiple worktrees and cherry-pick sequences correctly', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const gitSpice = new GitSpiceBackend();
        const repoGit = new GitWrapper(testRepo);
        const originalBranch = await getCurrentBranch(repoGit);
        const baseBranch = await resolveStackBaseBranch(repoGit);

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
            touches: ['file-a.txt'],
            produces: ['file-b.txt'],
            requires: ['task-a'],
            estimatedLines: 10,
            agentPrompt: 'Create file B',
            state: 'completed',
            stateHistory: [],
            retryCount: 0,
            maxRetries: 3,
          },
        ];

        const createdTaskIds: string[] = [];
        const cleanupBranches: string[] = [];

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
            task.commitHash = await commitFileInWorktree(
              context.absolutePath,
              fileName,
              `Content for ${task.id}\n`,
              `Commit for ${task.id}`,
            );
          }

          const stackInfo = await gitSpice
            .createStack(tasks, testRepo, baseBranch)
            .catch((error: unknown) => {
              if (error instanceof GitSpiceError) {
                console.error('git-spice stderr:', error.stderr ?? '');
              }
              throw error;
            });
          expect(stackInfo.branches).toHaveLength(2);

          for (const branch of stackInfo.branches) {
            if (isNonNullish(branch.name)) {
              cleanupBranches.push(branch.name);
              await repoGit.checkout(branch.name);

              const expectedFile = branch.taskId === 'task-a' ? 'file-a.txt' : 'file-b.txt';
              const fileContent = await fs.readFile(path.join(testRepo, expectedFile), 'utf8');
              expect(fileContent).toContain(`Content for ${branch.taskId}`);
            }
          }
        } finally {
          await repoGit.checkout(originalBranch);

          for (const taskId of createdTaskIds) {
            // Clean up worktree and its branch (force removal for tests)
            await worktreeManager.removeWorktree(taskId, true).catch(() => {
              /* ignore cleanup errors */
            });

            // Clean up the worktree branch
            await repoGit.git.raw(['branch', '-D', `chopstack/${taskId}`]).catch(() => {
              /* ignore cleanup errors */
            });
          }

          // Clean up git-spice created branches
          for (const branchName of cleanupBranches) {
            await repoGit.git.raw(['branch', '-D', branchName]).catch(() => {
              /* ignore cleanup errors */
            });
          }
        }
      });
    });

    it('should handle dependent tasks with proper branch hierarchy', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const gitSpice = new GitSpiceBackend();
        const repoGit = new GitWrapper(testRepo);
        const originalBranch = await getCurrentBranch(repoGit);
        const baseBranch = await resolveStackBaseBranch(repoGit);

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

        const tasks = [taskA, taskB];
        const cleanupBranches: string[] = [];

        try {
          for (const task of tasks) {
            const context = await worktreeManager.createWorktree({
              taskId: task.id,
              branchName: `chopstack/${task.id}`,
              worktreePath: `.chopstack/shadows/${task.id}`,
              baseRef: 'HEAD',
              workdir: testRepo,
            });

            const fileName = task.id === 'task-a' ? 'base.txt' : 'dependent.txt';
            task.commitHash = await commitFileInWorktree(
              context.absolutePath,
              fileName,
              `Content for ${task.id}\n`,
              `Commit for ${task.id}`,
            );
          }

          const stackInfo = await gitSpice
            .createStack(tasks, testRepo, baseBranch)
            .catch((error: unknown) => {
              if (error instanceof GitSpiceError) {
                console.error('git-spice stderr:', error.stderr ?? '');
              }
              throw error;
            });
          expect(stackInfo.branches).toHaveLength(2);

          const branchA = stackInfo.branches.find((branch) => branch.taskId === 'task-a');
          const branchB = stackInfo.branches.find((branch) => branch.taskId === 'task-b');

          expect(branchA?.parent).toBe(baseBranch);
          expect(isNonNullish(branchA?.name)).toBe(true);
          expect(branchB?.parent).toBe(branchA?.name);
          expect(isNonNullish(branchB?.name)).toBe(true);

          if (isNonNullish(branchA?.name)) {
            cleanupBranches.push(branchA.name);
          }

          if (isNonNullish(branchB?.name)) {
            cleanupBranches.push(branchB.name);
            await repoGit.checkout(branchB.name);

            const baseContent = await fs.readFile(path.join(testRepo, 'base.txt'), 'utf8');
            const dependentContent = await fs.readFile(
              path.join(testRepo, 'dependent.txt'),
              'utf8',
            );
            expect(baseContent).toContain('Content for task-a');
            expect(dependentContent).toContain('Content for task-b');
          }
        } finally {
          await repoGit.checkout(originalBranch);

          for (const task of tasks) {
            // Clean up worktree and its branch (force removal for tests)
            await worktreeManager.removeWorktree(task.id, true).catch(() => {
              /* ignore cleanup errors */
            });

            // Clean up the worktree branch
            await repoGit.git.raw(['branch', '-D', `chopstack/${task.id}`]).catch(() => {
              /* ignore cleanup errors */
            });
          }

          // Clean up git-spice created branches
          for (const branchName of cleanupBranches) {
            await repoGit.git.raw(['branch', '-D', branchName]).catch(() => {
              /* ignore cleanup errors */
            });
          }
        }
      });
    });
  });
});
