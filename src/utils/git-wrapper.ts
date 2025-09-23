import simpleGit, { type SimpleGit } from 'simple-git';

export type GitStatus = {
  added: string[];
  deleted: string[];
  modified: string[];
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
  private readonly git: SimpleGit;

  constructor(private readonly _workdir: string) {
    this.git = simpleGit(_workdir);
  }

  /**
   * Add files to git staging area
   */
  async add(files: string[] | string): Promise<void> {
    await this.git.add(files);
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

    await this.git.commit(message);
    const result = await this.git.revparse(['HEAD']);
    return result;
  }

  /**
   * Get git status information
   */
  async status(): Promise<GitStatus> {
    const status = await this.git.status();
    return {
      added: status.staged,
      modified: status.modified,
      deleted: status.deleted,
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
    return this.git.revparse(['HEAD']);
  }

  /**
   * Check out a branch
   */
  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  /**
   * Create a new branch and check it out
   */
  async createBranch(name: string, from?: string): Promise<void> {
    await (from !== undefined
      ? this.git.checkoutBranch(name, from)
      : this.git.checkoutLocalBranch(name));
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
    await this.git.raw(args);
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
    await this.git.raw(args);
  }

  /**
   * List all worktrees (uses raw git command)
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.git.raw(['worktree', 'list', '--porcelain']);
    return this._parseWorktreeList(output);
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
    const result = await this.git.raw(['branch', '--contains', commitHash]);
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
