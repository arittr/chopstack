/**
 * Simple VCS Strategy
 *
 * Commits all changes directly to the current branch.
 * No worktrees, no branch creation - just straightforward commits.
 * This is the default and simplest approach.
 */

import type { ExecutionTask } from '@/core/execution/types';
import type {
  TaskCommitResult,
  VcsStrategy,
  VcsStrategyContext,
  WorktreeContext,
} from '@/core/vcs/vcs-strategy';
import type { TaskV2 } from '@/types/schemas-v2';

import { CommitServiceImpl } from '@/services/vcs/commit-service';
import { logger } from '@/utils/global-logger';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export class SimpleVcsStrategy implements VcsStrategy {
  private readonly commitService: CommitServiceImpl;
  private _mainContext: WorktreeContext | null = null;

  constructor() {
    this.commitService = new CommitServiceImpl();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[SimpleVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);

    // Create a single context for the main working directory
    this._mainContext = {
      taskId: 'main',
      branchName: context.baseRef ?? 'HEAD',
      baseRef: context.baseRef ?? 'HEAD',
      absolutePath: context.cwd,
      worktreePath: context.cwd,
      created: new Date(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepareTaskExecutionContexts(
    tasks: ExecutionTask[],
    _context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>> {
    logger.info(`[SimpleVcsStrategy] Preparing contexts for ${tasks.length} tasks`);

    // All tasks execute in the main directory
    const contexts = new Map<string, WorktreeContext>();
    if (isNonNullish(this._mainContext)) {
      for (const task of tasks) {
        contexts.set(task.id, {
          ...this._mainContext,
          taskId: task.id,
        });
      }
    }

    return contexts;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepareTaskExecution(
    task: TaskV2,
    _executionTask: ExecutionTask,
    _context: VcsStrategyContext,
  ): Promise<WorktreeContext | null> {
    logger.info(`[SimpleVcsStrategy] Preparing execution for task ${task.id}`);

    // Return the main context for all tasks
    if (isNonNullish(this._mainContext)) {
      return {
        ...this._mainContext,
        taskId: task.id,
      };
    }

    return null;
  }

  async handleTaskCompletion(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    _output?: string,
  ): Promise<TaskCommitResult> {
    logger.info(`[SimpleVcsStrategy] Handling completion for task ${task.id}`);

    try {
      const commitHash = await this.commitService.commitChanges(executionTask, context, {
        generateMessage: true,
        includeAll: true,
      });

      logger.info(`  ✅ Committed task ${task.id}: ${commitHash.slice(0, 7)}`);

      return {
        taskId: task.id,
        commitHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`  ⚠️ Failed to commit task ${task.id}: ${errorMessage}`);

      return {
        taskId: task.id,
        error: errorMessage,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async finalize(
    results: TaskCommitResult[],
    _context: VcsStrategyContext,
  ): Promise<{ branches: string[]; commits: string[] }> {
    logger.info(`[SimpleVcsStrategy] Finalizing with ${results.length} results`);

    const commits = results
      .filter((r): r is TaskCommitResult & { commitHash: string } => isNonEmptyString(r.commitHash))
      .map((r) => r.commitHash);

    logger.info(`  📊 Total commits: ${commits.length}`);

    return {
      branches: [], // No branches created in simple mode
      commits,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async cleanup(): Promise<void> {
    logger.info(`[SimpleVcsStrategy] Cleanup - nothing to clean up`);
    // Nothing to cleanup in simple mode
  }

  /**
   * Simple strategy does not require worktrees
   */
  requiresWorktrees(): boolean {
    return false;
  }

  /**
   * Simple strategy does not support parallel execution
   * (all tasks execute sequentially in the main directory)
   */
  supportsParallelExecution(): boolean {
    return false;
  }

  /**
   * Simple strategy does not support stacking
   */
  supportsStacking(): boolean {
    return false;
  }
}
