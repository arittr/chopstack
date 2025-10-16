/**
 * Graphite VCS backend (stub implementation)
 *
 * This is a placeholder for future Graphite support.
 * Graphite provides stacking workflows similar to git-spice.
 *
 * TODO: Implement Graphite backend
 * Estimated complexity: M (600-800 lines, 4-6 days)
 * Reusability: 70% from git-spice patterns
 *
 * Implementation notes:
 * - Use `gt` CLI via execa (similar to GitSpiceBackend pattern)
 * - Commands to implement:
 *   - gt branch create: Create branch with parent tracking
 *   - gt commit create: Create commit in stack
 *   - gt restack: Restack branches after changes
 *   - gt stack submit: Submit stack as PRs
 *   - gt stack info: Get current stack structure
 * - Follow GitSpiceBackend error handling patterns
 * - Use GitWrapper for underlying git operations
 *
 * Resources:
 * - Graphite CLI docs: https://graphite.dev/docs/graphite-cli
 * - API reference: https://graphite.dev/docs/cli/commands
 *
 * @see GitSpiceBackend for implementation patterns
 */

import type {
  CommitOptionsGeneric,
  CreateBranchOptions,
  SubmitOptions,
  VcsBackend,
} from '@/core/vcs/interfaces';

import { logger } from '@/utils/global-logger';

/**
 * Error thrown when Graphite operations are attempted but not yet implemented
 */
export class NotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `Graphite backend not yet implemented: ${operation}\n\n` +
        `Please use git-spice or merge-commit mode instead.\n` +
        `To switch modes, update ~/.chopstack/config.yaml:\n` +
        `  vcs:\n` +
        `    mode: git-spice  # or merge-commit\n\n` +
        `Install git-spice: brew install abhinav/git-spice/git-spice`,
    );
    this.name = 'NotImplementedError';
  }
}

/**
 * Graphite VCS backend (stub)
 *
 * Graphite provides stacking workflows similar to git-spice but with
 * different CLI commands and workflow patterns.
 *
 * This implementation is a stub that throws NotImplementedError for all operations.
 * See implementation notes in file header for future implementation guidance.
 */
export class GraphiteBackend implements VcsBackend {
  constructor(private readonly _workdir: string) {}

  /**
   * Check if Graphite CLI (gt) is available
   *
   * TODO: Implement by checking for `gt` binary in PATH
   * Command: `gt --version`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async isAvailable(): Promise<boolean> {
    logger.warn('GraphiteBackend not yet implemented');
    return false;
  }

  /**
   * Initialize Graphite in repository
   *
   * TODO: Implement repository initialization
   * Command: `gt repo init --trunk ${trunk}`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(_workdir: string, _trunk?: string): Promise<void> {
    throw new NotImplementedError('initialize');
  }

  /**
   * Create branch with parent tracking
   *
   * TODO: Implement branch creation
   * Commands:
   *   - gt branch create ${branchName} --parent ${parent}
   *   - gt branch create ${branchName} --base ${base}
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createBranch(
    _branchName: string,
    _options: CreateBranchOptions,
    _workdir: string,
  ): Promise<void> {
    throw new NotImplementedError('createBranch');
  }

  /**
   * Delete branch
   *
   * TODO: Implement branch deletion
   * Command: `gt branch delete ${branchName}`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async deleteBranch(_branchName: string, _workdir: string): Promise<void> {
    throw new NotImplementedError('deleteBranch');
  }

  /**
   * Commit changes in stack-aware way
   *
   * TODO: Implement commit creation
   * Command: `gt commit create -m "${message}"`
   * Options: --no-edit, --allow-empty
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
   * Track existing branch in stack
   *
   * TODO: Implement branch tracking
   * Command: `gt branch track ${branchName} --parent ${parent}`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async trackBranch(_branchName: string, _parent: string, _workdir: string): Promise<void> {
    throw new NotImplementedError('trackBranch');
  }

  /**
   * Restack branches to maintain proper relationships
   *
   * TODO: Implement restacking
   * Command: `gt restack`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async restack(_workdir: string): Promise<void> {
    throw new NotImplementedError('restack');
  }

  /**
   * Get current stack information
   *
   * TODO: Implement stack info retrieval
   * Command: `gt stack info --json`
   * Parse JSON output to return stack structure
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getStackInfo(_workdir: string): Promise<unknown> {
    throw new NotImplementedError('getStackInfo');
  }

  /**
   * Submit stack for review (create PRs)
   *
   * TODO: Implement stack submission
   * Command: `gt stack submit [--draft] [--no-edit]`
   * Parse output to extract PR URLs
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async submit(_options: SubmitOptions, _workdir: string): Promise<string[]> {
    throw new NotImplementedError('submit');
  }

  /**
   * Check for merge conflicts
   *
   * TODO: Implement conflict detection
   * Use GitWrapper to check git status for conflicts
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async hasConflicts(_workdir: string): Promise<boolean> {
    throw new NotImplementedError('hasConflicts');
  }

  /**
   * Get list of conflicted files
   *
   * TODO: Implement
   * Use GitWrapper to get conflicted files from git status
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getConflictedFiles(_workdir: string): Promise<string[]> {
    throw new NotImplementedError('getConflictedFiles');
  }

  /**
   * Abort current merge operation
   *
   * TODO: Implement
   * Use GitWrapper to run `git merge --abort`
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async abortMerge(_workdir: string): Promise<void> {
    throw new NotImplementedError('abortMerge');
  }
}
