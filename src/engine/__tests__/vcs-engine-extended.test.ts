import { TEST_CONFIG, TEST_PATHS } from '@test/constants/test-paths';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionTask } from '@/types/execution';
import type { WorktreeContext } from '@/vcs/worktree-manager';

import { VcsEngine } from '@/engine/vcs-engine';
import { ConflictResolver } from '@/vcs/conflict-resolver';
import { GitWrapper } from '@/vcs/git-wrapper';
import { StackBuilder } from '@/vcs/stack-builder';
import { WorktreeManager } from '@/vcs/worktree-manager';

// Mock all dependencies
vi.mock('@/utils/git-wrapper');
vi.mock('@/vcs/worktree-manager');
vi.mock('@/vcs/stack-builder');
vi.mock('@/vcs/conflict-resolver');
vi.mock('execa');

describe('VcsEngine Extended Tests', () => {
  let vcsEngine: VcsEngine;
  let mockWorktreeManager: any;
  let mockStackBuilder: any;
  let mockConflictResolver: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock instances
    mockWorktreeManager = {
      on: vi.fn(),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      cleanupWorktrees: vi.fn(),
      cleanupAllWorktrees: vi.fn(),
      hasWorktree: vi.fn(),
      getWorktree: vi.fn(),
      getActiveWorktrees: vi.fn(),
    };

    mockStackBuilder = {
      on: vi.fn(),
      buildIncremental: vi.fn(),
      submitStack: vi.fn(),
      getStackStatus: vi.fn(),
    };

    mockConflictResolver = {
      resolveConflicts: vi.fn(),
      hasConflicts: vi.fn(),
      getConflictStatus: vi.fn(),
    };

    // Setup mock constructors
    vi.mocked(WorktreeManager).mockImplementation(() => mockWorktreeManager as WorktreeManager);
    vi.mocked(StackBuilder).mockImplementation(() => mockStackBuilder as StackBuilder);
    vi.mocked(ConflictResolver).mockImplementation(() => mockConflictResolver as ConflictResolver);

    vcsEngine = new VcsEngine({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
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

  describe('createWorktreesForLayer', () => {
    it('should create worktrees for all tasks in a layer', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'First task',
          touches: [],
          produces: ['file1.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file 1',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Second task',
          touches: [],
          produces: ['file2.ts'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Create file 2',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      const mockContext1 = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path/.test-shadows/task-1',
        baseRef: 'main',
        created: new Date(),
      };

      const mockContext2 = {
        taskId: 'task-2',
        branchName: 'test/task-2',
        worktreePath: '.test-shadows/task-2',
        absolutePath: '/test/path/.test-shadows/task-2',
        baseRef: 'main',
        created: new Date(),
      };

      mockWorktreeManager.createWorktree
        .mockResolvedValueOnce(mockContext1)
        .mockResolvedValueOnce(mockContext2);

      const contexts = await vcsEngine.createWorktreesForLayer(tasks, 'main', TEST_PATHS.TEST_TMP);

      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toMatchObject({
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path/.test-shadows/task-1',
        baseRef: 'main',
      });
      expect(contexts[1]).toMatchObject({
        taskId: 'task-2',
        branchName: 'test/task-2',
        worktreePath: '.test-shadows/task-2',
        absolutePath: '/test/path/.test-shadows/task-2',
        baseRef: 'main',
      });
      expect(mockWorktreeManager.createWorktree).toHaveBeenCalledTimes(2);
    });

    it('should handle failures when creating worktrees', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'First task',
          touches: [],
          produces: ['file1.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file 1',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      mockWorktreeManager.createWorktree.mockRejectedValueOnce(
        new Error('Failed to create worktree'),
      );

      await expect(
        vcsEngine.createWorktreesForLayer(tasks, 'main', TEST_PATHS.TEST_TMP),
      ).rejects.toThrow('Failed to create worktree');

      expect(mockWorktreeManager.createWorktree).toHaveBeenCalledTimes(1);
    });

    it('should use correct base ref for dependent layers', async () => {
      const tasks: ExecutionTask[] = [
        {
          id: 'task-3',
          title: 'Task 3',
          description: 'Dependent task',
          touches: [],
          produces: ['file3.ts'],
          requires: ['task-1', 'task-2'],
          estimatedLines: 20,
          agentPrompt: 'Create file 3',
          state: 'pending',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      const mockContext = {
        taskId: 'task-3',
        branchName: 'test/task-3',
        worktreePath: '.test-shadows/task-3',
        absolutePath: '/test/path/.test-shadows/task-3',
        baseRef: 'test/layer-1',
        created: new Date(),
      };

      mockWorktreeManager.createWorktree.mockResolvedValueOnce(mockContext);

      const contexts = await vcsEngine.createWorktreesForLayer(
        tasks,
        'test/layer-1', // Use previous layer branch as base
        TEST_PATHS.TEST_TMP,
      );

      expect(contexts).toHaveLength(1);
      expect(mockWorktreeManager.createWorktree).toHaveBeenCalledWith({
        taskId: 'task-3',
        branchName: 'test/task-3',
        worktreePath: '.test-shadows/task-3',
        baseRef: 'test/layer-1',
        workdir: TEST_PATHS.TEST_TMP,
      });
    });
  });

  describe('commitTaskChanges', () => {
    let mockGitWrapper: any;

    beforeEach(() => {
      mockGitWrapper = {
        add: vi.fn(),
        commit: vi.fn(),
        status: vi.fn(),
        hasChangesToCommit: vi.fn(),
      };
      vi.mocked(GitWrapper).mockImplementation(() => mockGitWrapper as GitWrapper);
    });

    it('should commit changes with generated message', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: [],
        produces: ['file1.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create file 1',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      mockGitWrapper.hasChangesToCommit.mockResolvedValueOnce(true);
      mockGitWrapper.status.mockResolvedValueOnce({
        added: ['file1.ts'],
        modified: [],
        deleted: [],
        untracked: [],
      });
      mockGitWrapper.commit.mockResolvedValueOnce('abc123');

      const context: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path',
        baseRef: 'main',
        created: new Date(),
      };

      const commitHash = await vcsEngine.commitTaskChanges(task, context, { includeAll: true });

      expect(commitHash).toBe('abc123');
      expect(mockGitWrapper.add).toHaveBeenCalledWith('.');
      expect(mockGitWrapper.commit).toHaveBeenCalled();
    });

    it('should use custom message if provided', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: [],
        produces: ['file1.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create file 1',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      mockGitWrapper.hasChangesToCommit.mockResolvedValueOnce(true);
      mockGitWrapper.commit.mockResolvedValueOnce('abc123');

      const customMessage = 'Custom commit message';

      const context: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path',
        baseRef: 'main',
        created: new Date(),
      };

      const commitHash = await vcsEngine.commitTaskChanges(task, context, {
        message: customMessage,
      });

      expect(commitHash).toBe('abc123');
      expect(mockGitWrapper.commit).toHaveBeenCalledWith(expect.stringContaining(customMessage));
    });

    it('should return null when no changes to commit', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: [],
        produces: ['file1.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create file 1',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      mockGitWrapper.hasChangesToCommit.mockResolvedValueOnce(false);
      mockGitWrapper.status.mockResolvedValueOnce({
        added: [],
        modified: [],
        deleted: [],
        untracked: [],
      });

      const context: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path',
        baseRef: 'main',
        created: new Date(),
      };

      await expect(
        vcsEngine.commitTaskChanges(task, context, { includeAll: true }),
      ).rejects.toThrow('No changes to commit');

      expect(mockGitWrapper.commit).not.toHaveBeenCalled();
    });

    it('should handle specific files when provided', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: [],
        produces: ['file1.ts', 'file2.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create files',
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      mockGitWrapper.hasChangesToCommit.mockResolvedValueOnce(true);
      mockGitWrapper.commit.mockResolvedValueOnce('abc123');

      const context: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '.test-shadows/task-1',
        absolutePath: '/test/path',
        baseRef: 'main',
        created: new Date(),
      };

      const commitHash = await vcsEngine.commitTaskChanges(task, context, { files: ['file1.ts'] });

      expect(commitHash).toBe('abc123');
      expect(mockGitWrapper.add).toHaveBeenCalledWith(['file1.ts']);
    });
  });

  describe('buildStackIncremental', () => {
    it('should build stack from completed tasks', async () => {
      const completedTasks: ExecutionTask[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'First task',
          touches: [],
          produces: ['file1.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file 1',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Second task',
          touches: [],
          produces: ['file2.ts'],
          requires: ['task-1'],
          estimatedLines: 15,
          agentPrompt: 'Create file 2',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      mockStackBuilder.buildIncremental.mockResolvedValueOnce({
        branches: [
          { commitHash: 'abc123', name: 'test/task-1', parent: 'main', taskId: 'task-1' },
          { commitHash: 'def456', name: 'test/task-2', parent: 'test/task-1', taskId: 'task-2' },
        ],
        stackRoot: 'main',
      });

      const result = await vcsEngine.buildStackIncremental(completedTasks, TEST_PATHS.TEST_TMP);

      expect(result).toBeDefined();
      expect(result.branches).toHaveLength(2);
      expect(mockStackBuilder.buildIncremental).toHaveBeenCalled();
    });

    it('should handle stack building failures', async () => {
      const completedTasks: ExecutionTask[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'First task',
          touches: [],
          produces: ['file1.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create file 1',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      mockStackBuilder.buildIncremental.mockRejectedValueOnce(new Error('Stack building failed'));

      await expect(
        vcsEngine.buildStackIncremental(completedTasks, TEST_PATHS.TEST_TMP),
      ).rejects.toThrow('Stack building failed');
    });
  });

  describe('cleanupWorktrees', () => {
    it('should cleanup worktrees based on contexts', async () => {
      const contexts = [
        {
          taskId: 'task-1',
          branchName: 'test/task-1',
          worktreePath: '.test-shadows/task-1',
          absolutePath: '/test/path/.test-shadows/task-1',
          baseRef: 'main',
        },
        {
          taskId: 'task-2',
          branchName: 'test/task-2',
          worktreePath: '.test-shadows/task-2',
          absolutePath: '/test/path/.test-shadows/task-2',
          baseRef: 'main',
        },
      ];

      mockWorktreeManager.cleanupWorktrees.mockResolvedValueOnce({
        removed: ['task-1', 'task-2'],
        failed: [],
      });

      // With cleanupOnSuccess: true, cleanupOnFailure: false
      await vcsEngine.cleanupWorktrees(contexts);

      expect(mockWorktreeManager.cleanupWorktrees).toHaveBeenCalledWith(['task-1', 'task-2']);
    });

    it('should respect preserveOnFailure option', async () => {
      const contexts = [
        {
          taskId: 'task-1',
          branchName: 'test/task-1',
          worktreePath: '.test-shadows/task-1',
          absolutePath: '/test/path/.test-shadows/task-1',
          baseRef: 'main',
        },
      ];

      mockWorktreeManager.cleanupWorktrees.mockResolvedValueOnce({
        removed: ['task-1'],
        failed: [],
      });

      // With preserveOnFailure: true, should only clean up if cleanupOnSuccess is true
      await vcsEngine.cleanupWorktrees(contexts, { preserveOnFailure: true });

      // Should have been called because cleanupOnSuccess is true
      expect(mockWorktreeManager.cleanupWorktrees).toHaveBeenCalledWith(['task-1']);
    });

    it('should not cleanup when options are disabled', async () => {
      // Create new engine with both cleanup options disabled
      const noCleanupEngine = new VcsEngine({
        shadowPath: TEST_PATHS.TEST_SHADOWS,
        branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
        cleanupOnSuccess: false,
        cleanupOnFailure: false,
        conflictStrategy: 'auto',
        stackSubmission: {
          enabled: false,
          draft: true,
          autoMerge: false,
        },
      });

      const contexts = [
        {
          taskId: 'task-1',
          branchName: 'test/task-1',
          worktreePath: '.test-shadows/task-1',
          absolutePath: '/test/path/.test-shadows/task-1',
          baseRef: 'main',
        },
      ];

      await noCleanupEngine.cleanupWorktrees(contexts);

      // cleanupWorktrees should not be called when cleanup options are disabled
      expect(mockWorktreeManager.cleanupWorktrees).not.toHaveBeenCalled();
    });
  });

  describe('event forwarding', () => {
    it('should forward worktree events', () => {
      const listener = vi.fn();
      vcsEngine.on('worktree_created', listener);

      const event = {
        type: 'created',
        taskId: 'task-1',
        branchName: 'test/task-1',
        worktreePath: '/test/path',
        timestamp: new Date(),
      };

      // Trigger the event on the mock
      const worktreeCreatedHandler = mockWorktreeManager.on.mock.calls.find(
        ([eventName]: [string, (...args: any[]) => void]) => eventName === 'worktree_created',
      )?.[1];

      expect(worktreeCreatedHandler).toBeDefined();
      worktreeCreatedHandler(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should forward stack builder events', () => {
      const listener = vi.fn();
      vcsEngine.on('stack_built', listener);

      const event = {
        type: 'built',
        stackName: 'test-stack',
        branches: ['test/task-1', 'test/task-2'],
        timestamp: new Date(),
      };

      // Trigger the event on the mock
      const stackBuiltHandler = mockStackBuilder.on.mock.calls.find(
        ([eventName]: [string, (...args: any[]) => void]) => eventName === 'stack_built',
      )?.[1];

      expect(stackBuiltHandler).toBeDefined();
      stackBuiltHandler(event);

      expect(listener).toHaveBeenCalledWith(event);
    });
  });
});
