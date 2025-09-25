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

const { fetchWorktreeCommitsMock } = vi.hoisted(() => {
  const mock = vi.fn().mockResolvedValue(undefined);
  return { fetchWorktreeCommitsMock: mock };
});

vi.mock('@/adapters/vcs/git-spice/worktree-sync', () => ({
  fetchWorktreeCommits: fetchWorktreeCommitsMock,
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
});
