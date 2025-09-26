import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionTask } from '@/core/execution/types';
import type {
  ConflictResolutionService,
  ConflictResolutionStrategy,
} from '@/core/vcs/domain-services';

import { StackBuildServiceImpl } from '@/services/vcs/stack-build-service';

type GitWrapperStub = {
  branchExists: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
  cherryPick: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
};

const gitWrapperInstances: GitWrapperStub[] = [];

const createGitWrapperStub = (): GitWrapperStub => ({
  branchExists: vi.fn().mockResolvedValue(false),
  checkout: vi.fn().mockResolvedValue(undefined),
  cherryPick: vi.fn().mockResolvedValue(undefined),
  raw: vi.fn().mockResolvedValue(''),
  status: vi.fn().mockResolvedValue({
    added: [],
    conflicted: [],
    deleted: [],
    modified: [],
    untracked: [],
  }),
});

let nextGitWrapperFactory: () => GitWrapperStub = createGitWrapperStub;

vi.mock('@/adapters/vcs/git-wrapper', () => {
  const GitWrapper = vi.fn().mockImplementation(() => {
    const stub = nextGitWrapperFactory();
    gitWrapperInstances.push(stub);
    return stub;
  });
  return { GitWrapper };
});

const { fetchWorktreeCommitsMock, fetchSingleWorktreeCommitMock } = vi.hoisted(() => {
  const fetchMock = vi.fn().mockResolvedValue(undefined);
  const singleMock = vi.fn().mockResolvedValue(undefined);
  return { fetchWorktreeCommitsMock: fetchMock, fetchSingleWorktreeCommitMock: singleMock };
});

vi.mock('@/adapters/vcs/git-spice/worktree-sync', () => ({
  fetchWorktreeCommits: fetchWorktreeCommitsMock,
  fetchSingleWorktreeCommit: fetchSingleWorktreeCommitMock,
}));

const { execaMock } = vi.hoisted(() => {
  const mock = vi.fn().mockResolvedValue({ stdout: '', all: '' });
  return { execaMock: mock };
});

vi.mock('execa', () => ({
  execa: execaMock,
}));

const createBranchFromCommitMock = vi.fn();

vi.mock('@/adapters/vcs/git-spice/backend', () => ({
  GitSpiceBackend: vi.fn().mockImplementation(() => ({
    createBranchFromCommit: createBranchFromCommitMock,
    getStackInfo: vi.fn().mockResolvedValue(null),
    submitStack: vi.fn().mockResolvedValue([]),
  })),
}));

const defaultConfig = {
  branchPrefix: 'chopstack/',
  parentRef: 'main',
  stackSubmissionEnabled: false,
  conflictStrategy: 'auto' as ConflictResolutionStrategy,
};

const baseTask: ExecutionTask = {
  id: 'task-1',
  title: 'Task 1',
  description: 'Demo task',
  touches: [],
  produces: [],
  requires: [],
  estimatedLines: 5,
  agentPrompt: 'do work',
  commitHash: 'abc1234',
  maxRetries: 1,
  retryCount: 0,
  state: 'completed',
  stateHistory: [],
};

const createConflictResolutionService = (resolveResult: boolean): ConflictResolutionService => ({
  detectConflicts: vi.fn().mockResolvedValue(null),
  getAvailableStrategies: vi.fn().mockReturnValue(['auto', 'manual', 'fail']),
  resolveConflicts: vi.fn().mockResolvedValue(resolveResult),
});

describe('StackBuildServiceImpl', () => {
  beforeEach(() => {
    fetchWorktreeCommitsMock.mockClear();
    fetchSingleWorktreeCommitMock.mockClear();
    execaMock.mockReset();
    execaMock.mockResolvedValue({ stdout: '', all: '' });
    createBranchFromCommitMock.mockReset();
    createBranchFromCommitMock.mockResolvedValue(undefined);
    gitWrapperInstances.length = 0;
    nextGitWrapperFactory = createGitWrapperStub;
  });

  it('fetches worktree commits before building stack', async () => {
    const service = new StackBuildServiceImpl(defaultConfig);

    await service.buildStack([baseTask], '/repo', {
      parentRef: 'main',
      strategy: 'dependency-order',
    });

    expect(fetchWorktreeCommitsMock).toHaveBeenCalledTimes(1);
    expect(createBranchFromCommitMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to manual cherry-pick and resolves conflicts automatically', async () => {
    createBranchFromCommitMock.mockRejectedValueOnce(new Error('commit not found'));

    nextGitWrapperFactory = () => {
      const stub = createGitWrapperStub();
      const conflictStatus = {
        added: [],
        conflicted: ['src/example.ts'],
        deleted: [],
        modified: [],
        untracked: [],
      };
      stub.cherryPick.mockRejectedValueOnce(new Error('conflict'));
      stub.status.mockResolvedValue(conflictStatus);
      stub.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'cherry-pick' && args[1] === '--continue') {
          return '';
        }
        if (args[0] === 'cherry-pick' && args[1] === '--abort') {
          return '';
        }
        if (args[0] === 'branch' && args[1] === '-D') {
          return '';
        }
        return '';
      });
      return stub;
    };

    const conflictResolutionService = createConflictResolutionService(true);

    const service = new StackBuildServiceImpl(defaultConfig, {
      conflictResolutionService,
    });

    const result = await service.buildStack([baseTask], '/repo', {
      parentRef: 'main',
      strategy: 'dependency-order',
    });

    expect(conflictResolutionService.resolveConflicts).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalled();
    expect(result.failedTasks).toBeUndefined();
    const gitStub = gitWrapperInstances[0];
    expect(gitStub).toBeDefined();
    expect(gitStub!.raw).toHaveBeenCalledWith(['cherry-pick', '--continue']);
  });

  it('records failed tasks when conflicts cannot be resolved', async () => {
    createBranchFromCommitMock.mockRejectedValueOnce(new Error('conflict'));

    nextGitWrapperFactory = () => {
      const stub = createGitWrapperStub();
      stub.cherryPick.mockRejectedValueOnce(new Error('conflict'));
      stub.status.mockResolvedValue({
        added: [],
        conflicted: ['src/broken.ts'],
        deleted: [],
        modified: [],
        untracked: [],
      });
      stub.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'cherry-pick' && args[1] === '--abort') {
          return '';
        }
        if (args[0] === 'branch' && args[1] === '-D') {
          return '';
        }
        return '';
      });
      return stub;
    };

    const conflictResolutionService = createConflictResolutionService(false);

    const service = new StackBuildServiceImpl(defaultConfig, {
      conflictResolutionService,
    });

    const result = await service.buildStack([baseTask], '/repo', {
      parentRef: 'main',
      strategy: 'dependency-order',
    });

    expect(result.failedTasks).toBeDefined();
    expect(result.failedTasks?.[0]?.taskId).toBe('task-1');
    expect(conflictResolutionService.resolveConflicts).toHaveBeenCalledTimes(1);
  });

  describe('Incremental Stack Building', () => {
    it('initializes stack state on first call to addTaskToStack', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);

      expect(service.getStackTip()).toBe('main');
      expect(service.isTaskStacked('task-1')).toBe(false);

      await service.addTaskToStack(baseTask, '/repo');

      expect(service.getStackTip()).toBe('chopstack/task-1');
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('queues tasks with unsatisfied dependencies', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);
      service.initializeStackState('main');

      const dependentTask: ExecutionTask = {
        ...baseTask,
        id: 'task-2',
        title: 'Task 2',
        requires: ['task-1'],
        commitHash: 'def5678',
      };

      // Try to add task-2 before task-1
      await service.addTaskToStack(dependentTask, '/repo');

      // Task 2 should not be stacked yet
      expect(service.isTaskStacked('task-2')).toBe(false);
      expect(service.getStackTip()).toBe('main');
    });

    it('processes pending tasks when dependencies are satisfied', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);
      service.initializeStackState('main');

      const task1: ExecutionTask = {
        ...baseTask,
        id: 'task-1',
        commitHash: 'abc1234',
      };

      const task2: ExecutionTask = {
        ...baseTask,
        id: 'task-2',
        requires: ['task-1'],
        commitHash: 'def5678',
      };

      // Add task-2 first (will be queued)
      await service.addTaskToStack(task2, '/repo');
      expect(service.isTaskStacked('task-2')).toBe(false);

      // Add task-1 (should trigger task-2 to be processed)
      await service.addTaskToStack(task1, '/repo');

      // Both should now be stacked
      expect(service.isTaskStacked('task-1')).toBe(true);
      expect(service.isTaskStacked('task-2')).toBe(true);
      expect(service.getStackTip()).toBe('chopstack/task-2');
    });

    it('fetches single task commit before creating branch', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);

      await service.addTaskToStack(baseTask, '/repo');

      expect(fetchSingleWorktreeCommitMock).toHaveBeenCalledTimes(1);
      expect(fetchSingleWorktreeCommitMock).toHaveBeenCalledWith(baseTask, undefined, '/repo');
      expect(createBranchFromCommitMock).toHaveBeenCalledWith(
        'chopstack/task-1',
        'abc1234',
        'main',
        '/repo',
      );
    });

    it('skips tasks that are already stacked', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);

      await service.addTaskToStack(baseTask, '/repo');
      expect(createBranchFromCommitMock).toHaveBeenCalledTimes(1);

      // Try to add the same task again
      await service.addTaskToStack(baseTask, '/repo');

      // Should not create branch again
      expect(createBranchFromCommitMock).toHaveBeenCalledTimes(1);
    });

    it('skips tasks without commit hash', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);
      const taskWithoutCommit = { ...baseTask, commitHash: undefined };

      await service.addTaskToStack(taskWithoutCommit, '/repo');

      expect(fetchSingleWorktreeCommitMock).not.toHaveBeenCalled();
      expect(createBranchFromCommitMock).not.toHaveBeenCalled();
      expect(service.isTaskStacked('task-1')).toBe(false);
    });

    it('emits branch_created events', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);
      const eventSpy = vi.fn();
      service.on('branch_created', eventSpy);

      await service.addTaskToStack(baseTask, '/repo');

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'branch_created',
          branchName: 'chopstack/task-1',
          taskId: 'task-1',
          timestamp: expect.any(Date),
        }),
      );
    });

    it('retries on transient failures', async () => {
      const service = new StackBuildServiceImpl({
        ...defaultConfig,
        retryConfig: {
          maxRetries: 3,
          retryDelayMs: 10,
        },
      });

      // First two attempts fail with retryable error, third succeeds
      createBranchFromCommitMock
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('resource temporarily unavailable'))
        .mockResolvedValueOnce(undefined);

      await service.addTaskToStack(baseTask, '/repo');

      expect(createBranchFromCommitMock).toHaveBeenCalledTimes(3);
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('falls back to cherry-pick after max retries', async () => {
      const service = new StackBuildServiceImpl({
        ...defaultConfig,
        retryConfig: {
          maxRetries: 2,
          retryDelayMs: 10,
        },
      });

      // All attempts fail with retryable error
      createBranchFromCommitMock.mockRejectedValue(new Error('timeout'));

      await service.addTaskToStack(baseTask, '/repo');

      expect(createBranchFromCommitMock).toHaveBeenCalledTimes(2);
      expect(execaMock).toHaveBeenCalled(); // Fallback to cherry-pick
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('does not retry non-retryable errors', async () => {
      const service = new StackBuildServiceImpl({
        ...defaultConfig,
        retryConfig: {
          maxRetries: 3,
          retryDelayMs: 10,
        },
      });

      // Non-retryable error
      createBranchFromCommitMock.mockRejectedValueOnce(new Error('conflict detected'));

      await service.addTaskToStack(baseTask, '/repo');

      expect(createBranchFromCommitMock).toHaveBeenCalledTimes(1); // No retries
      expect(execaMock).toHaveBeenCalled(); // Immediate fallback
      expect(service.isTaskStacked('task-1')).toBe(true);
    });

    it('maintains correct stack order with multiple tasks', async () => {
      const service = new StackBuildServiceImpl(defaultConfig);
      service.initializeStackState('main');

      const task1 = { ...baseTask, id: 'task-1', commitHash: 'aaa111' };
      const task2 = { ...baseTask, id: 'task-2', commitHash: 'bbb222', requires: ['task-1'] };
      const task3 = { ...baseTask, id: 'task-3', commitHash: 'ccc333', requires: ['task-2'] };

      // Add in order
      await service.addTaskToStack(task1, '/repo');
      expect(service.getStackTip()).toBe('chopstack/task-1');

      await service.addTaskToStack(task2, '/repo');
      expect(service.getStackTip()).toBe('chopstack/task-2');

      await service.addTaskToStack(task3, '/repo');
      expect(service.getStackTip()).toBe('chopstack/task-3');

      // Verify branches were created with correct parents
      expect(createBranchFromCommitMock).toHaveBeenNthCalledWith(
        1,
        'chopstack/task-1',
        'aaa111',
        'main',
        '/repo',
      );
      expect(createBranchFromCommitMock).toHaveBeenNthCalledWith(
        2,
        'chopstack/task-2',
        'bbb222',
        'chopstack/task-1',
        '/repo',
      );
      expect(createBranchFromCommitMock).toHaveBeenNthCalledWith(
        3,
        'chopstack/task-3',
        'ccc333',
        'chopstack/task-2',
        '/repo',
      );
    });
  });
});
