import type { ExecutionTask } from '@/core/execution/types';
import type { CommitOptions, WorktreeContext } from '@/core/vcs/domain-services';

/**
 * Stack information returned by VCS backends
 * Generic type that can represent git-spice, graphite, or other stacking systems
 */
export type StackInfo = {
  baseBranch?: string;
  branches?: StackBranch[];
  name?: string;
};

/**
 * Branch information in a stack
 */
export type StackBranch = {
  current: boolean;
  hasChanges: boolean;
  name: string;
  parent?: string;
  pullRequest?: PullRequest;
};

/**
 * Pull request information
 */
export type PullRequest = {
  branch: string;
  id: string;
  status: 'open' | 'closed' | 'merged';
  title: string;
  url: string;
};

/**
 * Options for branch creation
 * Supports both stacking workflows (parent tracking) and simple workflows
 */
export type CreateBranchOptions = {
  /**
   * Base reference to create branch from (e.g., 'main', 'HEAD', commit hash)
   * Used for merge-commit workflows and as fallback for stacking workflows
   */
  base?: string;

  /**
   * Parent branch for stacking workflows (git-spice, graphite)
   * If provided, backend may track parent-child relationship
   */
  parent?: string;

  /**
   * Whether to track parent-child relationship for stacking
   * Only used by stacking backends (git-spice, graphite)
   */
  track?: boolean;
};

/**
 * Options for commit operations
 * Generalizes commit behavior across different VCS backends
 */
export type CommitOptionsGeneric = {
  /**
   * Allow empty commits (useful for testing or marking milestones)
   */
  allowEmpty?: boolean;

  /**
   * Specific files to stage (default: all changes)
   */
  files?: string[];

  /**
   * Skip automatic restacking after commit (git-spice, graphite)
   * Default: false (will restack if backend supports it)
   */
  noRestack?: boolean;
};

/**
 * Options for stack submission (PR creation)
 */
export type SubmitOptions = {
  /**
   * Enable auto-merge when checks pass
   */
  autoMerge?: boolean;

  /**
   * Branches to submit for review
   * For stacking backends, submits entire stack
   * For merge-commit, submits individual branches
   */
  branches: string[];

  /**
   * Create draft PRs
   */
  draft?: boolean;

  /**
   * Additional backend-specific arguments
   */
  extraArgs?: string[];
};

/**
 * VCS Backend interface for version control system implementations
 *
 * This interface abstracts VCS operations to support multiple backends:
 * - git-spice: Stacking workflow with parent tracking
 * - merge-commit: Simple git workflow without stacking
 * - graphite: Alternative stacking workflow
 * - sapling: Facebook's VCS (future support)
 *
 * Design principles:
 * - Core methods are required and generic (work for all backends)
 * - Stacking-specific methods are optional (trackBranch?, restack?, getStackInfo?)
 * - Backends should fail gracefully for unsupported operations
 */
export type VcsBackend = {
  /**
   * Abort the current merge operation
   *
   * Resets repository to pre-merge state when conflicts cannot be resolved.
   *
   * @param workdir - Working directory
   *
   * @example
   * // Abort merge and return to clean state
   * await backend.abortMerge('/path/to/repo');
   */
  abortMerge?(workdir: string): Promise<void>;

  /**
   * Commit changes with optional file staging
   *
   * This method is generalized to work with all backends:
   * - For stacking backends: May trigger automatic restacking (unless noRestack=true)
   * - For merge-commit: Standard git commit
   *
   * @param message - Commit message
   * @param workdir - Working directory
   * @param options - Commit options (files, allowEmpty, noRestack)
   * @returns Commit hash
   *
   * @example
   * // Commit all changes
   * const hash = await backend.commit('[task-1] Add feature', '/path/to/repo');
   *
   * @example
   * // Commit specific files without restacking
   * const hash = await backend.commit('[task-2] Update config', '/path/to/repo', {
   *   files: ['config.ts', 'schema.ts'],
   *   noRestack: true
   * });
   */
  commit?(message: string, workdir: string, options?: CommitOptionsGeneric): Promise<string>;

  /**
   * Create a new branch with optional parent tracking
   *
   * This method is generalized to support both stacking and non-stacking workflows:
   * - For stacking backends: Use options.parent for parent tracking
   * - For merge-commit: Use options.base as branch point (ignores parent)
   *
   * @param branchName - Name of branch to create
   * @param options - Branch creation options
   * @param workdir - Working directory
   *
   * @example
   * // Stacking workflow (git-spice)
   * await backend.createBranch('feature-2', {
   *   parent: 'feature-1',
   *   track: true
   * }, '/path/to/repo');
   *
   * @example
   * // Simple workflow (merge-commit)
   * await backend.createBranch('feature-1', {
   *   base: 'main'
   * }, '/path/to/repo');
   */
  createBranch?(branchName: string, options: CreateBranchOptions, workdir: string): Promise<void>;

  /**
   * Delete a branch
   *
   * @param branchName - Name of branch to delete
   * @param workdir - Working directory
   *
   * @example
   * await backend.deleteBranch('feature-1', '/path/to/repo');
   */
  deleteBranch?(branchName: string, workdir: string): Promise<void>;

  /**
   * Get list of files with merge conflicts
   *
   * @param workdir - Working directory
   * @returns Array of file paths with conflicts
   *
   * @example
   * const conflicts = await backend.getConflictedFiles('/path/to/repo');
   * // ['src/app.ts', 'src/config.ts']
   */
  getConflictedFiles?(workdir: string): Promise<string[]>;

  /**
   * Get stack information (stacking backends only)
   *
   * Returns current stack state with branch relationships.
   * Optional method - not all backends support stacking.
   *
   * @param workdir - Working directory
   * @returns Stack info or null if not in a stack (return type is backend-specific)
   *
   * @example
   * // git-spice: Get full stack info
   * const info = await backend.getStackInfo?.('/path/to/repo');
   * console.log(info?.branches.map(b => b.name));
   *
   * @example
   * // merge-commit: Method not available
   * backend.getStackInfo; // undefined
   */
  getStackInfo?(workdir: string): Promise<unknown>;

  /**
   * Check if there are merge conflicts
   *
   * @param workdir - Working directory
   * @returns true if conflicts exist
   *
   * @example
   * if (await backend.hasConflicts('/path/to/repo')) {
   *   const files = await backend.getConflictedFiles('/path/to/repo');
   *   console.log('Conflicts in:', files);
   * }
   */
  hasConflicts?(workdir: string): Promise<boolean>;

  /**
   * Initialize the backend in the repository
   *
   * @param workdir - Working directory (repository root)
   * @param trunk - Main branch name (default: 'main')
   *
   * @example
   * await backend.initialize('/path/to/repo', 'main');
   */
  initialize(workdir: string, trunk?: string): Promise<void>;

  /**
   * Check if the backend is available in the system
   *
   * @returns true if backend binary/tools are installed and accessible
   *
   * @example
   * // git-spice: checks for 'gs' binary
   * // merge-commit: checks for 'git' binary
   * // graphite: checks for 'gt' binary
   */
  isAvailable(): Promise<boolean>;

  /**
   * Restack branches to maintain proper parent relationships (stacking backends only)
   *
   * Rebuilds stack structure after changes, ensuring all branches are properly based.
   * Optional method - not all backends support stacking.
   *
   * @param workdir - Working directory
   *
   * @example
   * // git-spice: Restack all branches
   * await backend.restack?.('/path/to/repo');
   *
   * @example
   * // merge-commit: Method not available
   * backend.restack; // undefined
   */
  restack?(workdir: string): Promise<void>;

  /**
   * Submit branches for review (create pull requests)
   *
   * Behavior varies by backend:
   * - git-spice: Creates stacked PRs with dependencies
   * - merge-commit: Creates independent PRs via GitHub/GitLab API
   * - graphite: Creates stacked PRs via Graphite API
   *
   * @param options - Submit options (branches, draft, autoMerge)
   * @param workdir - Working directory
   * @returns Array of PR URLs
   *
   * @example
   * // Submit stack (git-spice)
   * const urls = await backend.submit({
   *   branches: ['feature-1', 'feature-2'],
   *   draft: true
   * }, '/path/to/repo');
   *
   * @example
   * // Submit individual branches (merge-commit)
   * const urls = await backend.submit({
   *   branches: ['feature-1'],
   *   autoMerge: true
   * }, '/path/to/repo');
   */
  submit?(options: SubmitOptions, workdir: string): Promise<string[]>;

  /**
   * Track a branch with parent relationship (stacking backends only)
   *
   * Used to integrate branches created outside the VCS backend into the stack.
   * Optional method - not all backends support stacking.
   *
   * @param branchName - Branch to track
   * @param parent - Parent branch in stack
   * @param workdir - Working directory
   *
   * @example
   * // git-spice: Track existing branch in stack
   * await backend.trackBranch?.('feature-2', 'feature-1', '/path/to/repo');
   *
   * @example
   * // merge-commit: Method not available (returns undefined)
   * backend.trackBranch; // undefined
   */
  trackBranch?(branchName: string, parent: string, workdir: string): Promise<void>;
};

/**
 * Core VCS provider interface
 */
export type VcsProvider = {
  /**
   * Commit changes
   */
  commit(message: string, files?: string[]): Promise<string>;

  /**
   * Create a new branch
   */
  createBranch(name: string, base?: string): Promise<void>;

  /**
   * Get current branch
   */
  getCurrentBranch(): Promise<string>;

  /**
   * Get status
   */
  getStatus(): Promise<VcsStatus>;

  /**
   * Initialize the VCS provider
   */
  initialize(cwd: string): Promise<void>;

  /**
   * Check if the provider is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Switch to a branch
   */
  switchBranch(name: string): Promise<void>;
};

/**
 * Stack provider for managing PR stacks
 */
export type StackProvider = {
  /**
   * Add a branch to the current stack
   */
  addBranch(branchName: string): Promise<void>;

  /**
   * Create a new stack
   */
  createStack(name: string): Promise<void>;

  /**
   * Get current stack info
   */
  getStackInfo(): Promise<StackInfo>;

  /**
   * Initialize the stack provider
   */
  initialize(cwd: string): Promise<void>;

  /**
   * Check if the provider is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Restack branches
   */
  restack(): Promise<void>;

  /**
   * Submit the stack for review
   */
  submitStack(): Promise<StackSubmitResult>;
};

/**
 * VCS status information
 */
export type VcsStatus = {
  branch: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
};

/**
 * Stack submit result
 */
export type StackSubmitResult = {
  errors?: string[];
  pullRequests: PullRequest[];
  success: boolean;
};

/**
 * VCS Engine orchestration interface - coordinates all VCS domain services
 */
export type VcsEngineService = {
  /**
   * Add a single task to the stack incrementally
   * Returns the branch name that was created
   */
  addTaskToStack(
    task: ExecutionTask,
    workdir: string,
    worktreeContext?: WorktreeContext,
  ): Promise<string | null>;

  /**
   * Analyze worktree needs for parallel execution
   */
  analyzeWorktreeNeeds(
    tasks: ExecutionTask[],
    workdir: string,
  ): Promise<{
    estimatedDiskUsage: number;
    maxConcurrentTasks: number;
    parallelLayers: number;
    requiresWorktrees: boolean;
  }>;

  /**
   * Build a git-spice stack from completed tasks
   */
  buildStackFromTasks(
    tasks: ExecutionTask[],
    workdir: string,
    options?: {
      parentRef?: string;
      strategy?: string;
      submitStack?: boolean;
    },
  ): Promise<{
    branches: Array<{ branchName: string; commitHash: string; taskId: string }>;
    parentRef: string;
    prUrls?: string[] | undefined;
  }>;

  /**
   * Clean up worktrees after execution
   */
  cleanupWorktrees(contexts: WorktreeContext[]): Promise<void>;

  /**
   * Commit changes in a stack-aware way using native VCS backend
   * This should use backend-specific commands (e.g., gs commit) for proper stacking
   */
  commitInStack(
    task: ExecutionTask,
    context: WorktreeContext,
    options?: CommitOptions,
  ): Promise<string>;

  /**
   * Commit changes for a completed task
   */
  commitTaskChanges(
    task: ExecutionTask,
    context: WorktreeContext,
    options?: CommitOptions,
  ): Promise<string>;

  /**
   * Create a branch from a specific commit, optionally tracking a parent branch
   */
  createBranchFromCommit(
    branchName: string,
    commitHash: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void>;

  /**
   * Create a stack branch using native VCS backend (e.g., git-spice)
   * This creates branches with proper parent tracking for stacking
   */
  createStackBranch(branchName: string, parentBranch: string, workdir: string): Promise<void>;

  /**
   * Create worktrees for parallel task execution
   */
  createWorktreesForTasks(
    tasks: ExecutionTask[],
    baseRef: string,
    workdir: string,
  ): Promise<WorktreeContext[]>;

  /**
   * Fetch commits from worktrees to make them available in the main repository
   */
  fetchWorktreeCommits(tasks: ExecutionTask[], workdir: string): Promise<void>;

  /**
   * Retrieve the configured default parent branch used for stacks
   */
  getDefaultParentRef(): string;

  /**
   * Initialize the VCS engine with a working directory
   */
  initialize(workdir: string): Promise<void>;

  /**
   * Initialize stack state for incremental building
   */
  initializeStackState(parentRef: string): void;

  /**
   * Restack branches to ensure proper stacking relationships
   */
  restack(workdir: string): Promise<void>;

  /**
   * Track an existing branch with the VCS backend
   * Used to integrate branches created outside of the VCS backend
   */
  trackBranch(branchName: string, parentBranch: string, workdir: string): Promise<void>;

  /**
   * Update a branch to point to a specific commit
   */
  updateBranchToCommit(branchName: string, commitHash: string, workdir: string): Promise<void>;
};
