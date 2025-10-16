/**
 * Sapling VCS backend (stub implementation)
 *
 * This is a placeholder for future Sapling support.
 *
 * IMPORTANT: Sapling is incompatible with git worktrees!
 * Sapling uses a different model (bookmarks) that doesn't support git worktrees.
 * Any implementation would require a different isolation strategy.
 *
 * TODO: Implement Sapling backend with alternative isolation strategy
 * Estimated complexity: L (1000+ lines, 8-12 days)
 * Migration path: Requires architecture changes for non-worktree isolation
 *
 * Implementation notes:
 * - Use `sl` CLI via execa
 * - Sapling uses "bookmarks" instead of branches
 * - Cannot use git worktrees (fundamental incompatibility)
 * - Alternative isolation strategies:
 *   1. Clone-based: Create lightweight clones for each task
 *   2. Amend-based: Use sl amend + sl hide for task isolation
 *   3. Diff-based: Export diffs and apply sequentially
 * - Commands to implement:
 *   - sl bookmark: Create bookmark (similar to branch)
 *   - sl commit: Create commit
 *   - sl rebase: Rebase bookmark stack
 *   - sl pr submit: Submit for review
 *   - sl status: Check working directory status
 *
 * Resources:
 * - Sapling docs: https://sapling-scm.com/docs/introduction/getting-started
 * - Bookmark docs: https://sapling-scm.com/docs/introduction/using-bookmarks
 * - Worktree incompatibility: https://github.com/facebook/sapling/issues/123
 *
 * Migration path:
 * 1. Design non-worktree isolation strategy
 * 2. Update VcsStrategy interface to support multiple isolation modes
 * 3. Implement SaplingBackend with chosen isolation strategy
 * 4. Add comprehensive tests with real sl installation
 * 5. Document migration from git-based workflows
 */

import type {
  CommitOptionsGeneric,
  CreateBranchOptions,
  SubmitOptions,
  VcsBackend,
} from '@/core/vcs/interfaces';

import { logger } from '@/utils/global-logger';

/**
 * Error thrown when Sapling operations are attempted but not yet implemented
 */
export class NotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `Sapling backend not yet implemented: ${operation}\n\n` +
        `Note: Sapling is incompatible with git worktrees.\n` +
        `Implementation requires architecture changes for alternative isolation.\n\n` +
        `Please use git-spice or merge-commit mode instead:\n` +
        `  vcs:\n` +
        `    mode: git-spice  # or merge-commit\n\n` +
        `Install git-spice: brew install abhinav/git-spice/git-spice`,
    );
    this.name = 'NotImplementedError';
  }
}

/**
 * Sapling VCS backend (stub)
 *
 * Sapling is Facebook's VCS that uses bookmarks instead of branches.
 * It is fundamentally incompatible with git worktrees, requiring
 * a different isolation strategy for parallel execution.
 *
 * This implementation is a stub that throws NotImplementedError for all operations.
 * See implementation notes in file header for migration path and architecture changes needed.
 */
export class SaplingBackend implements VcsBackend {
  constructor(private readonly _workdir: string) {}

  /**
   * Check if Sapling CLI (sl) is available
   *
   * TODO: Implement by checking for `sl` binary in PATH
   * Command: `sl --version`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async isAvailable(): Promise<boolean> {
    logger.warn('SaplingBackend not yet implemented (incompatible with worktrees)');
    return false;
  }

  /**
   * Initialize Sapling in repository
   *
   * TODO: Implement repository initialization
   * Command: `sl init` (converts git repo to sapling)
   * Note: This is destructive - may need user confirmation
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(_workdir: string, _trunk?: string): Promise<void> {
    throw new NotImplementedError('initialize');
  }

  /**
   * Create bookmark (Sapling's equivalent of branch)
   *
   * TODO: Implement bookmark creation
   * Command: `sl bookmark ${bookmarkName}`
   * Note: Bookmarks in Sapling work differently than git branches
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createBranch(
    _branchName: string,
    _options: CreateBranchOptions,
    _workdir: string,
  ): Promise<void> {
    throw new NotImplementedError('createBranch (bookmark)');
  }

  /**
   * Delete bookmark
   *
   * TODO: Implement bookmark deletion
   * Command: `sl bookmark --delete ${bookmarkName}`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async deleteBranch(_branchName: string, _workdir: string): Promise<void> {
    throw new NotImplementedError('deleteBranch (bookmark)');
  }

  /**
   * Commit changes
   *
   * TODO: Implement commit creation
   * Command: `sl commit -m "${message}"`
   * Note: Sapling commits work differently (auto-rebase on amend)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async commit(
    _message: string,
    _workdir: string,
    _options?: CommitOptionsGeneric,
  ): Promise<string> {
    throw new NotImplementedError('commit');
  }

  /**
   * Submit stack for review
   *
   * TODO: Implement PR submission
   * Command: `sl pr submit`
   * Note: Sapling has built-in PR workflow
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async submit(_options: SubmitOptions, _workdir: string): Promise<string[]> {
    throw new NotImplementedError('submit');
  }

  /**
   * Check for merge conflicts
   *
   * TODO: Implement conflict detection
   * Command: `sl status` (check for unresolved conflicts)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async hasConflicts(_workdir: string): Promise<boolean> {
    throw new NotImplementedError('hasConflicts');
  }

  /**
   * Get list of conflicted files
   *
   * TODO: Implement
   * Command: `sl status` (parse conflict markers)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getConflictedFiles(_workdir: string): Promise<string[]> {
    throw new NotImplementedError('getConflictedFiles');
  }

  /**
   * Abort current merge/rebase operation
   *
   * TODO: Implement
   * Command: `sl rebase --abort` or `sl continue --clean`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async abortMerge(_workdir: string): Promise<void> {
    throw new NotImplementedError('abortMerge');
  }
}
