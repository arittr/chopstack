import type {
  ExecuteModeHandler,
  ExecutionContext,
  ExecutionResult,
  TaskResult,
} from '@/core/execution/interfaces';
import type { TaskTransitionManager } from '@/core/execution/task-transitions';
import type { ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { OrchestratorTaskResult, TaskOrchestrator } from '@/services/orchestration';
import type { Task } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';

export class ExecuteModeHandlerImpl implements ExecuteModeHandler {
  private readonly worktreeContexts: Map<string, WorktreeContext> = new Map();
  private readonly executionTasks: Map<string, ExecutionTask> = new Map();

  constructor(
    private readonly _orchestrator: TaskOrchestrator,
    private readonly _vcsEngine: VcsEngineService,
    private readonly _transitionManager: TaskTransitionManager,
  ) {}

  async handle(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult> {
    logger.info(`[chopstack] Executing ${tasks.length} tasks in execute mode`);

    const results: TaskResult[] = [];
    const branches: string[] = [];
    const commits: string[] = [];
    const startTime = Date.now();

    // Initialize VCS engine
    await this._vcsEngine.initialize(context.cwd);

    // Convert tasks to ExecutionTasks and prepare worktrees if needed
    await this._prepareExecution(tasks, context);

    // Initialize the transition manager with all tasks
    this._transitionManager.initialize(tasks);

    // Execute tasks based on state transitions
    while (!this._transitionManager.allTasksComplete()) {
      // Get tasks ready for execution
      const executableTaskIds = this._transitionManager.getExecutableTasks();

      if (executableTaskIds.length === 0) {
        // Check for deadlock or all remaining tasks blocked/failed
        const stats = this._transitionManager.getStatistics();
        if (stats.blocked > 0) {
          logger.error('Execution deadlocked: tasks are blocked but none are ready');
          break;
        }
        if (stats.running === 0) {
          // No tasks running and none ready - we're done
          break;
        }
        // Wait briefly for running tasks to complete
        await new Promise((resolve) => global.setTimeout(resolve, 100));
        continue;
      }

      // Map task IDs to task objects
      const executableTasks = executableTaskIds
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined);

      // Execute the layer of tasks
      const layerResults = await this._executeLayer(executableTasks, context);
      results.push(...layerResults);

      // Collect branch and commit information
      for (const task of executableTasks) {
        const executionTask = this.executionTasks.get(task.id);
        if (executionTask?.commitHash !== undefined) {
          commits.push(executionTask.commitHash);
        }
        const worktreeContext = this.worktreeContexts.get(task.id);
        if (worktreeContext?.branchName !== undefined) {
          branches.push(worktreeContext.branchName);
        }
      }

      // Stop if any task failed and continueOnError is false
      if (!context.continueOnError && layerResults.some((r) => r.status === 'failure')) {
        // Mark remaining tasks as skipped
        for (const task of tasks) {
          const state = this._transitionManager.getTaskState(task.id);
          if (state !== undefined && !['completed', 'failed', 'skipped'].includes(state)) {
            this._transitionManager.skipTask(task.id, 'Execution halted due to previous failure');
          }
        }
        break;
      }
    }

    // Clean up worktrees
    if (this.worktreeContexts.size > 0) {
      await this._vcsEngine.cleanupWorktrees([...this.worktreeContexts.values()]);
    }

    // Build stack if all tasks completed successfully
    if (context.strategy === 'parallel' && results.every((r) => r.status === 'success')) {
      try {
        const executionTasksArray = [...this.executionTasks.values()];
        const stackResult = await this._vcsEngine.buildStackFromTasks(
          executionTasksArray,
          context.cwd,
          { strategy: 'dependency-order' },
        );
        if (stackResult.prUrls !== undefined) {
          logger.info(`Created PR stack with ${stackResult.prUrls.length} PRs`);
        }
      } catch (error) {
        logger.warn('Failed to build stack from tasks:', error as Record<string, unknown>);
      }
    }

    return {
      tasks: results,
      totalDuration: Date.now() - startTime,
      branches: [...new Set(branches)], // Remove duplicates
      commits: [...new Set(commits)], // Remove duplicates
    };
  }

  // This method is no longer needed as TaskTransitionManager handles dependency logic

  private async _executeLayer(layer: Task[], context: ExecutionContext): Promise<TaskResult[]> {
    if (context.strategy === 'serial' || layer.length === 1) {
      return this._executeLayerSerially(layer, context);
    }
    return this._executeLayerInParallel(layer, context);
  }

  private async _executeLayerSerially(
    layer: Task[],
    context: ExecutionContext,
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const task of layer) {
      // Transition task through states: ready -> queued -> running
      this._transitionManager.startTask(task.id); // ready -> queued
      this._transitionManager.transitionTask(task.id, 'running', 'Executing task'); // queued -> running

      const result = await this._executeTask(task, context);
      results.push(result);

      // Update task state based on result
      switch (result.status) {
        case 'success': {
          this._transitionManager.completeTask(task.id);

          break;
        }
        case 'failure': {
          const shouldRetry = this._shouldRetryTask(task, context);
          if (shouldRetry) {
            this._transitionManager.retryTask(task.id);
            // Re-execute the task
            const retryResult = await this._executeTask(task, context);
            results[results.length - 1] = retryResult;
            if (retryResult.status === 'success') {
              this._transitionManager.completeTask(task.id);
            } else {
              this._transitionManager.failTask(
                task.id,
                retryResult.error ?? 'Task failed after retry',
              );
            }
          } else {
            this._transitionManager.failTask(task.id, result.error ?? 'Task execution failed');
          }

          break;
        }
        case 'skipped': {
          this._transitionManager.skipTask(task.id, 'Task was skipped');

          break;
        }
        // No default
      }

      if (result.status === 'failure' && !context.continueOnError) {
        break;
      }
    }

    return results;
  }

  private async _executeLayerInParallel(
    layer: Task[],
    context: ExecutionContext,
  ): Promise<TaskResult[]> {
    const promises = layer.map(async (task) => {
      // Transition task through states: ready -> queued -> running
      this._transitionManager.startTask(task.id); // ready -> queued
      this._transitionManager.transitionTask(task.id, 'running', 'Executing task'); // queued -> running

      const result = await this._executeTask(task, context);

      // Update task state based on result
      switch (result.status) {
        case 'success': {
          this._transitionManager.completeTask(task.id);

          break;
        }
        case 'failure': {
          const shouldRetry = this._shouldRetryTask(task, context);
          if (shouldRetry) {
            this._transitionManager.retryTask(task.id);
            // Re-execute the task
            const retryResult = await this._executeTask(task, context);
            if (retryResult.status === 'success') {
              this._transitionManager.completeTask(task.id);
              return retryResult;
            }
            this._transitionManager.failTask(
              task.id,
              retryResult.error ?? 'Task failed after retry',
            );
            return retryResult;
          }
          this._transitionManager.failTask(task.id, result.error ?? 'Task execution failed');

          break;
        }
        case 'skipped': {
          this._transitionManager.skipTask(task.id, 'Task was skipped');

          break;
        }
        // No default
      }

      return result;
    });

    return Promise.all(promises);
  }

  private async _executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const taskStart = Date.now();

    try {
      const result: OrchestratorTaskResult = await this._orchestrator.executeTask(
        task.id,
        task.title,
        task.agentPrompt,
        task.touches,
        context.cwd,
        'execute',
        context.agentType,
      );

      // Trigger VCS commit if task completed successfully
      if (result.status === 'completed' && result.output !== undefined) {
        try {
          await this._handleVcsCommit(task, context);
        } catch (vcsError) {
          logger.warn(
            `Failed to commit changes for task ${task.id}:`,
            vcsError as Record<string, unknown>,
          );
        }
      }

      return {
        taskId: task.id,
        status: result.status === 'completed' ? 'success' : 'failure',
        duration: Date.now() - taskStart,
        ...(result.output !== undefined && { output: result.output }),
      };
    } catch (error) {
      return {
        taskId: task.id,
        status: 'failure',
        duration: Date.now() - taskStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private _shouldRetryTask(task: Task, context: ExecutionContext): boolean {
    // Get current retry count from task transitions
    const transitions = this._transitionManager.getTaskTransitions(task.id);
    const retryCount = transitions.filter((t) => t.from === 'failed' && t.to === 'queued').length;

    return retryCount < context.maxRetries;
  }

  private async _prepareExecution(tasks: Task[], context: ExecutionContext): Promise<void> {
    // Convert tasks to ExecutionTasks
    for (const task of tasks) {
      const executionTask: ExecutionTask = {
        ...task,
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: context.maxRetries,
      };
      this.executionTasks.set(task.id, executionTask);
    }

    // Create worktrees for parallel execution if needed
    if (context.strategy === 'parallel') {
      try {
        const execTasks = [...this.executionTasks.values()];
        const worktreeContexts = await this._vcsEngine.createWorktreesForTasks(
          execTasks,
          'HEAD',
          context.cwd,
        );
        for (const worktreeContext of worktreeContexts) {
          this.worktreeContexts.set(worktreeContext.taskId, worktreeContext);
          // Update execution task with worktree directory
          const executionTask = this.executionTasks.get(worktreeContext.taskId);
          if (executionTask !== undefined) {
            executionTask.worktreeDir = worktreeContext.absolutePath;
          }
        }
      } catch (error) {
        logger.warn(
          'Failed to create worktrees, falling back to serial execution:',
          error as Record<string, unknown>,
        );
      }
    }
  }

  private async _handleVcsCommit(task: Task, context: ExecutionContext): Promise<void> {
    const executionTask = this.executionTasks.get(task.id);
    if (executionTask === undefined) {
      logger.warn(`No execution task found for ${task.id}`);
      return;
    }

    const worktreeContext = this.worktreeContexts.get(task.id);
    const workdir = worktreeContext?.absolutePath ?? context.cwd;

    try {
      // Commit changes using VCS engine
      const commitHash = await this._vcsEngine.commitTaskChanges(
        executionTask,
        worktreeContext ?? {
          taskId: task.id,
          branchName: `task-${task.id}`,
          baseRef: 'HEAD',
          absolutePath: workdir,
          worktreePath: workdir,
          created: new Date(),
        },
        {
          generateMessage: true,
          includeAll: true,
        },
      );

      // Update execution task with commit hash
      executionTask.commitHash = commitHash;
      logger.info(`Committed changes for task ${task.id}: ${commitHash}`);
    } catch (error) {
      logger.warn(
        `Failed to commit changes for task ${task.id}:`,
        error as Record<string, unknown>,
      );
    }
  }
}
