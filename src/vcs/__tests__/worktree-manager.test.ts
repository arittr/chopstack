import { vi } from 'vitest';

import type { VcsEngineOptions } from '@/engine/vcs-engine';

import { WorktreeManager } from '@/vcs/worktree-manager';

// Mock promisified exec function
const mockExecAsync = vi.fn();

// Mock child_process with proper ESM mocking
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs/promises
const mockFs = {
  mkdir: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn(),
};
vi.mock('node:fs/promises', () => mockFs);

// Mock util.promisify to return our mock exec
vi.mock('node:util', () => ({
  promisify: vi.fn().mockReturnValue(mockExecAsync),
}));

describe('WorktreeManager', () => {
  let worktreeManager: WorktreeManager;
  let mockOptions: VcsEngineOptions;

  beforeEach(() => {
    mockOptions = {
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
    };

    worktreeManager = new WorktreeManager(mockOptions);

    // Clear all mocks and set default successful responses
    vi.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.rmdir.mockResolvedValue(undefined);
  });

  describe('createWorktree', () => {
    it('should create a new worktree context', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      const context = await worktreeManager.createWorktree(options);

      expect(context.taskId).toBe('test-task');
      expect(context.branchName).toBe('test/test-task');
      expect(context.worktreePath).toBe('.test-shadows/test-task');
      expect(context.baseRef).toBe('main');
      expect(context.absolutePath).toBe('/tmp/test/.test-shadows/test-task');
      expect(context.created).toBeInstanceOf(Date);

      // Verify git commands were called
      expect(mockExecAsync).toHaveBeenCalledWith(
        'git worktree add -b "test/test-task" "/tmp/test/.test-shadows/test-task" "main"',
        { cwd: '/tmp/test', timeout: 30_000 },
      );
    });

    it('should reuse existing worktree if it already exists', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      // Create worktree first time
      const context1 = await worktreeManager.createWorktree(options);

      // Create same worktree again - should reuse
      const context2 = await worktreeManager.createWorktree(options);

      expect(context1).toBe(context2);
      expect(worktreeManager.getActiveWorktrees()).toHaveLength(1);
    });

    it('should handle worktree creation errors gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Git worktree failed'));

      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await expect(worktreeManager.createWorktree(options)).rejects.toThrow();
    });

    it('should fallback to existing branch if branch creation fails', async () => {
      // First call fails (branch creation), second succeeds (use existing branch)
      mockExecAsync
        .mockRejectedValueOnce(new Error('Branch already exists'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      const context = await worktreeManager.createWorktree(options);

      expect(context.taskId).toBe('test-task');
      expect(mockExecAsync).toHaveBeenCalledTimes(2);

      // First call with -b flag
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        1,
        'git worktree add -b "test/test-task" "/tmp/test/.test-shadows/test-task" "main"',
        { cwd: '/tmp/test', timeout: 30_000 },
      );

      // Second call without -b flag
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        2,
        'git worktree add "/tmp/test/.test-shadows/test-task" "test/test-task"',
        { cwd: '/tmp/test', timeout: 30_000 },
      );
    });
  });

  describe('getWorktreeContext', () => {
    it('should return undefined for non-existent worktree', () => {
      const context = worktreeManager.getWorktreeContext('non-existent');
      expect(context).toBeUndefined();
    });

    it('should return context for existing worktree', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);
      const context = worktreeManager.getWorktreeContext('test-task');

      expect(context).toBeDefined();
      expect(context?.taskId).toBe('test-task');
    });
  });

  describe('hasWorktree', () => {
    it('should return false for non-existent worktree', () => {
      expect(worktreeManager.hasWorktree('non-existent')).toBe(false);
    });

    it('should return true for existing worktree', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);
      expect(worktreeManager.hasWorktree('test-task')).toBe(true);
    });
  });

  describe('removeWorktree', () => {
    it('should return false for non-existent worktree', async () => {
      const result = await worktreeManager.removeWorktree('non-existent');
      expect(result).toBe(false);
    });

    it('should successfully remove existing worktree', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);
      expect(worktreeManager.hasWorktree('test-task')).toBe(true);

      const result = await worktreeManager.removeWorktree('test-task');
      expect(result).toBe(true);
      expect(worktreeManager.hasWorktree('test-task')).toBe(false);

      // Verify remove command was called
      expect(mockExecAsync).toHaveBeenCalledWith(
        'git worktree remove  "/tmp/test/.test-shadows/test-task"',
        { cwd: '/tmp/test', timeout: 15_000 },
      );
    });

    it('should retry with force flag on failure', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);

      // Mock removal to fail first, then succeed with force
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // create worktree
        .mockRejectedValueOnce(new Error('Remove failed')) // first remove attempt
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // force remove

      const result = await worktreeManager.removeWorktree('test-task');

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledTimes(3);

      // Verify force flag was used on retry
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        3,
        'git worktree remove --force "/tmp/test/.test-shadows/test-task"',
        { cwd: '/tmp/test', timeout: 15_000 },
      );
    });
  });

  describe('cleanupWorktrees', () => {
    it('should cleanup multiple worktrees in parallel', async () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];

      // Create multiple worktrees
      await Promise.all(
        taskIds.map(async (taskId) =>
          worktreeManager.createWorktree({
            taskId,
            branchName: `test/${taskId}`,
            worktreePath: `.test-shadows/${taskId}`,
            baseRef: 'main',
            workdir: '/tmp/test',
          }),
        ),
      );

      expect(worktreeManager.getActiveWorktrees()).toHaveLength(3);

      const result = await worktreeManager.cleanupWorktrees(taskIds);

      expect(result.removed).toEqual(taskIds);
      expect(result.failed).toEqual([]);
      expect(worktreeManager.getActiveWorktrees()).toHaveLength(0);
    });

    it('should handle partial cleanup failures', async () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];

      // Create multiple worktrees
      await Promise.all(
        taskIds.map(async (taskId) =>
          worktreeManager.createWorktree({
            taskId,
            branchName: `test/${taskId}`,
            worktreePath: `.test-shadows/${taskId}`,
            baseRef: 'main',
            workdir: '/tmp/test',
          }),
        ),
      );

      // Mock task-2 removal to fail completely
      mockExecAsync
        .mockResolvedValue({ stdout: '', stderr: '' }) // default success
        .mockRejectedValueOnce(new Error('Remove failed')) // task-2 first attempt
        .mockRejectedValueOnce(new Error('Remove with force also failed')); // task-2 force attempt

      const result = await worktreeManager.cleanupWorktrees(taskIds);

      expect(result.removed).toContain('task-1');
      expect(result.removed).toContain('task-3');
      expect(result.failed).toContain('task-2');
      expect(result.removed).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('verifyWorktree', () => {
    it('should return error for non-existent worktree', async () => {
      const result = await worktreeManager.verifyWorktree('non-existent');

      expect(result.exists).toBe(false);
      expect(result.isGitRepo).toBe(false);
      expect(result.hasChanges).toBe(false);
      expect(result.error).toContain('Worktree context not found');
    });

    it('should verify existing worktree with no changes', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);

      // Mock git commands for verification
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'test/test-task\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git status --porcelain

      const result = await worktreeManager.verifyWorktree('test-task');

      expect(result.exists).toBe(true);
      expect(result.isGitRepo).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.branchName).toBe('test/test-task');
      expect(result.error).toBeUndefined();
    });

    it('should detect changes in worktree', async () => {
      const options = {
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      };

      await worktreeManager.createWorktree(options);

      // Mock git commands showing changes
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'test/test-task\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: ' M file.txt\n', stderr: '' }); // git status --porcelain

      const result = await worktreeManager.verifyWorktree('test-task');

      expect(result.exists).toBe(true);
      expect(result.isGitRepo).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.branchName).toBe('test/test-task');
    });
  });

  describe('getWorktreeStats', () => {
    it('should return empty stats for no worktrees', async () => {
      const stats = await worktreeManager.getWorktreeStats();

      expect(stats.totalWorktrees).toBe(0);
      expect(stats.totalDiskUsage).toBe(0);
      expect(stats.averageSize).toBe(0);
      expect(stats.oldestWorktree).toBeUndefined();
      expect(stats.newestWorktree).toBeUndefined();
    });

    it('should calculate stats for active worktrees', async () => {
      // Mock du command to return size
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('du -sk')) {
          return { stdout: '1024\t/some/path', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      // Create a worktree
      await worktreeManager.createWorktree({
        taskId: 'test-task',
        branchName: 'test/test-task',
        worktreePath: '.test-shadows/test-task',
        baseRef: 'main',
        workdir: '/tmp/test',
      });

      const stats = await worktreeManager.getWorktreeStats();

      expect(stats.totalWorktrees).toBe(1);
      expect(stats.totalDiskUsage).toBe(1024);
      expect(stats.averageSize).toBe(1024);
      expect(stats.oldestWorktree).toBeInstanceOf(Date);
      expect(stats.newestWorktree).toBeInstanceOf(Date);
    });

    it('should handle multiple worktrees and calculate averages', async () => {
      // Mock du command to return different sizes
      let duCallCount = 0;
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('du -sk')) {
          duCallCount++;
          const size = duCallCount * 512; // 512, 1024, 1536 KB
          return { stdout: `${size}\t/some/path`, stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      const taskIds = ['task-1', 'task-2', 'task-3'];

      // Create multiple worktrees
      await Promise.all(
        taskIds.map(async (taskId) =>
          worktreeManager.createWorktree({
            taskId,
            branchName: `test/${taskId}`,
            worktreePath: `.test-shadows/${taskId}`,
            baseRef: 'main',
            workdir: '/tmp/test',
          }),
        ),
      );

      const stats = await worktreeManager.getWorktreeStats();

      expect(stats.totalWorktrees).toBe(3);
      expect(stats.totalDiskUsage).toBe(512 + 1024 + 1536); // 3072 KB
      expect(stats.averageSize).toBe(Math.round(3072 / 3)); // 1024 KB
      expect(stats.oldestWorktree).toBeInstanceOf(Date);
      expect(stats.newestWorktree).toBeInstanceOf(Date);
    });
  });
});