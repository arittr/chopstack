import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { GitWrapper } from '@/utils/git-wrapper';
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

const removeWorktreeSilently = async (
  manager: WorktreeManager,
  taskId: string,
): Promise<void> => {
  try {
    await manager.removeWorktree(taskId, true);
  } catch {
    // Ignore cleanup failures to keep tests focused on behavior
  }
};

describe('Worktree Commit Fetching', () => {

  describe('Fetching commits from worktrees', () => {
    it('should be able to fetch commits from worktree branches', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const taskId = 'test-task';
        const repoGit = new GitWrapper(testRepo);

        const context = await worktreeManager.createWorktree({
          taskId,
          branchName: `chopstack/${taskId}`,
          worktreePath: `.chopstack/shadows/${taskId}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        try {
          const testFile = path.join(context.absolutePath, 'test.txt');
          await fs.writeFile(testFile, 'Test content\n');
          console.log('exists single', await fs.readFile(testFile, 'utf8'));
          const worktreeGit = new GitWrapper(context.absolutePath);
          await worktreeGit.git.raw(['add', 'test.txt']);
          const status = await worktreeGit.git.raw(['status', '--short']);
          console.log('status single', status);
          const hash = (await worktreeGit.commit('Test commit')).trim();

          await repoGit.git.raw([
            'fetch',
            context.absolutePath,
            `${context.branchName}:refs/remotes/worktree-${taskId}/${context.branchName}`,
          ]);

          const catFile = await repoGit.git.raw(['cat-file', '-t', hash]);
          expect(catFile.trim()).toBe('commit');

          await repoGit.git.checkout(['-b', 'test-branch']);
          await repoGit.cherryPick(hash);

          const cherryPickedFile = path.join(testRepo, 'test.txt');
          const content = await fs.readFile(cherryPickedFile, 'utf8');
          expect(content).toBe('Test content\n');
        } finally {
          await removeWorktreeSilently(worktreeManager, taskId);
        }
      });
    });

    it('should handle multiple worktrees with different commits', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const tasks = ['task-a', 'task-b', 'task-c'];
        const commits: Record<string, string> = {};
        const repoGit = new GitWrapper(testRepo);

        try {
          for (const taskId of tasks) {
            const context = await worktreeManager.createWorktree({
              taskId,
              branchName: `chopstack/${taskId}`,
              worktreePath: `.chopstack/shadows/${taskId}`,
              baseRef: 'HEAD',
              workdir: testRepo,
            });
            const worktreeGit = new GitWrapper(context.absolutePath);

            const testFile = path.join(context.absolutePath, `${taskId}.txt`);
            await fs.writeFile(testFile, `Content for ${taskId}\n`);
            console.log('exists multi', taskId, await fs.readFile(testFile, 'utf8'));
            await worktreeGit.git.raw(['add', `${taskId}.txt`]);
            const status = await worktreeGit.git.raw(['status', '--short']);
            console.log('status multi', taskId, status);
            const commitHash = (await worktreeGit.commit(`Commit for ${taskId}`)).trim();
            commits[taskId] = commitHash;

            await repoGit.git.raw([
              'fetch',
              context.absolutePath,
              `${context.branchName}:refs/remotes/worktree-${taskId}/${context.branchName}`,
            ]);
          }

          for (const hash of Object.values(commits)) {
            const catFile = await repoGit.git.raw(['cat-file', '-t', hash]);
            expect(catFile.trim()).toBe('commit');
          }

          await repoGit.git.checkout(['-b', 'combined-branch']);
          for (const hash of Object.values(commits)) {
            await repoGit.cherryPick(hash);
          }

          for (const taskId of tasks) {
            const filePath = path.join(testRepo, `${taskId}.txt`);
            const content = await fs.readFile(filePath, 'utf8');
            expect(content).toBe(`Content for ${taskId}\n`);
          }
        } finally {
          for (const taskId of tasks) {
            await removeWorktreeSilently(worktreeManager, taskId);
          }
        }
      });
    });

    it('should parse worktree list correctly', async () => {
      await withTestWorktree(async ({ absolutePath: testRepo }) => {
        const worktreeManager = createWorktreeManager();
        const worktrees = [
          { taskId: 'task-1', branch: 'chopstack/task-1', path: '.chopstack/shadows/task-1' },
          { taskId: 'task-2', branch: 'chopstack/task-2', path: '.chopstack/shadows/task-2' },
        ];
        const repoGit = new GitWrapper(testRepo);

        try {
          for (const wt of worktrees) {
            await worktreeManager.createWorktree({
              taskId: wt.taskId,
              branchName: wt.branch,
              worktreePath: wt.path,
              baseRef: 'HEAD',
              workdir: testRepo,
            });
          }

          const parsed = await repoGit.listWorktrees();

          expect(parsed.length).toBeGreaterThanOrEqual(3);
          const taskWorktrees = parsed.filter((wt) => wt.branch?.includes('chopstack/') === true);
          expect(taskWorktrees).toHaveLength(2);
        } finally {
          for (const wt of worktrees) {
            await removeWorktreeSilently(worktreeManager, wt.taskId);
          }
        }
      });
    });
  });
});
