import type { ExecutionContext, ExecutionResult, TaskResult } from '@/core/execution/interfaces';
import type { ExecutionPlan, ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';

import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

import { BaseExecutionStrategy, type ExecutionStrategyDependencies } from './execution-strategy';

/**
 * Stacked Branches execution strategy - creates git-spice stacked branches
 * Each task gets its own branch that tracks the previous task's branch
 */
export class StackedBranchesExecutionStrategy extends BaseExecutionStrategy {
  private _stackOrder: ExecutionTask[] = [];
  private _branchStack: string[] = [];

  constructor() {
    super('stacked-branches');
  }

  canHandle(_plan: ExecutionPlan, context: ExecutionContext): boolean {
    // Handle when explicitly requested for stacked branches workflow
    return context.strategy === 'stacked-branches';
  }

  async execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult> {
    logger.info(`🌿 Executing ${plan.tasks.size} tasks using stacked branches strategy`);

    const startTime = Date.now();
    const allResults: TaskResult[] = [];
    const worktreeContexts: WorktreeContext[] = [];

    // Determine stack order based on dependencies
    this._stackOrder = this._determineStackOrder([...plan.tasks.values()]);
    this._branchStack = [context.parentRef ?? 'main']; // Start with base branch

    logger.info(`📋 Stack order: ${this._stackOrder.map((t) => t.id).join(' → ')}`);

    // Initialize the VCS stack state
    dependencies.vcsEngine.initializeStackState(context.parentRef ?? 'main');

    try {
      // Create worktrees for all tasks based on the current parent
      const contexts = await dependencies.vcsEngine.createWorktreesForTasks(
        this._stackOrder,
        context.parentRef ?? 'main',
        context.cwd,
      );
      worktreeContexts.push(...contexts);

      // Execute tasks in dependency order, creating stacked branches
      for (const [index, task] of this._stackOrder.entries()) {
        const worktreeContext = worktreeContexts.find((ctx) => ctx.taskId === task.id);

        if (isNonNullish(worktreeContext)) {
          logger.info(`📋 [${index + 1}/${this._stackOrder.length}] Processing task: ${task.id}`);

          // Execute the task
          const result = await this._executeTaskInWorktree(
            task,
            context,
            dependencies,
            worktreeContext,
          );

          allResults.push(result);

          // If task succeeded, add to VCS stack
          if (result.status === 'success') {
            try {
              const parentBranch = this._branchStack.at(-1) ?? 'main';
              const newBranchName = `chopstack/${task.id}`;

              logger.info(`🔄 [${task.id}] Starting branch creation process...`);
              logger.info(`  📍 Parent branch: ${parentBranch}`);
              logger.info(`  🎯 Target branch: ${newBranchName}`);
              logger.info(`  📂 Worktree: ${worktreeContext.worktreePath}`);
              logger.info(`  📂 Main repo: ${context.cwd}`);

              // Get the existing commit from the worktree (already created by task execution)
              logger.info(`  🔍 Looking for existing commit in worktree...`);
              const commitHash = await this._getWorktreeCommitHash(worktreeContext);

              if (commitHash === null) {
                // No existing commit, need to create one
                logger.info(`  📝 No existing commit found, creating new commit in worktree...`);
                const newCommitHash = await dependencies.vcsEngine.commitTaskChanges(
                  task,
                  worktreeContext,
                  { includeAll: true },
                );
                task.commitHash = newCommitHash;
                logger.info(`  ✅ Created commit: ${newCommitHash.slice(0, 7)}`);
              } else {
                // Use existing commit
                task.commitHash = commitHash;
                logger.info(`  ✅ Found existing commit: ${commitHash.slice(0, 7)}`);
              }

              logger.info(`  📌 Set task.commitHash = ${task.commitHash.slice(0, 7)}`);

              // Add task to the stack - VCS engine handles fetching commit and creating branch
              logger.info(`  🌿 Calling addTaskToStack to create branch ${newBranchName}...`);
              await dependencies.vcsEngine.addTaskToStack(task, context.cwd, worktreeContext);
              logger.info(`  ✅ addTaskToStack completed`);

              // Track branch in our stack
              this._branchStack.push(newBranchName);

              logger.info(`✅ [${task.id}] Successfully added to stack:`);
              logger.info(`  🌿 Branch ${newBranchName} stacked on ${parentBranch}`);
              logger.info(`  💾 Commit: ${task.commitHash.slice(0, 7)}`);
              logger.info(`  📊 Current stack: ${this._branchStack.join(' → ')}`);
            } catch (error) {
              logger.error(
                `❌ [${task.id}] Failed to add to stack: ${error instanceof Error ? error.message : String(error)}`,
              );
              if (error instanceof Error && error.stack !== undefined) {
                logger.debug(`Stack trace: ${error.stack}`);
              }
            }
          } else {
            logger.warn(`⚠️ Task ${task.id} failed, skipping branch creation`);

            // Stop execution if this task failed and we're not continuing on error
            if (!context.continueOnError) {
              logger.warn(`🛑 Stopping execution due to task failure: ${task.id}`);
              break;
            }
          }
        } else {
          logger.warn(`⚠️ No worktree context found for task ${task.id}, skipping`);
        }
      }

      // Return the created branches and commits
      const branches = this._branchStack.slice(1); // Exclude the base branch
      const commits = allResults
        .filter((r) => r.status === 'success')
        .map((r) => this._stackOrder.find((t) => t.id === r.taskId)?.commitHash)
        .filter((hash): hash is string => isNonNullish(hash));

      if (branches.length > 0) {
        logger.info(`🌿 Created stacked branch hierarchy: ${this._branchStack.join(' → ')}`);
      }

      return this.createExecutionResult(allResults, startTime, branches, commits);
    } finally {
      // Cleanup worktrees
      if (worktreeContexts.length > 0) {
        try {
          await dependencies.vcsEngine.cleanupWorktrees(worktreeContexts);
          logger.info(`🧹 Cleaned up ${worktreeContexts.length} worktrees`);
        } catch (error) {
          logger.warn(
            `⚠️ Failed to cleanup worktrees: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  override estimateExecutionTime(plan: ExecutionPlan): number {
    // Stacked branches: serial execution time + overhead for branch operations
    const totalTaskTime = [...plan.tasks.values()].reduce(
      (sum, task) => sum + task.estimatedLines * 2,
      0,
    );
    const branchOverhead = plan.tasks.size * 10; // 10 seconds per branch operation
    return totalTaskTime + branchOverhead;
  }

  /**
   * Determine the order in which tasks should be executed based on dependencies
   */
  private _determineStackOrder(tasks: ExecutionTask[]): ExecutionTask[] {
    const ordered: ExecutionTask[] = [];
    const remaining = new Set(tasks);
    const processed = new Set<string>();

    // Keep processing until all tasks are ordered
    while (remaining.size > 0) {
      const readyTasks = [...remaining].filter((task) =>
        task.requires.every((dep) => processed.has(dep)),
      );

      if (readyTasks.length === 0) {
        // Handle circular dependencies or missing dependencies
        const remainingIds = [...remaining].map((t) => t.id);
        logger.warn(
          `⚠️ Circular or missing dependencies detected for tasks: ${remainingIds.join(', ')}`,
        );

        // Add remaining tasks in arbitrary order to avoid infinite loop
        ordered.push(...remaining);
        break;
      }

      // Sort ready tasks by complexity/priority (simplest first for better stack foundation)
      readyTasks.sort((a, b) => a.estimatedLines - b.estimatedLines);

      // Add the first ready task to the order
      const nextTask = readyTasks.at(0);
      if (isNonNullish(nextTask)) {
        ordered.push(nextTask);
        remaining.delete(nextTask);
        processed.add(nextTask.id);
      }
    }

    return ordered;
  }

  /**
   * Get the HEAD commit hash from a worktree
   */
  private async _getWorktreeCommitHash(worktreeContext: WorktreeContext): Promise<string | null> {
    const { execSync } = await import('node:child_process');
    try {
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: worktreeContext.worktreePath,
        encoding: 'utf8',
      }).trim();
      return commitHash;
    } catch (error) {
      logger.debug(
        `No commit found in worktree: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Execute a task in its worktree
   */
  private async _executeTaskInWorktree(
    task: ExecutionTask,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
    worktreeContext: WorktreeContext,
  ): Promise<TaskResult> {
    const taskContext = {
      ...context,
      cwd: worktreeContext.worktreePath,
    };

    const callbacks: {
      onComplete?: (result: TaskResult) => void;
      onError?: (taskId: string, error: Error) => void;
      onStart?: (taskId: string) => void;
    } = {};

    if (isNonNullish(dependencies.onTaskStart)) {
      callbacks.onStart = dependencies.onTaskStart;
    }
    if (isNonNullish(dependencies.onTaskComplete)) {
      callbacks.onComplete = dependencies.onTaskComplete;
    }
    if (isNonNullish(dependencies.onTaskError)) {
      callbacks.onError = dependencies.onTaskError;
    }

    return this.executeTask(task, taskContext, dependencies.orchestrator, callbacks);
  }
}
