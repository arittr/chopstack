/**
 * Merge-commit VCS backend implementation
 *
 * Simple merge workflow without parent tracking or stacking.
 * Requires only git (no additional tools).
 */

import type {
  CommitOptionsGeneric,
  CreateBranchOptions,
  SubmitOptions,
  VcsBackend,
} from '@/core/vcs/interfaces';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';

/**
 * Error class for merge-commit backend operations
 */
export class MergeCommitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'MergeCommitError';
  }
}

/**
 * Merge-commit VCS backend
 *
 * Implements simple merge-based workflow:
 * - Branches created from base reference
 * - No parent/child tracking
 * - Merge with --no-ff for integration
 * - PR submission via GitHub/GitLab API (stub for now)
 */
export class MergeCommitBackend implements VcsBackend {
  private _git?: GitWrapper;

  constructor(private readonly _workdir: string) {}

  /**
   * Check if git is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const git = new GitWrapper(this._workdir);
      await git.git.version();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the backend
   *
   * For merge-commit, this is a no-op since standard git is all we need
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(workdir: string, trunk?: string): Promise<void> {
    this._git = new GitWrapper(workdir);
    logger.debug('MergeCommitBackend initialized', { workdir, trunk });
  }

  /**
   * Create a branch from base reference
   *
   * Uses options.base or options.parent as the starting point.
   * Ignores track option (no stacking support).
   */
  async createBranch(
    branchName: string,
    options: CreateBranchOptions,
    workdir: string,
  ): Promise<void> {
    const git = this._getGit(workdir);
    const baseRef = options.base ?? options.parent ?? 'HEAD';

    try {
      logger.info(`Creating branch ${branchName} from ${baseRef}`);
      await git.git.checkoutBranch(branchName, baseRef);
      logger.info(`✅ Created branch ${branchName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(
        `Failed to create branch ${branchName} from ${baseRef}`,
        `git checkout -b ${branchName} ${baseRef}`,
        errorMessage,
      );
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string, workdir: string): Promise<void> {
    const git = this._getGit(workdir);

    try {
      logger.info(`Deleting branch ${branchName}`);
      await git.git.deleteLocalBranch(branchName, true);
      logger.info(`✅ Deleted branch ${branchName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(
        `Failed to delete branch ${branchName}`,
        `git branch -D ${branchName}`,
        errorMessage,
      );
    }
  }

  /**
   * Commit changes with standard git
   */
  async commit(message: string, workdir: string, options?: CommitOptionsGeneric): Promise<string> {
    const git = this._getGit(workdir);

    try {
      // Stage files
      await (options?.files !== undefined && options.files.length > 0
        ? git.git.add(options.files)
        : git.git.add('.'));

      // Commit
      const commitOptions: Record<string, null> = {};
      if (options?.allowEmpty === true) {
        commitOptions['--allow-empty'] = null;
      }

      const result = await git.git.commit(message, commitOptions);
      const commitHash = result.commit;

      logger.info(`✅ Committed: ${commitHash.slice(0, 7)}`);
      return commitHash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(
        `Failed to commit changes`,
        `git commit -m "${message}"`,
        errorMessage,
      );
    }
  }

  /**
   * Submit branches for review (stub)
   *
   * TODO: Implement PR creation via GitHub/GitLab API
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async submit(options: SubmitOptions, _workdir: string): Promise<string[]> {
    logger.warn('PR creation not implemented for merge-commit mode');
    logger.info('Branches ready for manual PR creation:', { branches: options.branches });
    return [];
  }

  /**
   * Check for merge conflicts
   */
  async hasConflicts(workdir: string): Promise<boolean> {
    const git = this._getGit(workdir);

    try {
      const status = await git.git.status();
      return status.conflicted.length > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(`Failed to check for conflicts`, `git status`, errorMessage);
    }
  }

  /**
   * Get list of conflicted files
   */
  async getConflictedFiles(workdir: string): Promise<string[]> {
    const git = this._getGit(workdir);

    try {
      const status = await git.git.status();
      return status.conflicted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(`Failed to get conflicted files`, `git status`, errorMessage);
    }
  }

  /**
   * Abort current merge operation
   */
  async abortMerge(workdir: string): Promise<void> {
    const git = this._getGit(workdir);

    try {
      await git.git.raw(['merge', '--abort']);
      logger.info('✅ Aborted merge');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MergeCommitError(`Failed to abort merge`, `git merge --abort`, errorMessage);
    }
  }

  /**
   * Get GitWrapper instance for a working directory
   */
  private _getGit(workdir: string): GitWrapper {
    if (this._git !== undefined && this._workdir === workdir) {
      return this._git;
    }
    return new GitWrapper(workdir);
  }
}
