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
  private _vcsContext!: VcsStrategyContext;

  constructor(vcsEngine: VcsEngineService) {
    this.vcsEngine = vcsEngine;
    this.commitService = new CommitServiceImpl();
  }

  async initialize(tasks: Task[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[StackedVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);
    logger.info(`  Base ref: ${context.baseRef ?? 'HEAD'}`);

    // Store VCS context for later use
    this._vcsContext = context;

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
    _context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>> {
    logger.info(
      `[StackedVcsStrategy] Preparing for dynamic worktree creation for ${tasks.length} tasks`,
    );

    // For stacked strategy, we don't create worktrees upfront
    // Instead, we create them dynamically when each task becomes ready to execute
    // This allows each task to build on the previous task's completed state

    this.worktreeContexts.clear();
    logger.info(`  ⏱️ Worktrees will be created just-in-time based on dependency completion`);

    // Ensure this is truly async
    await Promise.resolve();

    return this.worktreeContexts;
  }

  async prepareTaskExecution(
    task: Task,
    executionTask: ExecutionTask,
    context: VcsStrategyContext,
  ): Promise<WorktreeContext | null> {
    logger.info(`[StackedVcsStrategy] Preparing execution for task ${task.id}`);

    // Check if this is the first task in the dependency order
    const taskIndex = this._taskOrder.indexOf(task.id);
    const isFirstTask = taskIndex === 0;

    if (isFirstTask) {
      logger.info(`  📁 First task in stack - using main repository: ${context.cwd}`);
      return null; // null means use main repository
    }

    // For subsequent tasks, create a worktree from the previous task's completed branch
    // Find the most recent completed branch to use as parent
    let parentBranch = context.baseRef ?? 'main';

    // Look for the latest completed branch in our stack
    for (let index = taskIndex - 1; index >= 0; index--) {
      const previousTaskId = this._taskOrder[index];
      const previousBranchName = `chopstack/${previousTaskId}`;
      if (this._branchStack.includes(previousBranchName)) {
        parentBranch = previousBranchName;
        break;
      }
    }

    logger.info(`  🏗️ Creating worktree for task ${task.id} from branch ${parentBranch}`);

    try {
      const worktreeContext = await this.vcsEngine.createWorktreesForTasks(
        [executionTask],
        parentBranch,
        context.cwd,
      );

      if (worktreeContext.length > 0) {
        const worktreeCtx = worktreeContext[0];
        if (isNonNullish(worktreeCtx)) {
          this.worktreeContexts.set(task.id, worktreeCtx);
          logger.info(`  ✅ Created worktree: ${worktreeCtx.worktreePath}`);
          return worktreeCtx;
        }
      }
    } catch (error) {
      logger.warn(`  ⚠️ Failed to create worktree for task ${task.id}: ${String(error)}`);
    }

    logger.info(`  📁 Fallback - using main repository: ${context.cwd}`);
    return null; // Fallback to main repository
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
      // Always create a new commit for stacked strategy to include task changes
      logger.info(`  💾 Creating commit for task changes in ${context.worktreePath}`);
      const commitHash = await this.commitService.commitChanges(executionTask, context, {
        generateMessage: true,
        includeAll: true,
      });
      logger.info(`  ✅ Created new commit: ${commitHash.slice(0, 7)}`);

      // Store commit hash in execution task
      executionTask.commitHash = commitHash;

      // Create stacked branch for this task
      const parentBranch = this._branchStack.at(-1) ?? 'main';
      const newBranchName = `chopstack/${task.id}`;

      logger.info(`  🌿 Creating stacked branch ${newBranchName} on ${parentBranch}`);

      // Add task to the stack - this creates the branch and sets it up in the main repo
      await this.vcsEngine.addTaskToStack(executionTask, this._vcsContext.cwd, context);

      // Track branch in our stack
      this._branchStack.push(newBranchName);

      logger.info(`  ✅ Added to stack: ${newBranchName} → ${parentBranch}`);

      // Run restack after each task to ensure cumulative stacking
      try {
        await this.vcsEngine.restack(this._vcsContext.cwd);
        logger.info(`  🔄 Restacked after adding ${newBranchName}`);
      } catch (restackError) {
        logger.warn(
          `  ⚠️ Failed to restack after adding ${newBranchName}: ${String(restackError)}`,
        );
        // Continue anyway - we'll try again later
      }

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

  async finalize(
    results: TaskCommitResult[],
    context: VcsStrategyContext,
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

    // After all branches are tracked, run upstack restack to properly stack them
    if (branches.length > 0) {
      try {
        await this.vcsEngine.restack(context.cwd);
      } catch (restackError) {
        logger.warn(`⚠️ Failed to restack branches: ${String(restackError)}`);
        // Continue anyway - branches are still created and tracked
      }
    }

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
