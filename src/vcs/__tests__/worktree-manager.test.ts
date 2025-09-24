import * as path from 'node:path';

import { TEST_PATHS } from '@test/constants/test-paths';
import { vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn(),
  stat: vi.fn(),
}));

const gitMocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  listWorktrees: vi.fn(),
  status: vi.fn(),
  gitRaw: vi.fn(),
  gitRevparse: vi.fn(),
}));

vi.mock('@/utils/git-wrapper', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  GitWrapper: vi.fn(() => ({
    createWorktree: gitMocks.createWorktree,
    removeWorktree: gitMocks.removeWorktree,
    listWorktrees: gitMocks.listWorktrees,
    status: gitMocks.status,
    git: {
      raw: gitMocks.gitRaw,
      revparse: gitMocks.gitRevparse,
    },
  })),
}));

vi.mock('node:fs/promises', () => fsMocks);

const { WorktreeManager } = await import('@/vcs/worktree-manager');
type WorktreeManagerType = InstanceType<typeof WorktreeManager>;

describe('WorktreeManager', () => {
  let manager: WorktreeManagerType;

  beforeEach(() => {
    vi.clearAllMocks();

    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.access.mockResolvedValue(undefined);
    fsMocks.readdir.mockResolvedValue([]);
    fsMocks.rmdir.mockResolvedValue(undefined);
    fsMocks.stat.mockResolvedValue({ size: 1024 } as unknown as Awaited<
      ReturnType<typeof fsMocks.stat>
    >);

    gitMocks.createWorktree.mockResolvedValue(undefined);
    gitMocks.removeWorktree.mockResolvedValue(undefined);
    gitMocks.listWorktrees.mockResolvedValue([]);
    gitMocks.status.mockResolvedValue({
      added: [],
      deleted: [],
      modified: [],
    });
    gitMocks.gitRaw.mockRejectedValue(new Error('branch not found'));
    gitMocks.gitRevparse.mockResolvedValue('feature/test');

    manager = new WorktreeManager({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
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

  describe('createWorktree', () => {
    it('creates a worktree and stores context', async () => {
      const context = await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      expect(fsMocks.mkdir).toHaveBeenCalledWith(
        path.join(TEST_PATHS.TEST_TMP, TEST_PATHS.TEST_SHADOWS),
        {
          recursive: true,
        },
      );
      expect(gitMocks.createWorktree).toHaveBeenCalledWith(
        path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'),
        'main',
        'test/task-1',
      );
      expect(context.absolutePath).toBe(path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'));
      expect(manager.hasWorktree('task-1')).toBe(true);
    });

    it('reuses existing context on subsequent calls', async () => {
      const options = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      };

      const first = await manager.createWorktree(options);
      const second = await manager.createWorktree(options);

      expect(first).toBe(second);
      expect(gitMocks.createWorktree).toHaveBeenCalledTimes(1);
    });

    it('generates unique branch name if branch already exists', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123);
      gitMocks.gitRaw.mockResolvedValueOnce('exists');

      const context = await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      expect(context.branchName).toBe('test/task-1-123');
      expect(gitMocks.createWorktree).toHaveBeenCalledWith(
        path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'),
        'main',
        'test/task-1-123',
      );

      nowSpy.mockRestore();
    });
  });

  describe('removeWorktree', () => {
    it('removes existing worktree and cleans up map', async () => {
      await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      const result = await manager.removeWorktree('task-1');

      expect(result).toBe(true);
      expect(gitMocks.removeWorktree).toHaveBeenCalledWith(
        path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'),
        false,
      );
      expect(manager.hasWorktree('task-1')).toBe(false);
    });

    it('retries with force flag on failure', async () => {
      gitMocks.removeWorktree.mockRejectedValueOnce(new Error('failed'));
      gitMocks.removeWorktree.mockResolvedValueOnce(undefined);

      await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      const result = await manager.removeWorktree('task-1');

      expect(result).toBe(true);
      expect(gitMocks.removeWorktree).toHaveBeenNthCalledWith(
        1,
        path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'),
        false,
      );
      expect(gitMocks.removeWorktree).toHaveBeenNthCalledWith(
        2,
        path.join(TEST_PATHS.TEST_TMP, '.test-shadows/task-1'),
        true,
      );
    });
  });

  describe('verifyWorktree', () => {
    it('returns error when worktree missing', async () => {
      const result = await manager.verifyWorktree('unknown');
      expect(result.exists).toBe(false);
      expect(result.error).toBe('Worktree context not found');
    });

    it('reports git status when worktree exists', async () => {
      await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      fsMocks.access.mockResolvedValue(undefined);
      gitMocks.gitRevparse.mockResolvedValue('feature/task-1');
      gitMocks.status.mockResolvedValue({ added: ['a.ts'], modified: [], deleted: [] });

      const result = await manager.verifyWorktree('task-1');

      expect(result.exists).toBe(true);
      expect(result.branchName).toBe('feature/task-1');
      expect(result.hasChanges).toBe(true);
    });
  });

  describe('getWorktreeStats', () => {
    it('returns zero stats when no worktrees', async () => {
      const stats = await manager.getWorktreeStats();
      expect(stats.totalWorktrees).toBe(0);
      expect(stats.totalDiskUsage).toBe(0);
    });

    it('aggregates stats for active worktrees', async () => {
      const context = await manager.createWorktree({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        baseRef: 'main',
        workdir: TEST_PATHS.TEST_TMP,
      });

      fsMocks.stat.mockResolvedValueOnce({ size: 2048 } as any);
      fsMocks.stat.mockResolvedValueOnce({ size: 1024 } as any);

      // Manually set created dates for deterministic ordering
      const secondContext = {
        ...context,
        taskId: 'task-2',
        created: new Date(context.created.getTime() + 1000),
      };
      (manager as any).activeWorktrees.set('task-2', secondContext);

      const stats = await manager.getWorktreeStats();

      expect(stats.totalWorktrees).toBe(2);
      expect(stats.totalDiskUsage).toBe(3); // 2048 -> 2 KB, 1024 -> 1 KB
      expect(stats.averageSize).toBe(2);
      expect(stats.oldestWorktree).toEqual(context.created);
      expect(stats.newestWorktree).toEqual(secondContext.created);
    });
  });
});
