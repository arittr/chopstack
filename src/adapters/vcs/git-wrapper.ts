import simpleGit, { type SimpleGit } from 'simple-git';

import { isNonNullish } from '@/validation/guards';

export type GitStatus = {
  added: string[];
  // Properties used by conflict resolution service
  conflicted?: string[];
  // Properties used by repository service
  current?: string;
  deleted: string[];
  isClean?: boolean;
  modified: string[];
  notAdded?: string[];
  staged?: string[];
  untracked: string[];
};

export type WorktreeInfo = {
  branch?: string;
  head?: string;
  path: string;
};

/**
 * GitWrapper provides a typed interface for git operations using simple-git
 * with fallback to raw commands for advanced operations like worktrees
 */
export class GitWrapper {
  private readonly gitClient: SimpleGit;

  constructor(private readonly _workdir: string) {
    this.gitClient = simpleGit(_workdir);
  }

  /**
   * Access to underlying simple-git instance for advanced operations
   */
  get git(): SimpleGit {
    return this.gitClient;
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.gitClient.init();
  }

  /**
   * Set git config values
   */
  async config(key: string, value: string): Promise<void> {
    await this.gitClient.addConfig(key, value);
  }

  /**
   * Get list of branches
   */
  async branch(): Promise<string[]> {
    const branches = await this.gitClient.branch();
    return branches.all;
  }

  /**
   * Add files to git staging area
   */
  async add(files: string[] | string): Promise<void> {
    await this.gitClient.add(files);
  }

  /**
   * Commit staged changes and return commit hash
   */
  async commit(message: string): Promise<string> {
    // Check if there are staged changes to commit
    const hasChanges = await this.hasChangesToCommit();
    if (!hasChanges) {
      throw new Error('No changes to commit');
    }

    await this.gitClient.commit(message);
    const result = await this.gitClient.revparse(['HEAD']);
    return result;
  }

  /**
   * Get git status information
   */
  async status(): Promise<GitStatus> {
    const status = await this.gitClient.status();
    return {
      added: status.staged,
      modified: status.modified,
      deleted: status.deleted,
      untracked: status.not_added,
      // Additional properties for compatibility
      conflicted: status.conflicted,
      current: status.current ?? '',
      isClean: status.isClean(),
      staged: status.staged,
      notAdded: status.not_added,
    };
  }

  /**
   * Check if there are staged changes ready to commit
   */
  async hasChangesToCommit(): Promise<boolean> {
    const status = await this.status();
    return status.added.length > 0 || status.modified.length > 0 || status.deleted.length > 0;
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit(): Promise<string> {
    return this.gitClient.revparse(['HEAD']);
  }

  /**
   * Check out a branch
   */
  async checkout(branch: string): Promise<void> {
    await this.gitClient.checkout(branch);
  }

  /**
   * Create a new branch and check it out
   */
  async createBranch(name: string, from?: string): Promise<void> {
    await (from !== undefined
      ? this.gitClient.checkoutBranch(name, from)
      : this.gitClient.checkoutLocalBranch(name));
  }

  /**
   * Create a worktree (uses raw git command as simple-git doesn't support worktrees)
   */
  async createWorktree(path: string, ref: string, branch?: string): Promise<void> {
    const args = ['worktree', 'add'];
    if (branch !== undefined) {
      args.push('-b', branch);
    }
    args.push(path, ref);
    await this.gitClient.raw(args);
  }

  /**
   * Remove a worktree (uses raw git command)
   */
  async removeWorktree(path: string, force = false): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push(path);
    await this.gitClient.raw(args);
  }

  /**
   * List all worktrees (uses raw git command)
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.gitClient.raw(['worktree', 'list', '--porcelain']);
    return this._parseWorktreeList(output);
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this.gitClient.status();
    return status.current ?? 'main';
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    const branches = await this.branch();
    return branches.includes(branchName);
  }

  /**
   * Check out a local branch (creates if doesn't exist)
   */
  async checkoutLocalBranch(branchName: string): Promise<void> {
    await this.gitClient.checkoutLocalBranch(branchName);
  }

  /**
   * Merge one branch into another
   */
  async mergeFromTo(
    sourceBranch: string,
    _targetBranch: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const mergeOptions = isNonNullish(options) ? Object.keys(options) : [];
    await this.gitClient.merge([sourceBranch, ...mergeOptions]);
  }

  /**
   * Reset working directory to a specific state
   */
  async reset(options: string[]): Promise<void> {
    await this.gitClient.raw(['reset', ...options]);
  }

  /**
   * Access to raw git commands
   */
  async raw(args: string[]): Promise<string> {
    return this.gitClient.raw(args);
  }

  /**
   * Cherry-pick a commit (uses raw git command for better control)
   */
  async cherryPick(commitHash: string): Promise<void> {
    await this.git.raw(['cherry-pick', commitHash]);
  }

  /**
   * Get branches containing a specific commit
   */
  async getBranchesContaining(commitHash: string): Promise<string[]> {
    const result = await this.gitClient.raw(['branch', '--contains', commitHash]);
    return result
      .split('\n')
      .map((line) => line.trim().replace(/^\*\s*/, ''))
      .filter((line) => line.length > 0);
  }

  /**
   * Parse git worktree list --porcelain output
   */
  private _parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const lines = output.split('\n');
    let current: { branch?: string; head?: string; path?: string } = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path !== undefined) {
          worktrees.push(current as WorktreeInfo);
        }
        current = { path: line.replace('worktree ', '') };
      } else if (line.startsWith('branch ')) {
        current.branch = line.replace('branch refs/heads/', '');
      } else if (line.startsWith('HEAD ')) {
        current.head = line.replace('HEAD ', '');
      }
    }

    if (current.path !== undefined) {
      worktrees.push(current as WorktreeInfo);
    }

    return worktrees;
  }
}
