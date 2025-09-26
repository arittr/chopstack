import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorktreeCreateOptions } from '@/core/vcs/domain-services';

import { WorktreeServiceImpl } from '@/services/vcs/worktree-service';

const { mkdirMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
}));

const { branchExistsMock, createWorktreeMock, gitWrapperMock } = vi.hoisted(() => {
  const branchExists = vi.fn();
  const createWorktree = vi.fn();
  const GitWrapper = vi.fn().mockImplementation(() => ({
    branchExists,
    createWorktree,
  }));
  return {
    branchExistsMock: branchExists,
    createWorktreeMock: createWorktree,
    gitWrapperMock: GitWrapper,
  };
});

vi.mock('@/adapters/vcs/git-wrapper', () => ({
  GitWrapper: gitWrapperMock,
}));

const createOptions = (overrides: Partial<WorktreeCreateOptions> = {}): WorktreeCreateOptions => ({
  taskId: 'task-123',
  branchName: 'chopstack/task-123',
  worktreePath: '.chopstack/shadows/task-123',
  baseRef: 'origin/main',
  workdir: '/repo',
  ...overrides,
});

describe('WorktreeServiceImpl', () => {
  beforeEach(() => {
    mkdirMock.mockClear();
    branchExistsMock.mockReset();
    createWorktreeMock.mockReset();
    gitWrapperMock.mockClear();
    branchExistsMock.mockResolvedValue(false);
  });

  it('passes the base ref to git worktree add as checkout source', async () => {
    const service = new WorktreeServiceImpl({
      branchPrefix: 'chopstack/',
      cleanupOnFailure: true,
      cleanupOnSuccess: true,
      shadowPath: '.chopstack/shadows',
    });

    await service.createWorktree(createOptions());

    expect(createWorktreeMock).toHaveBeenCalledTimes(1);
    expect(createWorktreeMock).toHaveBeenCalledWith(
      '/repo/.chopstack/shadows/task-123',
      'origin/main',
      'chopstack/task-123',
    );
  });
});
