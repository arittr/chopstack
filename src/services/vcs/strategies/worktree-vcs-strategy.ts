/**
 * Worktree VCS Strategy
 *
 * Creates separate Git worktrees for each task to enable parallel execution
 * without conflicts. Each task runs in its own isolated worktree,
 * commits are made there, then merged back to the main branch.
 */

import type { ExecutionTask } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type {
  TaskCommitResult,
  VcsStrategy,
  VcsStrategyContext,
  WorktreeContext,
} from '@/core/vcs/vcs-strategy';
import type { Task } from '@/types/decomposer';

import { CommitServiceImpl } from '@/services/vcs/commit-service';
import { logger } from '@/utils/global-logger';
import { isNonEmptyString } from '@/validation/guards';

export class WorktreeVcsStrategy implements VcsStrategy {
  private readonly commitService: CommitServiceImpl;
  private _worktreeContexts: WorktreeContext[] = [];
  private readonly vcsEngine: VcsEngineService;

  constructor(vcsEngine: VcsEngineService) {
    this.vcsEngine = vcsEngine;
    this.commitService = new CommitServiceImpl();
  }

  async initialize(tasks: Task[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[WorktreeVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);
    logger.info(`  Base ref: ${context.baseRef ?? 'HEAD'}`);

    // Initialize VCS engine
    await this.vcsEngine.initialize(context.cwd);
  }

  async prepareTaskExecutionContexts(
    tasks: ExecutionTask[],
    context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>> {
    logger.info(`[WorktreeVcsStrategy] Creating worktrees for ${tasks.length} tasks`);

    // Create worktrees for all tasks
    this._worktreeContexts = await this.vcsEngine.createWorktreesForTasks(
      tasks,
      context.baseRef ?? 'HEAD',
      context.cwd,
    );

    logger.info(`  ✅ Created ${this._worktreeContexts.length} worktrees`);

    // Build map of task IDs to contexts
    const contexts = new Map<string, WorktreeContext>();
    for (const worktreeContext of this._worktreeContexts) {
      contexts.set(worktreeContext.taskId, worktreeContext);
      logger.info(`  📁 Worktree for ${worktreeContext.taskId}: ${worktreeContext.worktreePath}`);
    }

    return contexts;
  }

  async handleTaskCompletion(
    task: Task,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    _output?: string,
  ): Promise<TaskCommitResult> {
    logger.info(`[WorktreeVcsStrategy] Handling completion for task ${task.id}`);
    logger.info(`  Worktree: ${context.worktreePath}`);

    try {
      const commitHash = await this.commitService.commitChanges(executionTask, context, {
        generateMessage: true,
        includeAll: true,
      });

      logger.info(`  ✅ Committed task ${task.id}: ${commitHash.slice(0, 7)}`);

      // Store commit hash in execution task for later use
      executionTask.commitHash = commitHash;

      return {
        taskId: task.id,
        commitHash,
        branchName: context.branchName,
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
    logger.info(`[WorktreeVcsStrategy] Finalizing with ${results.length} results`);

    const commits = results
      .filter((r): r is TaskCommitResult & { commitHash: string } => isNonEmptyString(r.commitHash))
      .map((r) => r.commitHash);

    const branches = results
      .filter((r): r is TaskCommitResult & { branchName: string } => isNonEmptyString(r.branchName))
      .map((r) => r.branchName);

    logger.info(`  📊 Total commits: ${commits.length}`);
    logger.info(`  🌳 Branches used: ${branches.join(', ')}`);

    // TODO: Merge commits back to main branch if needed

    return {
      branches,
      commits,
    };
  }

  async cleanup(): Promise<void> {
    logger.info(`[WorktreeVcsStrategy] Cleaning up ${this._worktreeContexts.length} worktrees`);

    if (this._worktreeContexts.length > 0) {
      try {
        await this.vcsEngine.cleanupWorktrees(this._worktreeContexts);
        logger.info(`  ✅ Cleaned up worktrees`);
      } catch (error) {
        logger.warn(`  ⚠️ Failed to cleanup worktrees: ${String(error)}`);
      }
    }
  }
}
