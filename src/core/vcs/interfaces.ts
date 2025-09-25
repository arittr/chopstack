import type { ExecutionTask, GitSpiceStackInfo } from '@/core/execution/types';
import type { CommitOptions, WorktreeContext } from '@/core/vcs/domain-services';

/**
 * VCS Backend interface for specific VCS implementations (e.g., git-spice)
 */
export type VcsBackend = {
  /**
   * Get stack information
   */
  getStackInfo(workdir: string): Promise<GitSpiceStackInfo | null>;

  /**
   * Initialize the backend in the repository
   */
  initialize(workdir: string, trunk?: string): Promise<void>;

  /**
   * Check if the backend is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Submit a stack for review
   */
  submitStack(workdir: string): Promise<string[]>;
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
 * Stack information
 */
export type StackInfo = {
  baseBranch: string;
  branches: StackBranch[];
  name: string;
};

/**
 * Branch in a stack
 */
export type StackBranch = {
  current: boolean;
  hasChanges: boolean;
  name: string;
  pullRequest?: PullRequest;
};

/**
 * VCS Engine orchestration interface - coordinates all VCS domain services
 */
export type VcsEngineService = {
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
   * Commit changes for a completed task
   */
  commitTaskChanges(
    task: ExecutionTask,
    context: WorktreeContext,
    options?: CommitOptions,
  ): Promise<string>;

  /**
   * Create worktrees for parallel task execution
   */
  createWorktreesForTasks(
    tasks: ExecutionTask[],
    baseRef: string,
    workdir: string,
  ): Promise<WorktreeContext[]>;

  /**
   * Initialize the VCS engine with a working directory
   */
  initialize(workdir: string): Promise<void>;
};
