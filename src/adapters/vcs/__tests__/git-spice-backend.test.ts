import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitSpiceBackend } from '../git-spice/backend';

const execaMock = vi.hoisted(() => vi.fn());

vi.mock('execa', () => ({
  execa: execaMock,
}));

type SimpleGitStub = {
  branch: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
  checkoutBranch: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  revparse: ReturnType<typeof vi.fn>;
};

class GitWrapperStub {
  public readonly git: SimpleGitStub;

  constructor(readonly workdir: string) {
    this.git = {
      branch: vi.fn(() => ({ all: [] })),
      checkout: vi.fn(() => {}),
      checkoutBranch: vi.fn(() => {}),
      raw: vi.fn(() => ''),
      revparse: vi.fn((args: string[]) => {
        if (args[0] === '.git') {
          return `${this.workdir}/.git`;
        }
        if (args[0] === '--abbrev-ref') {
          return 'chopstack/task-a';
        }
        return 'HEAD';
      }),
    } satisfies SimpleGitStub;
  }
}

const gitWrapperInstances = vi.hoisted(() => [] as GitWrapperStub[]);

vi.mock('@/adapters/vcs/git-wrapper', () => ({
  GitWrapper: vi.fn((workdir: string) => {
    const instance = new GitWrapperStub(workdir);
    gitWrapperInstances.push(instance);
    return instance;
  }),
}));

describe('GitSpiceBackend.createBranchFromCommit', () => {
  beforeEach(() => {
    execaMock.mockReset();
    gitWrapperInstances.length = 0;
    execaMock.mockResolvedValue({ stdout: '' });
  });

  it('tracks the branch with git-spice even when running in the main repo', async () => {
    const backend = new GitSpiceBackend();

    await backend.createBranchFromCommit('chopstack/task-a', 'abc1234', 'main', '/repo');

    expect(execaMock).toHaveBeenCalledWith(
      'gs',
      ['branch', 'track', 'chopstack/task-a', '--base', 'main'],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });

  it('restacks using gs upstack restack', async () => {
    const backend = new GitSpiceBackend();

    await backend.restack('/repo');

    expect(execaMock).toHaveBeenCalledWith(
      'gs',
      ['upstack', 'restack'],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });
});
