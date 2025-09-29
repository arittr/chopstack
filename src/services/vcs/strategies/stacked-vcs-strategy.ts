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

import { logger } from '@/utils/global-logger';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export class StackedVcsStrategy implements VcsStrategy {
  private readonly worktreeContexts: Map<string, WorktreeContext> = new Map();
  private readonly vcsEngine: VcsEngineService;
  private _taskOrder: string[] = [];
  private _branchStack: string[] = [];
  private _vcsContext!: VcsStrategyContext;

  // Track completed tasks
  private readonly completedTasks = new Set<string>();
  private _currentStackTip = '';

  constructor(vcsEngine: VcsEngineService) {
    this.vcsEngine = vcsEngine;
  }

  async initialize(tasks: Task[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[StackedVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);
    logger.info(`  Base ref: ${context.baseRef ?? 'HEAD'}`);

    // Clear state from any previous runs
    this.completedTasks.clear();
    this.worktreeContexts.clear();

    // Store VCS context for later use
    this._vcsContext = context;

    // Initialize VCS engine
    await this.vcsEngine.initialize(context.cwd);

    // Initialize the stack state
    this.vcsEngine.initializeStackState(context.baseRef ?? 'main');

    // Determine task execution order based on dependencies
    this._taskOrder = this._determineTaskOrder(tasks);
    this._branchStack = [context.baseRef ?? 'main']; // Start with base branch
    this._currentStackTip = context.baseRef ?? 'main'; // Track the current tip of our stack

    logger.info(`  📋 Task order for stack: ${this._taskOrder.join(' → ')}`);
    logger.info(`  🎯 Initial stack tip: ${this._currentStackTip}`);
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

    // Determine the parent branch based on dependencies
    let parentBranch = this._vcsContext.baseRef ?? 'main';

    // If task has dependencies, check if they're completed and stacked
    if (task.requires.length > 0) {
      // Find the last dependency (in case of multiple dependencies)
      const lastDependency = task.requires.at(-1);

      if (isNonNullish(lastDependency)) {
        // Check if dependency is in the branch stack (meaning it's been stacked)
        const dependencyBranch = this._branchStack.find((b) => b.includes(`/${lastDependency}`));

        if (isNonEmptyString(dependencyBranch)) {
          parentBranch = dependencyBranch;
          logger.info(`  📍 Using dependency branch as base: ${parentBranch}`);
        } else {
          // Dependency not yet stacked - this shouldn't happen if execution order is correct
          logger.warn(
            `  ⚠️ Dependency ${lastDependency} not yet stacked, using base: ${parentBranch}`,
          );
        }
      }
    } else {
      logger.info(`  📍 No dependencies, using base branch: ${parentBranch}`);
    }

    // SPICE-FIRST WORKFLOW: Create the git-spice branch FIRST
    const branchName = `chopstack/${task.id}`;
    logger.info(`  🌿 Creating git-spice branch ${branchName} with parent ${parentBranch}`);

    try {
      // Step 1: Create branch with git-spice (this tracks parent relationships)
      await this.vcsEngine.createStackBranch(branchName, parentBranch, context.cwd);

      // Track the branch in our stack
      this._branchStack.push(branchName);
      this._currentStackTip = branchName;

      logger.info(`  ✅ Created git-spice branch: ${branchName}`);
    } catch (error) {
      logger.error(`  ❌ Failed to create git-spice branch: ${String(error)}`);
      // Continue anyway - worktree creation might still work
    }

    // Step 2: Create worktree FROM THE NEWLY CREATED BRANCH
    logger.info(`  🏗️ Creating worktree for task ${task.id} from branch ${branchName}`);

    try {
      // Override the executionTask to use our new branch name
      const worktreeTask = { ...executionTask, branchName };

      const worktreeContext = await this.vcsEngine.createWorktreesForTasks(
        [worktreeTask],
        branchName, // Use the newly created branch as the base
        context.cwd,
      );

      if (worktreeContext.length > 0) {
        const worktreeCtx = worktreeContext[0];
        if (isNonNullish(worktreeCtx)) {
          // Update the context with the correct branch name
          worktreeCtx.branchName = branchName;
          worktreeCtx.baseRef = parentBranch;

          this.worktreeContexts.set(task.id, worktreeCtx);
          logger.info(`  ✅ Created worktree: ${worktreeCtx.worktreePath}`);
          return worktreeCtx;
        }
      }
    } catch (error) {
      logger.warn(`  ⚠️ Failed to create worktree for task ${task.id}: ${String(error)}`);
    }

    // Fallback to main repository with a proper context
    logger.info(`  📁 Fallback - using main repository: ${context.cwd}`);
    const fallbackContext: WorktreeContext = {
      taskId: task.id,
      branchName,
      worktreePath: context.cwd,
      absolutePath: context.cwd,
      baseRef: parentBranch,
      created: new Date(),
    };
    this.worktreeContexts.set(task.id, fallbackContext);
    return fallbackContext;
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
      // SPICE-FIRST WORKFLOW: Use git-spice for commits
      // The branch was already created in prepareTaskExecution,
      // now we just need to commit the changes using git-spice

      logger.info(`  🌿 Committing task changes using git-spice in ${context.worktreePath}`);

      // Use git-spice commit for proper stacking
      // This automatically handles restacking and maintains parent relationships
      const commitHash = await this.vcsEngine.commitInStack(executionTask, context, {
        generateMessage: true,
        includeAll: true,
      });

      logger.info(`  ✅ Created git-spice commit: ${commitHash.slice(0, 7)}`);

      // Store commit hash in execution task
      executionTask.commitHash = commitHash;

      // Mark task as completed
      this.completedTasks.add(task.id);

      // The branch name was already set in prepareTaskExecution
      const { branchName } = context;

      // If we're in a worktree, we need to update the git-spice branch with the commit
      const { worktreePath } = context;
      const { cwd } = this._vcsContext;

      if (worktreePath !== cwd) {
        try {
          // Fetch the commit from the worktree to make it available in the main repo
          await this.vcsEngine.fetchWorktreeCommits([executionTask], cwd);

          // Update the git-spice branch to point to the new commit
          await this.vcsEngine.updateBranchToCommit(branchName, commitHash, cwd);

          logger.info(
            `  ✅ Updated git-spice branch ${branchName} to commit ${commitHash.slice(0, 7)}`,
          );
        } catch (syncError) {
          logger.warn(
            `  ⚠️ Failed to sync worktree commit to git-spice branch: ${String(syncError)}`,
          );
          // Continue anyway - the commit exists, just not on the right branch
        }
      }

      return {
        taskId: task.id,
        commitHash,
        branchName,
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

    // Tasks are now stacked immediately in handleTaskCompletion
    // No need to process a completion queue here

    const commits = results
      .filter((r): r is TaskCommitResult & { commitHash: string } => isNonEmptyString(r.commitHash))
      .map((r) => r.commitHash);

    // Exclude the base branch from the returned branches
    const branches = this._branchStack.slice(1);

    logger.info(`  📊 Stack created: ${this._branchStack.join(' → ')}`);
    logger.info(`  🌳 Branches: ${branches.length}`);
    logger.info(`  💾 Commits: ${commits.length}`);

    // After all branches are stacked, run restack to finalize
    if (branches.length > 0) {
      try {
        await this.vcsEngine.restack(context.cwd);
        logger.info(`  ✅ Successfully restacked all branches`);
      } catch (restackError) {
        logger.warn(`⚠️ Failed to restack branches: ${String(restackError)}`);
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
}
