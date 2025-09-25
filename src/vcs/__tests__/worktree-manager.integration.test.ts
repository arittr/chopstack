import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TEST_PATHS } from '@test/constants/test-paths';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { WorktreeManager } from '@/vcs/worktree-manager';

const testRepo = join(TEST_PATHS.TEST_TMP, 'worktree-manager-integration');

describe('WorktreeManager Integration', () => {
  let manager: WorktreeManager;
  let git: GitWrapper;

  beforeAll(async () => {
    // Create a real git repository for testing
    await rm(testRepo, { recursive: true, force: true });
    await mkdir(testRepo, { recursive: true });

    // Initialize git repo using GitWrapper's new methods
    git = new GitWrapper(testRepo);
    await git.init();
    await git.config('user.name', 'Test User');
    await git.config('user.email', 'test@example.com');

    // Create initial commit
    await writeFile(join(testRepo, 'README.md'), '# Test Repository');
    await git.add('.');
    await git.commit('Initial commit');
  });

  beforeEach(() => {
    manager = new WorktreeManager({
      shadowPath: '.test-shadows',
      branchPrefix: 'test/',
      cleanupOnSuccess: true,
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
    // Clean up any worktrees
    await manager.cleanupAllWorktrees();
  });

  afterAll(async () => {
    await rm(testRepo, { recursive: true, force: true });
  });

  describe('concurrent worktree operations', () => {
    it('should handle concurrent worktree creation', async () => {
      // Create multiple worktrees concurrently
      const promises = [
        manager.createWorktree({
          taskId: 'task-1',
          branchName: 'test/task-1',
          worktreePath: '.test-shadows/task-1',
          baseRef: 'main',
          workdir: testRepo,
        }),
        manager.createWorktree({
          taskId: 'task-2',
          branchName: 'test/task-2',
          worktreePath: '.test-shadows/task-2',
          baseRef: 'main',
          workdir: testRepo,
        }),
        manager.createWorktree({
          taskId: 'task-3',
          branchName: 'test/task-3',
          worktreePath: '.test-shadows/task-3',
          baseRef: 'main',
          workdir: testRepo,
        }),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(3);
      expect(results[0]?.taskId).toBe('task-1');
      expect(results[1]?.taskId).toBe('task-2');
      expect(results[2]?.taskId).toBe('task-3');

      // All should be tracked
      expect(manager.hasWorktree('task-1')).toBe(true);
      expect(manager.hasWorktree('task-2')).toBe(true);
      expect(manager.hasWorktree('task-3')).toBe(true);

      // Verify actual worktrees exist
      const worktrees = await git.listWorktrees();
      expect(worktrees.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle concurrent removal', async () => {
      // Create worktrees first
      await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: testRepo,
      });
      await manager.createWorktree({
        taskId: 'task-2',
        branchName: 'test/task-2',
        worktreePath: '.test-shadows/task-2',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Remove concurrently
      const [result1, result2] = await Promise.all([
        manager.removeWorktree('task-1'),
        manager.removeWorktree('task-2'),
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(manager.hasWorktree('task-1')).toBe(false);
      expect(manager.hasWorktree('task-2')).toBe(false);
    });
  });

  describe('worktree lifecycle', () => {
    it('should create worktree with correct structure', async () => {
      const context = await manager.createWorktree({
        taskId: 'lifecycle-test',
        branchName: 'test/lifecycle',
        worktreePath: '.test-shadows/lifecycle',
        baseRef: 'main',
        workdir: testRepo,
      });

      expect(context).toBeDefined();
      expect(context.taskId).toBe('lifecycle-test');
      expect(context.branchName).toBe('test/lifecycle');
      expect(context.absolutePath).toBe(join(testRepo, '.test-shadows/lifecycle'));

      // Verify worktree exists and is on correct branch
      const branches = await git.branch();
      expect(branches.includes('test/lifecycle')).toBe(true);
    });

    it('should handle cleanup on success', async () => {
      await manager.createWorktree({
        taskId: 'cleanup-test',
        branchName: 'test/cleanup',
        worktreePath: '.test-shadows/cleanup',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Simulate task success
      const removed = await manager.removeWorktree('cleanup-test');
      expect(removed).toBe(true);

      // Verify worktree is gone
      expect(manager.hasWorktree('cleanup-test')).toBe(false);

      // Branch typically remains after worktree removal (can be reused)
      // This is expected behavior - worktrees are removed but branches persist
      const branches = await git.branch();
      expect(branches.includes('test/cleanup')).toBe(true);
    });

    it('should preserve worktree on failure if configured', async () => {
      const preserveManager = new WorktreeManager({
        shadowPath: '.test-shadows',
        branchPrefix: 'test/',
        cleanupOnSuccess: true,
        cleanupOnFailure: false,
        conflictStrategy: 'auto',
        stackSubmission: {
          enabled: false,
          draft: true,
          autoMerge: false,
        },
      });

      await preserveManager.createWorktree({
        taskId: 'preserve-test',
        branchName: 'test/preserve',
        worktreePath: '.test-shadows/preserve',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Verify worktree exists
      expect(preserveManager.hasWorktree('preserve-test')).toBe(true);

      // Clean up manually
      await preserveManager.removeWorktree('preserve-test');
    });
  });

  describe('error handling', () => {
    it('should handle branch name conflicts gracefully', async () => {
      // Create first worktree
      await manager.createWorktree({
        taskId: 'conflict-1',
        branchName: 'test/conflict',
        worktreePath: '.test-shadows/conflict-1',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Try to create another with same branch name
      const context2 = await manager.createWorktree({
        taskId: 'conflict-2',
        branchName: 'test/conflict',
        worktreePath: '.test-shadows/conflict-2',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Should generate unique branch name
      expect(context2.branchName).not.toBe('test/conflict');
      expect(context2.branchName).toMatch(/^test\/conflict-\d+$/);
    });

    it('should recover from partial failures', async () => {
      // Create a worktree
      const context = await manager.createWorktree({
        taskId: 'recovery-test',
        branchName: 'test/recovery',
        worktreePath: '.test-shadows/recovery',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Force remove the directory but leave git metadata
      await rm(context.absolutePath, { recursive: true, force: true });

      // Removal should still work
      const removed = await manager.removeWorktree('recovery-test');
      expect(removed).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('should clean up all worktrees', async () => {
      // Create multiple worktrees
      await manager.createWorktree({
        taskId: 'batch-1',
        branchName: 'test/batch-1',
        worktreePath: '.test-shadows/batch-1',
        baseRef: 'main',
        workdir: testRepo,
      });
      await manager.createWorktree({
        taskId: 'batch-2',
        branchName: 'test/batch-2',
        worktreePath: '.test-shadows/batch-2',
        baseRef: 'main',
        workdir: testRepo,
      });

      // Clean all
      await manager.cleanupAllWorktrees();

      expect(manager.hasWorktree('batch-1')).toBe(false);
      expect(manager.hasWorktree('batch-2')).toBe(false);

      const worktrees = await git.listWorktrees();
      // Should only have main worktree
      expect(worktrees.filter((w) => w.branch?.startsWith('test/') === true)).toHaveLength(0);
    });

    it('should list all active worktrees', async () => {
      await manager.createWorktree({
        taskId: 'list-1',
        branchName: 'test/list-1',
        worktreePath: '.test-shadows/list-1',
        baseRef: 'main',
        workdir: testRepo,
      });
      await manager.createWorktree({
        taskId: 'list-2',
        branchName: 'test/list-2',
        worktreePath: '.test-shadows/list-2',
        baseRef: 'main',
        workdir: testRepo,
      });

      const worktrees = manager.getActiveWorktrees();
      expect(worktrees).toHaveLength(2);
      expect(worktrees.some((w) => w.taskId === 'list-1')).toBe(true);
      expect(worktrees.some((w) => w.taskId === 'list-2')).toBe(true);
    });
  });

  describe('verification', () => {
    it('should verify worktree health', async () => {
      const context = await manager.createWorktree({
        taskId: 'verify-test',
        branchName: 'test/verify',
        worktreePath: '.test-shadows/verify',
        baseRef: 'main',
        workdir: testRepo,
      });

      const verification = await manager.verifyWorktree('verify-test');
      expect(verification.exists).toBe(true);
      expect(verification.hasChanges).toBe(false);
      expect(verification.branchName).toBe('test/verify');
      expect(verification.error).toBeUndefined();

      // Make a change
      await writeFile(join(context.absolutePath, 'test.txt'), 'test content');

      const verification2 = await manager.verifyWorktree('verify-test');
      expect(verification2.hasChanges).toBe(true);
    });
  });
});
