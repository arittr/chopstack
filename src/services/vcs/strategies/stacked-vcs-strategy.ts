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

    // Clean up any existing branch for this task to ensure fresh start
    const branchName = `chopstack/${task.id}`;
    try {
      const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
      const git = new GitWrapper(context.cwd);
      const branchExists = await git.branchExists(branchName);
      if (branchExists) {
        logger.info(`  🧹 Deleting existing branch ${branchName} for fresh start`);
        await git.git.raw(['branch', '-D', branchName]);
      }
    } catch (error) {
      logger.debug(
        `  ℹ️ Branch ${branchName} doesn't exist or couldn't be deleted: ${String(error)}`,
      );
    }

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

    // WORKTREE-FIRST WORKFLOW: Create worktree FIRST, then track with git-spice after commit
    logger.info(`  🏗️ Creating worktree for task ${task.id}`);

    try {
      // Step 1: Create worktree directly from the parent branch
      // This avoids checking out branches in the main repo
      const worktreeTask = { ...executionTask, branchName };

      const worktreeContext = await this.vcsEngine.createWorktreesForTasks(
        [worktreeTask],
        parentBranch, // Use parent branch as base for worktree
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
      logger.error(`  ❌ Failed to create worktree for task ${task.id}: ${String(error)}`);
      throw new Error(`Cannot execute task ${task.id}: worktree creation failed. ${String(error)}`);
    }

    // This should never be reached
    throw new Error(`Failed to create worktree for task ${task.id}`);
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

      // Check if there were any changes (empty string means no commit)
      if (commitHash === '') {
        logger.warn(`  ⚠️ Task ${task.id} had no changes, skipping branch tracking`);

        // Mark task as completed but without a commit
        this.completedTasks.add(task.id);

        // Clean up the worktree since we're not using it
        logger.info(`  🧹 Cleaning up worktree for empty commit task ${task.id}`);
        try {
          await this.vcsEngine.cleanupWorktrees([context]);
          logger.info(`  ✅ Cleaned up worktree for task ${task.id}`);
        } catch (cleanupError) {
          logger.warn(`  ⚠️ Failed to cleanup worktree: ${String(cleanupError)}`);
        }

        return {
          taskId: task.id,
          commitHash: '',
          branchName: context.branchName,
        };
      }

      logger.info(`  ✅ Created git-spice commit: ${commitHash.slice(0, 7)}`);

      // Store commit hash in execution task
      executionTask.commitHash = commitHash;

      // Mark task as completed
      this.completedTasks.add(task.id);

      // The branch name was already set in prepareTaskExecution
      const { branchName } = context;

      // If we're in a worktree, ensure the commit is visible in the main repo
      const { worktreePath } = context;
      const { cwd } = this._vcsContext;

      if (worktreePath !== cwd) {
        try {
          // Fetch the commit from the worktree to make it available in the main repo
          // This is needed even if we're on the right branch, to make commits visible
          await this.vcsEngine.fetchWorktreeCommits([executionTask], cwd);

          // Ensure the branch exists in main repo before tracking
          // Create branch reference from the commit
          const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
          const mainGit = new GitWrapper(cwd);
          try {
            // Create or update the branch to point to the commit
            await mainGit.git.raw(['branch', '-f', branchName, commitHash]);
            logger.info(
              `  ✅ Created/updated branch ${branchName} at ${commitHash.slice(0, 7)} in main repo`,
            );
          } catch (branchError) {
            logger.warn(`  ⚠️ Failed to create branch in main repo: ${String(branchError)}`);
          }

          // Now track the branch with git-spice in the main repo
          // Determine parent for tracking
          const { baseRef } = context;
          const { requires } = task;
          let parentBranch = 'main';
          if (isNonEmptyString(baseRef)) {
            parentBranch = baseRef;
          } else if (requires.length > 0) {
            const lastDep = requires.at(-1);
            if (isNonEmptyString(lastDep)) {
              parentBranch = `chopstack/${lastDep}`;
            }
          }

          // Track the branch with git-spice (this will create it if needed)
          // If the parent branch doesn't exist (because it had no changes), fall back to base
          try {
            await this.vcsEngine.trackBranch(branchName, parentBranch, cwd);
          } catch (trackError) {
            // If tracking fails because parent doesn't exist, try with the base branch
            const errorMessage = String(trackError);
            if (errorMessage.includes('branch not tracked') || errorMessage.includes('not found')) {
              logger.warn(
                `  ⚠️ Parent branch ${parentBranch} not tracked, falling back to base branch`,
              );
              const fallbackParent = this._vcsContext.baseRef ?? 'main';
              await this.vcsEngine.trackBranch(branchName, fallbackParent, cwd);
              parentBranch = fallbackParent;
            } else {
              throw trackError;
            }
          }

          // Track the branch in our stack
          if (!this._branchStack.includes(branchName)) {
            this._branchStack.push(branchName);
            this._currentStackTip = branchName;
          }

          logger.info(`  ✅ Tracked git-spice branch ${branchName} with parent ${parentBranch}`);

          // Clean up this worktree now that it's committed and tracked
          // This allows child tasks to create worktrees from this branch
          const { id } = task;
          logger.info(`  🧹 Cleaning up worktree for completed task ${id}`);
          try {
            await this.vcsEngine.cleanupWorktrees([context]);
            logger.info(`  ✅ Cleaned up worktree for task ${id}`);
          } catch (cleanupError) {
            logger.warn(`  ⚠️ Failed to cleanup worktree: ${String(cleanupError)}`);
          }
        } catch (syncError) {
          logger.warn(`  ⚠️ Failed to sync worktree commit: ${String(syncError)}`);
          // Continue anyway - the commit exists
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
