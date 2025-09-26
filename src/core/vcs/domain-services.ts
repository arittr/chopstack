import type { ExecutionTask } from '@/core/execution/types';

/**
 * Core domain types for VCS operations
 */
export type WorktreeCreateOptions = {
  baseRef: string;
  branchName: string;
  taskId: string;
  workdir: string;
  worktreePath: string;
};

export type WorktreeContext = {
  absolutePath: string;
  baseRef: string;
  branchName: string;
  created: Date;
  taskId: string;
  worktreePath: string;
};

export type CommitOptions = {
  files?: string[];
  generateMessage?: boolean;
  includeAll?: boolean;
  message?: string;
};

export type ConflictResolutionStrategy = 'auto' | 'manual' | 'fail';

export type ConflictInfo = {
  conflictedFiles: string[];
  resolution: ConflictResolutionStrategy;
  taskId: string;
  timestamp: Date;
};

export type StackBuildStrategy = 'dependency-order' | 'complexity-first' | 'file-impact';

export type StackBranch = {
  branchName: string;
  commitHash: string;
  taskId: string;
};

export type StackInfo = {
  branches: StackBranch[];
  failedTasks?: Array<{ reason: string; taskId: string }>;
  parentRef: string;
  prUrls?: string[] | undefined;
  strategy: StackBuildStrategy;
  totalTasks: number;
};

/**
 * Worktree management domain service interface
 */
export type WorktreeService = {
  /**
   * Clean up multiple worktrees
   */
  cleanupWorktrees(taskIds: string[]): Promise<void>;

  /**
   * Create a worktree for task isolation
   */
  createWorktree(options: WorktreeCreateOptions): Promise<WorktreeContext>;

  /**
   * Get active worktree contexts
   */
  getActiveWorktrees(): WorktreeContext[];

  /**
   * Check if a worktree exists for a task
   */
  hasWorktree(taskId: string): boolean;

  /**
   * Remove a specific worktree
   */
  removeWorktree(taskId: string): Promise<void>;
};

/**
 * Commit management domain service interface
 */
export type CommitService = {
  /**
   * Analyze changes in a working directory
   */
  analyzeChanges(workdir: string, files?: string[]): Promise<{ files: string[] }>;

  /**
   * Create a commit for task changes
   */
  commitChanges(
    task: ExecutionTask,
    context: WorktreeContext,
    options?: CommitOptions,
  ): Promise<string>;

  /**
   * Generate a commit message for a task
   */
  generateCommitMessage(
    task: ExecutionTask,
    changes: { files?: string[]; output?: string },
    workdir: string,
  ): Promise<string>;

  /**
   * Check if there are changes to commit
   */
  hasChangesToCommit(workdir: string): Promise<boolean>;
};

/**
 * Conflict resolution domain service interface
 */
export type ConflictResolutionService = {
  /**
   * Detect conflicts during stack building
   */
  detectConflicts(
    sourceBranch: string,
    targetBranch: string,
    workdir: string,
  ): Promise<ConflictInfo | null>;

  /**
   * Get available resolution strategies
   */
  getAvailableStrategies(): ConflictResolutionStrategy[];

  /**
   * Resolve conflicts using the specified strategy
   */
  resolveConflicts(conflictInfo: ConflictInfo, workdir: string): Promise<boolean>;
};

/**
 * Stack building domain service interface
 */
export type StackBuildService = {
  /**
   * Add a single task to the stack incrementally
   */
  addTaskToStack(
    task: ExecutionTask,
    workdir: string,
    worktreeContext?: WorktreeContext,
  ): Promise<void>;

  /**
   * Build a git-spice stack from completed tasks
   */
  buildStack(
    tasks: ExecutionTask[],
    workdir: string,
    options: {
      parentRef: string;
      strategy: StackBuildStrategy;
    },
  ): Promise<StackInfo>;

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
   * Get stack information
   */
  getStackInfo(workdir: string): Promise<StackInfo | null>;

  /**
   * Get the current top of the stack
   */
  getStackTip(): string;

  /**
   * Initialize stack state for incremental building
   */
  initializeStackState(parentRef: string): void;

  /**
   * Check if a task is already in the stack
   */
  isTaskStacked(taskId: string): boolean;

  /**
   * Reorder stack branches based on dependencies
   */
  reorderStack(tasks: ExecutionTask[], strategy: StackBuildStrategy): ExecutionTask[];

  /**
   * Submit a stack for review (create PRs)
   */
  submitStack(workdir: string): Promise<string[]>;
};

/**
 * VCS repository operations domain service interface
 */
export type RepositoryService = {
  /**
   * Check if a branch exists
   */
  branchExists(name: string, workdir: string): Promise<boolean>;

  /**
   * Create a new branch
   */
  createBranch(name: string, base: string, workdir: string): Promise<void>;

  /**
   * Get current branch name
   */
  getCurrentBranch(workdir: string): Promise<string>;

  /**
   * Get current repository status
   */
  getStatus(workdir: string): Promise<{
    branch: string;
    clean: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }>;

  /**
   * Check if repository is clean
   */
  isClean(workdir: string): Promise<boolean>;

  /**
   * Switch to a branch
   */
  switchBranch(name: string, workdir: string): Promise<void>;
};

/**
 * VCS analysis domain service interface
 */
export type VcsAnalysisService = {
  /**
   * Analyze worktree requirements for a plan
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
   * Create execution layers from tasks based on dependencies
   */
  createExecutionLayers(tasks: ExecutionTask[]): ExecutionTask[][];

  /**
   * Estimate disk usage for worktrees
   */
  estimateDiskUsage(workdir: string, taskCount: number): Promise<number>;
};
