import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';

import { StackBuildServiceImpl } from '@/services/vcs/stack-build-service';

// Mock external dependencies but use real service classes
vi.mock('@/adapters/vcs/git-wrapper');
vi.mock('@/adapters/vcs/git-spice/backend');
vi.mock('@/adapters/vcs/git-spice/worktree-sync');
vi.mock('execa');

const { mockGitWrapper } = vi.hoisted(() => {
  const gitWrapper = {
    branchExists: vi.fn(),
    checkout: vi.fn(),
    cherryPick: vi.fn(),
    raw: vi.fn(),
    status: vi.fn(),
  };
  return { mockGitWrapper: gitWrapper };
});

vi.mock('@/adapters/vcs/git-wrapper', () => ({
  GitWrapper: vi.fn().mockImplementation(() => mockGitWrapper),
}));

const { mockGitSpiceBackend } = vi.hoisted(() => {
  const backend = {
    createBranchFromCommit: vi.fn(),
    getStackInfo: vi.fn(),
    submitStack: vi.fn(),
    restack: vi.fn(),
  };
  return { mockGitSpiceBackend: backend };
});

vi.mock('@/adapters/vcs/git-spice/backend', () => ({
  GitSpiceBackend: vi.fn().mockImplementation(() => mockGitSpiceBackend),
}));

const { mockFetchSingleWorktreeCommit, mockFetchWorktreeCommits } = vi.hoisted(() => ({
  mockFetchSingleWorktreeCommit: vi.fn(),
  mockFetchWorktreeCommits: vi.fn(),
}));

vi.mock('@/adapters/vcs/git-spice/worktree-sync', () => ({
  fetchSingleWorktreeCommit: mockFetchSingleWorktreeCommit,
  fetchWorktreeCommits: mockFetchWorktreeCommits,
}));

const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('StackBuildService Integration - Incremental Building', () => {
  let service: StackBuildServiceImpl;

  const createTask = (overrides: Partial<ExecutionTask> = {}): ExecutionTask => ({
    id: 'task-1',
    title: 'Test Task',
    description: 'A test task',
    touches: [],
    produces: [],
    requires: [],
    estimatedLines: 10,
    agentPrompt: 'Do something',
    commitHash: 'abc1234',
    maxRetries: 3,
    retryCount: 0,
    state: 'completed',
    stateHistory: [],
    ...overrides,
  });

  const createWorktreeContext = (taskId: string): WorktreeContext => ({
    taskId,
    branchName: `chopstack/${taskId}`,
    baseRef: 'main',
    worktreePath: `/tmp/worktree-${taskId}`,
    absolutePath: `/tmp/worktree-${taskId}`,
    created: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behaviors
    mockGitWrapper.branchExists.mockResolvedValue(false);
    mockGitWrapper.checkout.mockResolvedValue(undefined);
    mockGitWrapper.cherryPick.mockResolvedValue(undefined);
    mockGitWrapper.raw.mockResolvedValue('');
    mockGitWrapper.status.mockResolvedValue({
      added: [],
      conflicted: [],
      deleted: [],
      modified: [],
      untracked: [],
    });

    // createBranchFromCommit now returns the actual branch name
    mockGitSpiceBackend.createBranchFromCommit.mockImplementation(
      (branchName: string) => branchName,
    );
    mockGitSpiceBackend.getStackInfo.mockResolvedValue(null);
    mockGitSpiceBackend.submitStack.mockResolvedValue([]);

    mockFetchSingleWorktreeCommit.mockResolvedValue(undefined);
    mockFetchWorktreeCommits.mockResolvedValue(undefined);
    mockExeca.mockResolvedValue({ stdout: '', all: '' });

    service = new StackBuildServiceImpl({
      branchPrefix: 'chopstack/',
      parentRef: 'main',
      stackSubmissionEnabled: false,
      conflictStrategy: 'auto',
    });
  });

  describe('Incremental Stack Building Flow', () => {
    it('builds stack incrementally as tasks complete', async () => {
      // Create tasks with dependencies: task-1 -> task-2 -> task-3
      const task1 = createTask({ id: 'task-1', commitHash: 'hash1' });
      const task2 = createTask({
        id: 'task-2',
        commitHash: 'hash2',
        requires: ['task-1'],
      });
      const task3 = createTask({
        id: 'task-3',
        commitHash: 'hash3',
        requires: ['task-2'],
      });

      // Initialize stack state
      service.initializeStackState('main');
      expect(service.getStackTip()).toBe('main');

      // Add task-1 (no dependencies)
      await service.addTaskToStack(task1, '/repo');

      expect(service.isTaskStacked('task-1')).toBe(true);
      expect(service.getStackTip()).toBe('chopstack/task-1');
      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenCalledWith(
        'chopstack/task-1',
        'hash1',
        'main',
        '/repo',
      );

      // Add task-3 (has unfulfilled dependency on task-2)
      await service.addTaskToStack(task3, '/repo');

      expect(service.isTaskStacked('task-3')).toBe(false);
      expect(service.getStackTip()).toBe('chopstack/task-1');

      // Add task-2 (should trigger task-3 to be processed)
      await service.addTaskToStack(task2, '/repo');

      expect(service.isTaskStacked('task-2')).toBe(true);
      expect(service.isTaskStacked('task-3')).toBe(true);
      expect(service.getStackTip()).toBe('chopstack/task-3');

      // Verify branch creation order
      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenNthCalledWith(
        2,
        'chopstack/task-2',
        'hash2',
        'chopstack/task-1',
        '/repo',
      );
      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenNthCalledWith(
        3,
        'chopstack/task-3',
        'hash3',
        'chopstack/task-2',
        '/repo',
      );
    });

    it('handles out-of-order task completion gracefully', async () => {
      const task1 = createTask({ id: 'task-1', commitHash: 'hash1' });
      const task2 = createTask({
        id: 'task-2',
        commitHash: 'hash2',
        requires: ['task-1'],
      });
      const task3 = createTask({
        id: 'task-3',
        commitHash: 'hash3',
        requires: ['task-1'],
      });

      service.initializeStackState('main');

      // Add tasks in reverse order
      await service.addTaskToStack(task3, '/repo');
      await service.addTaskToStack(task2, '/repo');

      // Neither should be stacked yet
      expect(service.isTaskStacked('task-2')).toBe(false);
      expect(service.isTaskStacked('task-3')).toBe(false);

      // Add task-1, should trigger both task-2 and task-3
      await service.addTaskToStack(task1, '/repo');

      expect(service.isTaskStacked('task-1')).toBe(true);
      expect(service.isTaskStacked('task-2')).toBe(true);
      expect(service.isTaskStacked('task-3')).toBe(true);

      // Should have created 3 branches
      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenCalledTimes(3);
    });

    it('retries failed branch creation with exponential backoff', async () => {
      const task = createTask({ id: 'task-1', commitHash: 'hash1' });

      // Configure service with retry settings
      service = new StackBuildServiceImpl({
        branchPrefix: 'chopstack/',
        parentRef: 'main',
        stackSubmissionEnabled: false,
        conflictStrategy: 'auto',
        retryConfig: {
          maxRetries: 3,
          retryDelayMs: 100,
        },
      });

      service.initializeStackState('main');

      // Mock first two attempts to fail with retryable errors
      mockGitSpiceBackend.createBranchFromCommit
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('resource temporarily unavailable'))
        .mockResolvedValueOnce('chopstack/task-1');

      const startTime = Date.now();
      await service.addTaskToStack(task, '/repo');
      const duration = Date.now() - startTime;

      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenCalledTimes(3);
      expect(service.isTaskStacked('task-1')).toBe(true);

      // Should have waited for retries (at least 100ms + 200ms = 300ms)
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('falls back to cherry-pick when branch creation fails permanently', async () => {
      const task = createTask({ id: 'task-1', commitHash: 'hash1' });

      service.initializeStackState('main');

      // Mock branch creation to fail with non-retryable error
      mockGitSpiceBackend.createBranchFromCommit.mockRejectedValue(new Error('conflict detected'));

      await service.addTaskToStack(task, '/repo');

      expect(mockGitSpiceBackend.createBranchFromCommit).toHaveBeenCalledTimes(1);
      expect(mockExeca).toHaveBeenCalled(); // Cherry-pick fallback
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('handles worktree context integration', async () => {
      const task = createTask({ id: 'task-1', commitHash: 'hash1' });
      const worktreeContext = createWorktreeContext('task-1');

      service.initializeStackState('main');

      await service.addTaskToStack(task, '/repo', worktreeContext);

      expect(mockFetchSingleWorktreeCommit).toHaveBeenCalledWith(task, worktreeContext, '/repo');
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('emits branch_created events for monitoring', async () => {
      const task = createTask({ id: 'task-1', commitHash: 'hash1' });
      const eventSpy = vi.fn();

      service.on('branch_created', eventSpy);
      service.initializeStackState('main');

      await service.addTaskToStack(task, '/repo');

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'branch_created',
          branchName: 'chopstack/task-1',
          taskId: 'task-1',
          timestamp: expect.any(Date),
        }),
      );
    });

    it('skips tasks without commit hash', async () => {
      const task = createTask({ id: 'task-1', commitHash: undefined });

      service.initializeStackState('main');

      await service.addTaskToStack(task, '/repo');

      expect(mockFetchSingleWorktreeCommit).not.toHaveBeenCalled();
      expect(mockGitSpiceBackend.createBranchFromCommit).not.toHaveBeenCalled();
      expect(service.isTaskStacked('task-1')).toBe(false);
    });

    it('maintains stack state across multiple operations', async () => {
      const tasks = [
        createTask({ id: 'task-1', commitHash: 'hash1' }),
        createTask({ id: 'task-2', commitHash: 'hash2', requires: ['task-1'] }),
        createTask({ id: 'task-3', commitHash: 'hash3', requires: ['task-1'] }),
        createTask({ id: 'task-4', commitHash: 'hash4', requires: ['task-2', 'task-3'] }),
      ];

      service.initializeStackState('main');

      // Add tasks one by one and verify state
      await service.addTaskToStack(tasks[0]!, '/repo');
      expect(service.getStackTip()).toBe('chopstack/task-1');

      await service.addTaskToStack(tasks[3]!, '/repo'); // Should be queued
      expect(service.isTaskStacked('task-4')).toBe(false);

      await service.addTaskToStack(tasks[1]!, '/repo');
      expect(service.getStackTip()).toBe('chopstack/task-2');

      await service.addTaskToStack(tasks[2]!, '/repo');
      // After adding task-3, task-4 should be processed since both its dependencies are met
      expect(service.isTaskStacked('task-3')).toBe(true);
      expect(service.isTaskStacked('task-4')).toBe(true);

      // The final tip should be task-4 since it was the last to be processed
      expect(service.getStackTip()).toBe('chopstack/task-4');
    });
  });

  describe('Legacy Compatibility', () => {
    it('maintains backward compatibility with buildStack method', async () => {
      const tasks = [
        createTask({ id: 'task-1', commitHash: 'hash1' }),
        createTask({ id: 'task-2', commitHash: 'hash2', requires: ['task-1'] }),
      ];

      const result = await service.buildStack(tasks, '/repo', {
        parentRef: 'main',
        strategy: 'dependency-order',
      });

      expect(result.branches).toHaveLength(2);
      expect(result.totalTasks).toBe(2);
      expect(result.strategy).toBe('dependency-order');
      expect(result.parentRef).toBe('main');
    });
  });
});
