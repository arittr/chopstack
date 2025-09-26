import type { ExecutionContext, ExecutionResult, TaskResult } from '@/core/execution/interfaces';
import type { ExecutionPlan, ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';

import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

import { BaseExecutionStrategy, type ExecutionStrategyDependencies } from './execution-strategy';

/**
 * Worktree execution strategy - uses git worktrees for parallel execution with isolation
 */
export class WorktreeExecutionStrategy extends BaseExecutionStrategy {
  constructor() {
    super('worktree');
  }

  canHandle(_plan: ExecutionPlan, context: ExecutionContext): boolean {
    // Check if worktree execution is needed (parallel strategy with potential conflicts)
    return context.strategy === 'parallel';
  }

  async execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult> {
    logger.info(`🌳 Executing ${plan.tasks.size} tasks using git worktrees for isolation`);

    const startTime = Date.now();
    const allResults: TaskResult[] = [];
    const worktreeContexts: WorktreeContext[] = [];

    try {
      // Analyze worktree needs
      const analysis = await dependencies.vcsEngine.analyzeWorktreeNeeds(
        [...plan.tasks.values()],
        context.cwd,
      );

      logger.info(
        `📊 Worktree analysis: ${analysis.maxConcurrentTasks} max concurrent, ${analysis.parallelLayers} layers`,
      );

      // Create worktrees for tasks that need isolation
      const tasksNeedingWorktrees = this._identifyTasksNeedingWorktrees(plan);

      if (tasksNeedingWorktrees.length > 0) {
        const contexts = await dependencies.vcsEngine.createWorktreesForTasks(
          tasksNeedingWorktrees,
          'HEAD', // Base ref
          context.cwd,
        );
        worktreeContexts.push(...contexts);
      }

      // Execute tasks layer by layer with worktree isolation
      let shouldContinue = true;

      for (const [layerIndex, layer] of plan.executionLayers.entries()) {
        if (!shouldContinue) {
          break;
        }

        logger.info(
          `🔄 Processing layer ${layerIndex + 1}/${plan.executionLayers.length} with worktree isolation`,
        );

        // Execute tasks in parallel within the layer, using worktrees where needed
        const layerPromises = layer.map(async (task) =>
          this._executeTaskWithWorktree(
            task,
            context,
            dependencies,
            worktreeContexts.find((ctx) => ctx.taskId === task.id),
          ),
        );

        const layerResults = await Promise.all(layerPromises);
        allResults.push(...layerResults);

        // Commit successful tasks
        await this._commitCompletedTasks(layerResults, worktreeContexts, dependencies);

        // Check for failures
        const failures = layerResults.filter((r) => r.status === 'failure');
        if (failures.length > 0 && !context.continueOnError) {
          logger.warn(
            `⚠️ ${failures.length} tasks failed in layer ${layerIndex + 1}, stopping execution`,
          );
          shouldContinue = false;
        }
      }

      // Build git-spice stack if enabled
      let branches: string[] = [];
      let commits: string[] = [];

      if (context.strategy === 'parallel' && !context.dryRun) {
        try {
          const completedTasks = [...plan.tasks.values()].filter((task) =>
            allResults.some((r) => r.taskId === task.id && r.status === 'success'),
          );

          if (completedTasks.length > 0) {
            const stackInfo = await dependencies.vcsEngine.buildStackFromTasks(
              completedTasks,
              context.cwd,
              {
                parentRef: 'main',
                strategy: 'dependency-order',
                submitStack: false, // Don't auto-submit in worktree mode
              },
            );

            branches = stackInfo.branches.map((b) => b.branchName);
            commits = stackInfo.branches.map((b) => b.commitHash);

            logger.info(`📚 Created git-spice stack with ${branches.length} branches`);
          }
        } catch (error) {
          logger.warn(
            `⚠️ Failed to create git-spice stack: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
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
    // Worktree execution: parallel time + overhead for worktree creation/cleanup
    const baseTime = plan.executionLayers.reduce((maxTime, layer) => {
      const layerMaxTime = Math.max(...layer.map((task) => task.estimatedLines * 2));
      return maxTime + layerMaxTime;
    }, 0);

    const worktreeOverhead = plan.tasks.size * 5; // 5 seconds per worktree overhead
    return baseTime + worktreeOverhead;
  }

  /**
   * Execute a single task with worktree context if available
   */
  private async _executeTaskWithWorktree(
    task: ExecutionTask,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
    worktreeContext?: WorktreeContext,
  ): Promise<TaskResult> {
    const workdir = isNonNullish(worktreeContext) ? worktreeContext.worktreePath : context.cwd;

    const taskContext = {
      ...context,
      cwd: workdir,
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

  /**
   * Identify tasks that need worktree isolation based on file conflicts
   */
  private _identifyTasksNeedingWorktrees(plan: ExecutionPlan): ExecutionTask[] {
    // For now, all tasks get worktrees when using this strategy
    // In the future, we could analyze file conflicts to determine which tasks need isolation
    return [...plan.tasks.values()];
  }

  /**
   * Commit completed tasks in their worktrees
   */
  private async _commitCompletedTasks(
    results: TaskResult[],
    worktreeContexts: WorktreeContext[],
    dependencies: ExecutionStrategyDependencies,
  ): Promise<void> {
    const successfulResults = results.filter((r) => r.status === 'success');

    for (const result of successfulResults) {
      const context = worktreeContexts.find((ctx) => ctx.taskId === result.taskId);
      if (isNonNullish(context)) {
        try {
          // Find the original task
          const task = { id: result.taskId } as ExecutionTask; // Simplified for commit

          await dependencies.vcsEngine.commitTaskChanges(task, context, {
            generateMessage: true,
          });

          logger.debug(`📝 Committed changes for task ${result.taskId}`);
        } catch (error) {
          logger.warn(
            `⚠️ Failed to commit task ${result.taskId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }
}
