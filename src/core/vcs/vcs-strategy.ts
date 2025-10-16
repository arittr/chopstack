/**
 * VCS Strategy Interface
 *
 * Defines how version control operations are handled during task execution.
 * Separates the concern of HOW tasks are executed (parallel based on DAG)
 * from WHERE/HOW commits and branches are organized.
 */

import type { ExecutionTask } from '@/core/execution/types';
import type { TaskV2 } from '@/types/schemas-v2';
import type { ValidationConfig } from '@/types/validation';

import type { WorktreeContext } from './domain-services';
import type { VcsBackend } from './interfaces';

export type { WorktreeContext } from './domain-services';

/**
 * VCS mode enumeration
 *
 * Defines the version control workflow to use:
 * - git-spice: Stacking workflow with gs CLI (maps to 'stacked' strategy)
 * - merge-commit: Simple merge workflow (requires only git) (maps to 'simple' strategy)
 * - graphite: Graphite stacking workflow with gt CLI (future)
 * - sapling: Sapling workflow with sl CLI (future)
 *
 * Legacy modes (for backward compatibility, will be deprecated):
 * - simple: Same as merge-commit
 * - worktree: Worktree-based parallel execution without stacking
 * - stacked: Same as git-spice
 */
export type VcsMode =
  | 'git-spice'
  | 'merge-commit'
  | 'graphite'
  | 'sapling'
  | 'simple'
  | 'worktree'
  | 'stacked';

/**
 * Context provided to VCS strategies
 */
export type VcsStrategyContext = {
  /**
   * VCS backend instance for the configured mode
   * Optional for backward compatibility - will be required in future versions
   */
  backend?: VcsBackend;

  /**
   * Base reference (branch/commit) for the stack
   */
  baseRef?: string;

  /**
   * Working directory (repository root)
   */
  cwd: string;

  /**
   * Optional validation configuration
   */
  validation?: ValidationConfig;
};

export type TaskCommitResult = {
  branchName?: string;
  commitHash?: string;
  error?: string;
  taskId: string;
};

/**
 * Strategy for handling VCS operations during task execution
 */
export type VcsStrategy = {
  /**
   * Cleanup any resources (e.g., remove worktrees)
   */
  cleanup(): Promise<void>;

  /**
   * Finalize after all tasks complete (e.g., create stack, cleanup)
   */
  finalize(
    results: TaskCommitResult[],
    context: VcsStrategyContext,
  ): Promise<{
    branches: string[];
    commits: string[];
  }>;

  /**
   * Handle task completion (e.g., commit changes)
   */
  handleTaskCompletion(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    output?: string,
  ): Promise<TaskCommitResult>;

  /**
   * Initialize the strategy for a set of tasks
   */
  initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void>;

  /**
   * Prepare a single task for execution (e.g., create worktree if needed)
   * Returns the execution context for the task
   */
  prepareTaskExecution?(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: VcsStrategyContext,
  ): Promise<WorktreeContext | null>;

  /**
   * Prepare for task execution (e.g., create worktrees, branches)
   * Returns a map of task IDs to their execution contexts
   */
  prepareTaskExecutionContexts(
    tasks: ExecutionTask[],
    context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>>;

  /**
   * Query if this strategy requires worktrees for isolation
   *
   * @returns true if strategy uses worktrees for parallel execution
   */
  requiresWorktrees(): boolean;

  /**
   * Query if this strategy supports parallel execution
   *
   * @returns true if strategy can execute tasks in parallel
   */
  supportsParallelExecution(): boolean;

  /**
   * Query if this strategy supports stacking (parent/child relationships)
   *
   * @returns true if strategy maintains stack structure
   */
  supportsStacking(): boolean;
};
