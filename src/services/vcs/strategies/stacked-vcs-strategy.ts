/**
 * Stacked VCS Strategy
 *
 * Creates git-spice stacked branches for each task.
 * Each task gets its own branch that builds on the previous task's branch,
 * creating a clean stack of changes perfect for review.
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
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export class StackedVcsStrategy implements VcsStrategy {
  private readonly commitService: CommitServiceImpl;
  private readonly worktreeContexts: Map<string, WorktreeContext> = new Map();
  private readonly vcsEngine: VcsEngineService;
  private _taskOrder: string[] = [];
  private _branchStack: string[] = [];

  constructor(vcsEngine: VcsEngineService) {
    this.vcsEngine = vcsEngine;
    this.commitService = new CommitServiceImpl();
  }

  async initialize(tasks: Task[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[StackedVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);
    logger.info(`  Base ref: ${context.baseRef ?? 'HEAD'}`);

    // Initialize VCS engine
    await this.vcsEngine.initialize(context.cwd);

    // Initialize the stack state
    this.vcsEngine.initializeStackState(context.baseRef ?? 'main');

    // Determine task execution order based on dependencies
    this._taskOrder = this._determineTaskOrder(tasks);
    this._branchStack = [context.baseRef ?? 'main']; // Start with base branch

    logger.info(`  📋 Task order for stack: ${this._taskOrder.join(' → ')}`);
  }

  async prepareTaskExecutionContexts(
    tasks: ExecutionTask[],
    context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>> {
    logger.info(`[StackedVcsStrategy] Creating worktrees for ${tasks.length} tasks`);

    // Create worktrees for all tasks
    const worktreeContextsList = await this.vcsEngine.createWorktreesForTasks(
      tasks,
      context.baseRef ?? 'HEAD',
      context.cwd,
    );

    logger.info(`  ✅ Created ${worktreeContextsList.length} worktrees`);

    // Build map of task IDs to contexts
    this.worktreeContexts.clear();
    for (const worktreeContext of worktreeContextsList) {
      this.worktreeContexts.set(worktreeContext.taskId, worktreeContext);
      logger.info(`  📁 Worktree for ${worktreeContext.taskId}: ${worktreeContext.worktreePath}`);
    }

    return this.worktreeContexts;
  }

  async handleTaskCompletion(
    task: Task,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    _output?: string,
  ): Promise<TaskCommitResult> {
    logger.info(`[StackedVcsStrategy] Handling completion for task ${task.id}`);
    logger.info(`  Worktree: ${context.worktreePath}`);

    try {
      // Check if there's already a commit in the worktree
      const existingCommit = await this._getWorktreeCommitHash(context);

      let commitHash: string;
      if (isNonEmptyString(existingCommit)) {
        logger.info(`  ✅ Using existing commit: ${existingCommit.slice(0, 7)}`);
        commitHash = existingCommit;
      } else {
        // Create new commit
        commitHash = await this.commitService.commitChanges(executionTask, context, {
          generateMessage: true,
          includeAll: true,
        });
        logger.info(`  ✅ Created new commit: ${commitHash.slice(0, 7)}`);
      }

      // Store commit hash in execution task
      executionTask.commitHash = commitHash;

      // Create stacked branch for this task
      const parentBranch = this._branchStack.at(-1) ?? 'main';
      const newBranchName = `chopstack/${task.id}`;

      logger.info(`  🌿 Creating stacked branch ${newBranchName} on ${parentBranch}`);

      // Add task to the stack - this creates the branch and sets it up
      await this.vcsEngine.addTaskToStack(executionTask, context.worktreePath, context);

      // Track branch in our stack
      this._branchStack.push(newBranchName);

      logger.info(`  ✅ Added to stack: ${newBranchName} → ${parentBranch}`);

      return {
        taskId: task.id,
        commitHash,
        branchName: newBranchName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  ❌ Failed to handle task ${task.id}: ${errorMessage}`);

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
    logger.info(`[StackedVcsStrategy] Finalizing with ${results.length} results`);

    const commits = results
      .filter((r): r is TaskCommitResult & { commitHash: string } => isNonEmptyString(r.commitHash))
      .map((r) => r.commitHash);

    // Exclude the base branch from the returned branches
    const branches = this._branchStack.slice(1);

    logger.info(`  📊 Stack created: ${this._branchStack.join(' → ')}`);
    logger.info(`  🌳 Branches: ${branches.length}`);
    logger.info(`  💾 Commits: ${commits.length}`);

    return {
      branches,
      commits,
    };
  }

  async cleanup(): Promise<void> {
    logger.info(`[StackedVcsStrategy] Cleaning up ${this.worktreeContexts.size} worktrees`);

    if (this.worktreeContexts.size > 0) {
      try {
        const contexts = [...this.worktreeContexts.values()];
        await this.vcsEngine.cleanupWorktrees(contexts);
        logger.info(`  ✅ Cleaned up worktrees`);
      } catch (error) {
        logger.warn(`  ⚠️ Failed to cleanup worktrees: ${String(error)}`);
      }
    }
  }

  private _determineTaskOrder(tasks: Task[]): string[] {
    const ordered: string[] = [];
    const remaining = new Set(tasks);
    const completed = new Set<string>();

    // Keep processing until all tasks are ordered
    while (remaining.size > 0) {
      const readyTasks = [...remaining].filter((task) =>
        task.requires.every((dep) => completed.has(dep)),
      );

      if (readyTasks.length === 0) {
        // Handle circular dependencies or missing dependencies
        const remainingIds = [...remaining].map((t) => t.id);
        logger.warn(
          `⚠️ Circular or missing dependencies detected for tasks: ${remainingIds.join(', ')}`,
        );
        // Add remaining tasks in arbitrary order
        ordered.push(...remainingIds);
        break;
      }

      // Sort ready tasks by estimated lines (simplest first)
      readyTasks.sort((a, b) => a.estimatedLines - b.estimatedLines);

      // Add the first ready task to the order
      const nextTask = readyTasks[0];
      if (isNonNullish(nextTask)) {
        ordered.push(nextTask.id);
        remaining.delete(nextTask);
        completed.add(nextTask.id);
      }
    }

    return ordered;
  }

  private async _getWorktreeCommitHash(context: WorktreeContext): Promise<string | null> {
    const { execSync } = await import('node:child_process');
    try {
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: context.worktreePath,
        encoding: 'utf8',
      }).trim();
      return commitHash;
    } catch (error) {
      logger.debug(`No commit found in worktree: ${String(error)}`);
      return null;
    }
  }
}
