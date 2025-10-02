/**
 * VCS Strategy Interface
 *
 * Defines how version control operations are handled during task execution.
 * Separates the concern of HOW tasks are executed (parallel based on DAG)
 * from WHERE/HOW commits and branches are organized.
 */

import type { ExecutionTask } from '@/core/execution/types';
import type { Task } from '@/types/decomposer';
import type { ValidationConfig } from '@/types/validation';

import type { WorktreeContext } from './domain-services';

export type { WorktreeContext } from './domain-services';
export type VcsMode = 'simple' | 'worktree' | 'stacked';

export type VcsStrategyContext = {
  baseRef?: string;
  cwd: string;
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
    task: Task,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    output?: string,
  ): Promise<TaskCommitResult>;

  /**
   * Initialize the strategy for a set of tasks
   */
  initialize(tasks: Task[], context: VcsStrategyContext): Promise<void>;

  /**
   * Prepare a single task for execution (e.g., create worktree if needed)
   * Returns the execution context for the task
   */
  prepareTaskExecution?(
    task: Task,
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
};
