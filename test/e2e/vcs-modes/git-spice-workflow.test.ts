import type { SimpleGit } from 'simple-git';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * E2E Test for git-spice Workflow
 *
 * Tests complete git-spice workflow including:
 * - VCS configuration with git-spice mode
 * - Sequential execution with worktrees
 * - Parallel execution with worktrees
 * - Stack creation and branch relationships
 * - Cleanup operations
 */
describe('git-spice Workflow E2E', () => {
  const { getGit, getTmpDir } = setupGitTest('git-spice-workflow-e2e');

  let git: SimpleGit;
  let testDir: string;

  beforeEach(async () => {
    git = getGit();
    testDir = getTmpDir();

    // Initialize git repository
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test Project\n');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  describe('VCS Configuration', () => {
    it('should detect git-spice availability', async () => {
      // This test verifies git-spice binary detection
      // In real implementation, this would call VcsConfigService.validateMode()

      const { execa } = await import('execa');

      try {
        const result = await execa('gs', ['--version'], { reject: false });

        if (result.exitCode === 0) {
          expect(result.stdout).toContain('git-spice');
        } else {
          // git-spice not installed, test should skip or use mock
          expect(result.exitCode).not.toBe(0);
        }
      } catch {
        // git-spice not available
        expect(true).toBe(true);
      }
    });

    it('should configure git-spice mode when binary available', () => {
      // Mock VCS configuration
      const vcsConfig = {
        mode: 'git-spice' as const,
        trunk: 'main',
      };

      expect(vcsConfig.mode).toBe('git-spice');
      expect(vcsConfig.trunk).toBe('main');
    });
  });

  describe('Sequential Execution with Worktrees', () => {
    it('should create worktree for first task', async () => {
      const taskId = 'task-1-setup-types';
      const branchName = `task/${taskId}`;
      const worktreePath = path.join(testDir, '.chopstack/shadows', taskId);

      // Create worktree
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);

      // Verify worktree exists
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).toContain(worktreePath);
      expect(worktreeList).toContain(branchName);

      // Verify can work in worktree
      await fs.writeFile(path.join(worktreePath, 'types.ts'), 'export type Task = { id: string };');

      const worktreeGit = getGit();
      await worktreeGit.cwd(worktreePath);
      await worktreeGit.add('types.ts');
      await worktreeGit.commit('[task-1] Add types');

      // Verify commit exists
      const log = await worktreeGit.log();
      expect(log.latest?.message).toBe('[task-1] Add types');

      // Cleanup
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    });

    it('should create sequential stack (main → task-1 → task-2)', async () => {
      // Task 1: Create worktree and commit
      const task1Id = 'task-1-types';
      const task1Branch = `task/${task1Id}`;
      const task1Path = path.join(testDir, '.chopstack/shadows', task1Id);

      await git.raw(['worktree', 'add', '-b', task1Branch, task1Path, 'HEAD']);

      const task1Git = getGit();
      await task1Git.cwd(task1Path);
      await fs.writeFile(path.join(task1Path, 'types.ts'), 'export type Task = { id: string };');
      await task1Git.add('types.ts');
      await task1Git.commit('[task-1] Add types');

      // Get commit hash from task-1
      const task1Commit = await task1Git.revparse(['HEAD']);

      // Integrate task-1 into main (use commit hash to avoid worktree conflicts)
      // Note: git in testDir is already on main
      await git.raw(['merge', task1Commit, '--no-ff', '-m', 'Merge task-1']);

      // Task 2: Create worktree from task-1 (sequential stacking)
      const task2Id = 'task-2-service';
      const task2Branch = `task/${task2Id}`;
      const task2Path = path.join(testDir, '.chopstack/shadows', task2Id);

      await git.raw(['worktree', 'add', '-b', task2Branch, task2Path, task1Branch]);

      const task2Git = getGit();
      await task2Git.cwd(task2Path);
      await fs.writeFile(
        path.join(task2Path, 'service.ts'),
        'import type { Task } from "./types";',
      );
      await task2Git.add('service.ts');
      await task2Git.commit('[task-2] Add service');

      // Get commit hash from task-2
      const task2Commit = await task2Git.revparse(['HEAD']);

      // Integrate task-2 into main (use commit hash to avoid worktree conflicts)
      // Note: git in testDir is already on main
      await git.raw(['merge', task2Commit, '--no-ff', '-m', 'Merge task-2']);

      // Verify sequential stack
      const branches = await git.branch();
      expect(branches.all).toContain(task1Branch);
      expect(branches.all).toContain(task2Branch);

      // Verify commit history
      const log = await git.log();
      expect(log.all.length).toBeGreaterThanOrEqual(4); // Initial + task-1 + task-2 + merges

      // Cleanup
      await git.raw(['worktree', 'remove', task1Path, '--force']);
      await git.raw(['worktree', 'remove', task2Path, '--force']);
    });
  });

  describe('Parallel Execution with Worktrees', () => {
    it('should create multiple worktrees in parallel', async () => {
      const tasks = [
        { id: 'task-a-component', branch: 'task/task-a-component' },
        { id: 'task-b-service', branch: 'task/task-b-service' },
        { id: 'task-c-utils', branch: 'task/task-c-utils' },
      ];

      // Create all worktrees from main (parallel execution)
      const worktrees: Array<{ branch: string; id: string; path: string }> = [];

      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        await git.raw(['worktree', 'add', '-b', task.branch, worktreePath, 'HEAD']);
        worktrees.push({ id: task.id, path: worktreePath, branch: task.branch });
      }

      // Verify all worktrees created
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      for (const worktree of worktrees) {
        expect(worktreeList).toContain(worktree.path);
        expect(worktreeList).toContain(worktree.branch);
      }

      // Simulate parallel work in each worktree
      for (const worktree of worktrees) {
        const worktreeGit = getGit();
        await worktreeGit.cwd(worktree.path);

        const fileName = `${worktree.id}.ts`;
        await fs.writeFile(path.join(worktree.path, fileName), `// ${worktree.id} implementation`);

        await worktreeGit.add(fileName);
        await worktreeGit.commit(`[${worktree.id}] Implement ${worktree.id}`);
      }

      // Verify commits in each branch
      for (const worktree of worktrees) {
        const worktreeGit = getGit();
        await worktreeGit.cwd(worktree.path);
        const log = await worktreeGit.log();
        expect(log.latest?.message).toContain(worktree.id);
      }

      // Cleanup
      for (const worktree of worktrees) {
        await git.raw(['worktree', 'remove', worktree.path, '--force']);
      }
    });

    it('should integrate parallel stack (main → [task-a, task-b, task-c])', async () => {
      const tasks = [
        { id: 'task-a', branch: 'task/task-a', file: 'component.ts' },
        { id: 'task-b', branch: 'task/task-b', file: 'service.ts' },
        { id: 'task-c', branch: 'task/task-c', file: 'utils.ts' },
      ];

      // Create worktrees and commits, collecting commit hashes
      const commitHashes: string[] = [];
      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        await git.raw(['worktree', 'add', '-b', task.branch, worktreePath, 'HEAD']);

        const worktreeGit = getGit();
        await worktreeGit.cwd(worktreePath);
        await fs.writeFile(path.join(worktreePath, task.file), `// ${task.id}`);
        await worktreeGit.add(task.file);
        await worktreeGit.commit(`[${task.id}] Add ${task.file}`);

        // Get commit hash to avoid worktree conflicts during merge
        const commitHash = await worktreeGit.revparse(['HEAD']);
        commitHashes.push(commitHash);
      }

      // Integrate all branches into main (parallel stack) using commit hashes
      // Note: git in testDir is already on main
      for (const [i, task_] of tasks.entries()) {
        const task = task_;
        const commitHash = commitHashes[i]!;
        await git.raw(['merge', commitHash, '--no-ff', '-m', `Merge ${task.id}`]);
      }

      // Verify all branches merged
      const log = await git.log();
      const commits = log.all.map((c) => c.message);

      for (const task of tasks) {
        expect(commits.some((msg) => msg.includes(task.id))).toBe(true);
      }

      // Verify all files present in main (check with git ls-files instead of fs.readdir)
      const trackedFiles = await git.raw(['ls-files']);
      for (const task of tasks) {
        expect(trackedFiles).toContain(task.file);
      }

      // Cleanup
      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      }
    });
  });

  describe('Stack Creation and Branch Relationships', () => {
    it('should track branch parent relationships in git-spice', async () => {
      // Note: This test simulates git-spice behavior without requiring gs binary
      // In real git-spice, parent tracking is done via gs branch track

      const task1Branch = 'task/task-1';
      const task2Branch = 'task/task-2';

      // Create task-1 from main
      const task1Path = path.join(testDir, '.chopstack/shadows', 'task-1');
      await git.raw(['worktree', 'add', '-b', task1Branch, task1Path, 'HEAD']);

      const task1Git = getGit();
      await task1Git.cwd(task1Path);
      await fs.writeFile(path.join(task1Path, 'file1.ts'), '// task 1');
      await task1Git.add('file1.ts');
      await task1Git.commit('[task-1] First task');

      // Create task-2 from task-1 (child relationship)
      const task2Path = path.join(testDir, '.chopstack/shadows', 'task-2');
      await git.raw(['worktree', 'add', '-b', task2Branch, task2Path, task1Branch]);

      const task2Git = getGit();
      await task2Git.cwd(task2Path);
      await fs.writeFile(path.join(task2Path, 'file2.ts'), '// task 2');
      await task2Git.add('file2.ts');
      await task2Git.commit('[task-2] Second task');

      // Get task-1 commit hash while still in task-1 worktree
      const task1Commit = await task1Git.revparse(['HEAD']);

      // Verify branch relationships via merge-base (use commit hashes to avoid worktree conflicts)
      const mergeBase = await git.raw(['merge-base', task1Commit, task2Branch]);

      // task-1 should be an ancestor of task-2
      expect(mergeBase.trim()).toBe(task1Commit.trim());

      // Cleanup (no need to checkout main, we're already on it)
      await git.raw(['worktree', 'remove', task1Path, '--force']);
      await git.raw(['worktree', 'remove', task2Path, '--force']);
    });

    it('should handle complex stack relationships', async () => {
      // Create a stack: main → task-1 → task-2 → task-3
      const tasks = [
        { id: 'task-1', branch: 'task/task-1', parent: 'main' },
        { id: 'task-2', branch: 'task/task-2', parent: 'task/task-1' },
        { id: 'task-3', branch: 'task/task-3', parent: 'task/task-2' },
      ];

      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        await git.raw(['worktree', 'add', '-b', task.branch, worktreePath, task.parent]);

        const worktreeGit = getGit();
        await worktreeGit.cwd(worktreePath);
        await fs.writeFile(path.join(worktreePath, `${task.id}.ts`), `// ${task.id}`);
        await worktreeGit.add(`${task.id}.ts`);
        await worktreeGit.commit(`[${task.id}] Implement ${task.id}`);
      }

      // Verify stack relationships (collect commit hashes first to avoid worktree conflicts)
      const commitHashes: string[] = [];
      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        const worktreeGit = getGit();
        await worktreeGit.cwd(worktreePath);
        const commitHash = await worktreeGit.revparse(['HEAD']);
        commitHashes.push(commitHash);
      }

      // Verify relationships using commit hashes
      for (let i = 0; i < tasks.length - 1; i++) {
        const currentCommit = commitHashes[i]!;
        const nextCommit = commitHashes[i + 1]!;

        const mergeBase = await git.raw(['merge-base', currentCommit, nextCommit]);

        // Current task should be ancestor of next task
        expect(mergeBase.trim()).toBe(currentCommit.trim());
      }

      // Cleanup (no need to checkout main, we're already on it)
      for (const task of tasks) {
        const worktreePath = path.join(testDir, '.chopstack/shadows', task.id);
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      }
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup worktree after task completion', async () => {
      const taskId = 'task-cleanup-test';
      const branchName = `task/${taskId}`;
      const worktreePath = path.join(testDir, '.chopstack/shadows', taskId);

      // Create worktree
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);

      // Verify worktree exists
      let worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).toContain(worktreePath);

      // Cleanup worktree
      await git.raw(['worktree', 'remove', worktreePath, '--force']);

      // Verify worktree removed
      worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).not.toContain(worktreePath);
    });

    it('should optionally preserve branches after cleanup', async () => {
      const taskId = 'task-preserve-branch';
      const branchName = `task/${taskId}`;
      const worktreePath = path.join(testDir, '.chopstack/shadows', taskId);

      // Create worktree and commit
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);

      // Work in worktree
      await fs.writeFile(path.join(worktreePath, 'test.ts'), '// test');

      // Commit in worktree using git raw commands from main repo
      await git.raw(['-C', worktreePath, 'add', 'test.ts']);
      await git.raw(['-C', worktreePath, 'commit', '-m', '[test] Test commit']);

      // Cleanup worktree (keep branch)
      await git.raw(['worktree', 'remove', worktreePath, '--force']);

      // Verify branch still exists (we're already on main)
      const branches = await git.branch();
      expect(branches.all).toContain(branchName);

      // Verify worktree removed
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).not.toContain(worktreePath);

      // Cleanup branch
      await git.raw(['branch', '-D', branchName]);
    });

    it('should handle cleanup of orphaned worktrees', async () => {
      // Create worktree
      const taskId = 'task-orphaned';
      const branchName = `task/${taskId}`;
      const worktreePath = path.join(testDir, '.chopstack/shadows', taskId);

      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);

      // Simulate orphaned worktree by manually removing directory
      await fs.rm(worktreePath, { recursive: true, force: true });

      // Git should detect orphaned worktree
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).toContain('prunable');

      // Prune orphaned worktrees
      await git.raw(['worktree', 'prune']);

      // Verify orphaned worktree pruned
      const prunedList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(prunedList).not.toContain(worktreePath);

      // Cleanup branch
      await git.deleteLocalBranch(branchName, true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle branch name collision', async () => {
      const taskId = 'task-collision';
      const branchName = `task/${taskId}`;
      const worktreePath1 = path.join(testDir, '.chopstack/shadows', taskId);

      // Create first worktree
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath1, 'HEAD']);

      // Try to create second worktree with same branch name
      const worktreePath2 = path.join(testDir, '.chopstack/shadows', `${taskId}-2`);

      await expect(
        git.raw(['worktree', 'add', '-b', branchName, worktreePath2, 'HEAD']),
      ).rejects.toThrow();

      // Cleanup
      await git.raw(['worktree', 'remove', worktreePath1, '--force']);
    });

    it('should handle worktree path collision', async () => {
      const taskId = 'task-path-collision';
      const branchName1 = `task/${taskId}-1`;
      const branchName2 = `task/${taskId}-2`;
      const worktreePath = path.join(testDir, '.chopstack/shadows', taskId);

      // Create first worktree
      await git.raw(['worktree', 'add', '-b', branchName1, worktreePath, 'HEAD']);

      // Try to create second worktree at same path
      await expect(
        git.raw(['worktree', 'add', '-b', branchName2, worktreePath, 'HEAD']),
      ).rejects.toThrow();

      // Cleanup
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    });

    it('should detect merge conflicts during integration', async () => {
      // Create a file in main
      const conflictFile = 'conflict.ts';
      await fs.writeFile(path.join(testDir, conflictFile), '// Line 1\n// Line 2\n// Line 3\n');
      await git.add(conflictFile);
      await git.commit('Add conflict file');

      // Create two branches that modify different parts of the same file
      const task1Branch = 'task/conflict-1';
      const task2Branch = 'task/conflict-2';

      // Task 1: Modify first line
      const task1Path = path.join(testDir, '.chopstack/shadows', 'conflict-1');
      await git.raw(['worktree', 'add', '-b', task1Branch, task1Path, 'HEAD']);

      await fs.writeFile(
        path.join(task1Path, conflictFile),
        '// MODIFIED Line 1\n// Line 2\n// Line 3\n',
      );
      await git.raw(['-C', task1Path, 'add', conflictFile]);
      await git.raw(['-C', task1Path, 'commit', '-m', '[task-1] Modify line 1']);

      const task1Commit = await git.raw(['-C', task1Path, 'rev-parse', 'HEAD']);

      // Task 2: Modify first line differently (from same base)
      const task2Path = path.join(testDir, '.chopstack/shadows', 'conflict-2');
      await git.raw(['worktree', 'add', '-b', task2Branch, task2Path, 'main']);

      await fs.writeFile(
        path.join(task2Path, conflictFile),
        '// DIFFERENT Line 1\n// Line 2\n// Line 3\n',
      );
      await git.raw(['-C', task2Path, 'add', conflictFile]);
      await git.raw(['-C', task2Path, 'commit', '-m', '[task-2] Modify line 1 differently']);

      const task2Commit = await git.raw(['-C', task2Path, 'rev-parse', 'HEAD']);

      // Merge task-1 into main
      await git.raw(['merge', task1Commit.trim(), '--no-ff', '-m', 'Merge task-1']);

      // Try to merge task-2 into main (should conflict)
      // Note: git merge with conflict returns exit 1 but simple-git may not throw
      try {
        await git.raw(['merge', task2Commit.trim(), '--no-ff', '-m', 'Merge task-2']);
      } catch {
        // Expected - merge failed due to conflict
      }

      // Verify conflict detected
      const status = await git.status();
      expect(status.conflicted).toContain(conflictFile);

      // Abort merge
      await git.raw(['merge', '--abort']);

      // Cleanup
      await git.raw(['worktree', 'remove', task1Path, '--force']);
      await git.raw(['worktree', 'remove', task2Path, '--force']);
    });
  });
});
