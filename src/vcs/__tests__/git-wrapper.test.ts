import type { SimpleGit } from 'simple-git';

import { vi } from 'vitest';

const simpleGitState = vi.hoisted(() => ({
  instance: {} as unknown,
  factory: vi.fn(() => simpleGitState.instance),
}));

vi.mock('simple-git', () => ({
  default: simpleGitState.factory,
}));

const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
type GitWrapperType = InstanceType<typeof GitWrapper>;

let wrapper: GitWrapperType;
let raw: ReturnType<typeof vi.fn>;
let status: ReturnType<typeof vi.fn>;
let add: ReturnType<typeof vi.fn>;
let commit: ReturnType<typeof vi.fn>;
let revparse: ReturnType<typeof vi.fn>;

beforeEach(() => {
  raw = vi.fn();
  status = vi.fn();
  add = vi.fn();
  commit = vi.fn();
  revparse = vi.fn();

  simpleGitState.instance = {
    raw,
    status,
    add,
    commit,
    revparse,
  } as unknown as SimpleGit;

  simpleGitState.factory.mockReturnValue(simpleGitState.instance);

  status.mockResolvedValue({ staged: ['file.txt'], modified: [], deleted: [] });
  revparse.mockResolvedValue('abc123');

  wrapper = Object.create(GitWrapper.prototype);
  (wrapper as unknown as { gitClient: SimpleGit }).gitClient = simpleGitState.instance as SimpleGit;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GitWrapper', () => {
  it('adds files by delegating to simple-git', async () => {
    await wrapper.add(['a.ts']);
    expect(add).toHaveBeenCalledWith(['a.ts']);
  });

  it('commits when staged changes exist', async () => {
    commit.mockResolvedValue('hash');
    revparse.mockResolvedValue('hash');

    const result = await wrapper.commit('Add file');

    expect(commit).toHaveBeenCalledWith('Add file');
    expect(result).toBe('hash');
  });

  it('throws when attempting to commit without staged changes', async () => {
    status.mockResolvedValue({ staged: [], modified: [], deleted: [] });

    await expect(wrapper.commit('Empty')).rejects.toThrow('No changes to commit');
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns parsed status information', async () => {
    status.mockResolvedValue({ staged: ['a.ts'], modified: ['b.ts'], deleted: [] });

    const result = await wrapper.status();

    expect(result).toEqual({ added: ['a.ts'], modified: ['b.ts'], deleted: [] });
  });

  it('parses worktree list output correctly', async () => {
    raw.mockResolvedValue(
      'worktree /tmp/repo\nHEAD 123\nbranch refs/heads/main\n\nworktree /tmp/repo2\nHEAD 456\nbranch refs/heads/feature\n',
    );

    const result = await wrapper.listWorktrees();

    expect(raw).toHaveBeenCalledWith(['worktree', 'list', '--porcelain']);
    expect(result).toEqual([
      { path: '/tmp/repo', head: '123', branch: 'main' },
      { path: '/tmp/repo2', head: '456', branch: 'feature' },
    ]);
  });

  it('removes worktrees with force when requested', async () => {
    await wrapper.removeWorktree('/tmp/repo2', true);
    expect(raw).toHaveBeenCalledWith(['worktree', 'remove', '--force', '/tmp/repo2']);
  });
});
