import type {
  ExecuteModeHandler,
  ExecutionContext,
  ExecutionResult,
  TaskResult,
} from '@/core/execution/interfaces';
import type { TaskTransitionManager } from '@/core/execution/task-transitions';
import type { ExecutionTask } from '@/core/execution/types';
import type {
  TaskCommitResult,
  VcsStrategy,
  VcsStrategyContext,
  WorktreeContext,
} from '@/core/vcs/vcs-strategy';
import type { OrchestratorTaskResult, TaskOrchestrator } from '@/services/orchestration';
import type { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';
import type { Task } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';
import { isDefined, isNonEmptyString, isNonNullish } from '@/validation/guards';

export class ExecuteModeHandlerImpl implements ExecuteModeHandler {
  private _worktreeContexts: Map<string, WorktreeContext> = new Map();
  private readonly executionTasks: Map<string, ExecutionTask> = new Map();
  private _vcsStrategy: VcsStrategy | null = null;

  constructor(
    private readonly _orchestrator: TaskOrchestrator,
    private readonly _vcsStrategyFactory: VcsStrategyFactory,
    private readonly _transitionManager: TaskTransitionManager,
  ) {}

  async handle(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult> {
    logger.info(
      `[chopstack] Executing ${tasks.length} tasks in execute mode with VCS mode: ${context.vcsMode}`,
    );

    const results: TaskResult[] = [];
    const startTime = Date.now();

    // Create VCS strategy
    this._vcsStrategy = this._vcsStrategyFactory.create(context.vcsMode);

    // Create VCS strategy context
    const vcsContext: VcsStrategyContext = {
      cwd: context.cwd,
      baseRef: context.parentRef ?? 'HEAD',
    };

    // Initialize VCS strategy
    await this._vcsStrategy.initialize(tasks, vcsContext);

    // Convert tasks to ExecutionTasks
    this._prepareExecution(tasks, context);

    // Let VCS strategy prepare execution contexts (e.g., worktrees)
    if (isNonNullish(this._vcsStrategy)) {
      const executionTasksArray = [...this.executionTasks.values()];
      this._worktreeContexts = await this._vcsStrategy.prepareTaskExecutionContexts(
        executionTasksArray,
        vcsContext,
      );

      // Update execution tasks with worktree directories now that they're available
      for (const [taskId, worktreeContext] of this._worktreeContexts) {
        const executionTask = this.executionTasks.get(taskId);
        if (isNonNullish(executionTask)) {
          executionTask.worktreeDir = worktreeContext.absolutePath;
          logger.debug(`Task ${taskId} will execute in worktree: ${worktreeContext.absolutePath}`);
        }
      }
    }

    // Initialize the transition manager with all tasks
    this._transitionManager.initialize(tasks);

    // Execute tasks based on state transitions
    while (!this._transitionManager.allTasksComplete()) {
      // Get tasks ready for execution
      const executableTaskIds = this._transitionManager.getExecutableTasks();

      logger.debug(`[chopstack] Executable tasks: ${executableTaskIds.join(', ')}`);

      if (executableTaskIds.length === 0) {
        // Check for deadlock or all remaining tasks blocked/failed
        const stats = this._transitionManager.getStatistics();
        logger.debug(`[chopstack] Task stats: ${JSON.stringify(stats)}`);
        if (stats.blocked > 0) {
          logger.error('Execution deadlocked: tasks are blocked but none are ready');
          // Add blocked tasks as skipped to results
          for (const task of tasks) {
            const state = this._transitionManager.getTaskState(task.id);
            if (state === 'blocked') {
              const existingResult = results.find((r) => r.taskId === task.id);
              if (!isDefined(existingResult)) {
                results.push({
                  taskId: task.id,
                  status: 'skipped',
                  duration: 0,
                  error: 'Task blocked due to failed dependencies',
                });
              }
            }
          }
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

      logger.info(`[chopstack] Executing ${executableTasks.length} tasks in parallel`);

      // Execute the layer of tasks (always smart parallel)
      const layerResults = await this._executeLayer(executableTasks, context);
      results.push(...layerResults);

      // Stop if any task failed and continueOnError is false
      if (!context.continueOnError && layerResults.some((r) => r.status === 'failure')) {
        // Mark remaining tasks as skipped and add them to results
        for (const task of tasks) {
          const state = this._transitionManager.getTaskState(task.id);
          if (isDefined(state) && !['completed', 'failed', 'skipped'].includes(state)) {
            this._transitionManager.skipTask(task.id, 'Execution halted due to previous failure');
            // Add skipped task to results
            results.push({
              taskId: task.id,
              status: 'skipped',
              duration: 0,
              error: 'Execution halted due to previous failure',
            });
          }
        }
        break;
      }
    }

    // After the loop, add any remaining tasks that weren't executed as skipped
    for (const task of tasks) {
      const existingResult = results.find((r) => r.taskId === task.id);
      if (existingResult === undefined) {
        const state = this._transitionManager.getTaskState(task.id);
        // Only add if the task was in a non-terminal state
        if (isDefined(state) && !['completed', 'failed', 'skipped'].includes(state)) {
          results.push({
            taskId: task.id,
            status: 'skipped',
            duration: 0,
            error:
              state === 'blocked'
                ? 'Task blocked due to failed dependencies'
                : 'Execution halted before task could run',
          });
        }
      }
    }

    // Finalize VCS operations and get branches/commits
    let branches: string[] = [];
    let commits: string[] = [];

    if (isNonNullish(this._vcsStrategy)) {
      // Collect commit results from completed tasks
      const commitResults = await Promise.all(
        tasks
          .filter((task) => {
            const state = this._transitionManager.getTaskState(task.id);
            return state === 'completed';
          })
          .map((task) => {
            const executionTask = this.executionTasks.get(task.id);
            const result: TaskCommitResult = { taskId: task.id };
            if (isNonEmptyString(executionTask?.commitHash)) {
              result.commitHash = executionTask.commitHash;
            }
            if (isNonEmptyString(executionTask?.branchName)) {
              result.branchName = executionTask.branchName;
            }
            return result;
          }),
      );

      const finalizeResult = await this._vcsStrategy.finalize(commitResults, vcsContext);
      ({ branches, commits } = finalizeResult);

      // Clean up
      await this._vcsStrategy.cleanup();
    }

    return {
      tasks: results,
      totalDuration: Date.now() - startTime,
      branches,
      commits,
    };
  }

  // This method is no longer needed as TaskTransitionManager handles dependency logic

  private async _executeLayer(layer: Task[], context: ExecutionContext): Promise<TaskResult[]> {
    // Always run smart parallel execution based on DAG
    if (layer.length === 1) {
      // Single task can be run "serially" (it's just one task)
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
      // Properly transition through states: ready -> queued -> running
      const currentState = this._transitionManager.getTaskState(task.id);
      if (currentState === 'ready') {
        this._transitionManager.transitionTask(task.id, 'queued', 'Starting task');
        this._transitionManager.transitionTask(task.id, 'running', 'Executing task serially');
      } else {
        logger.warn(`Task ${task.id} is in unexpected state: ${currentState}`);
      }

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
    // Transition all tasks to running state BEFORE starting async execution
    for (const task of layer) {
      // Properly transition through states: ready -> queued -> running
      const currentState = this._transitionManager.getTaskState(task.id);
      if (currentState === 'ready') {
        this._transitionManager.transitionTask(task.id, 'queued', 'Starting task');
        this._transitionManager.transitionTask(task.id, 'running', 'Executing task in parallel');
      } else {
        logger.warn(`Task ${task.id} is in unexpected state: ${currentState}`);
      }
    }

    logger.debug(`[chopstack] Starting parallel execution of ${layer.length} tasks`);

    const promises = layer.map(async (task) => {
      logger.debug(`[chopstack] Executing task ${task.id} in worktree`);
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
      const executionTask = this.executionTasks.get(task.id);
      if (!isNonNullish(executionTask)) {
        throw new Error(`ExecutionTask not found for task ${task.id}`);
      }

      // Prepare task execution context (create worktree if needed for stacked strategy)
      if (
        isNonNullish(this._vcsStrategy) &&
        typeof this._vcsStrategy.prepareTaskExecution === 'function'
      ) {
        const vcsContext = {
          cwd: context.cwd,
          baseRef: context.parentRef ?? 'HEAD',
        };

        const worktreeContext = await this._vcsStrategy.prepareTaskExecution(
          task,
          executionTask,
          vcsContext,
        );

        if (isNonNullish(worktreeContext)) {
          // Update execution task with worktree directory
          executionTask.worktreeDir = worktreeContext.absolutePath;
          // Also update our worktree contexts map
          this._worktreeContexts.set(task.id, worktreeContext);
          logger.debug(`Task ${task.id} prepared with worktree: ${worktreeContext.absolutePath}`);
        }
      }

      // Use worktree directory if available, otherwise use context.cwd
      const workdir = executionTask.worktreeDir ?? context.cwd;

      logger.debug(
        `[chopstack] Task ${task.id}: Calling orchestrator.executeTask with workdir: ${workdir}`,
      );

      const result: OrchestratorTaskResult = await this._orchestrator.executeTask(
        task.id,
        task.title,
        task.agentPrompt,
        task.touches,
        workdir,
        'execute',
        context.agentType,
      );

      logger.debug(`[chopstack] Task ${task.id}: Orchestrator returned status: ${result.status}`);

      // Trigger VCS commit if task completed successfully
      if (
        result.status === 'completed' &&
        result.output !== undefined &&
        isNonNullish(this._vcsStrategy)
      ) {
        try {
          const executionTask = this.executionTasks.get(task.id);
          const worktreeContext = this._worktreeContexts.get(task.id);

          if (isNonNullish(executionTask)) {
            // For tasks running in main repo (no worktree), create a dummy worktree context
            const contextForCommit = worktreeContext ?? {
              taskId: task.id,
              branchName: `tmp-chopstack/${task.id}`,
              worktreePath: context.cwd,
              absolutePath: context.cwd,
              baseRef: context.parentRef ?? 'main',
              created: new Date(),
            };

            const commitResult = await this._vcsStrategy.handleTaskCompletion(
              task,
              executionTask,
              contextForCommit,
              result.output,
            );

            if (isNonEmptyString(commitResult.commitHash)) {
              executionTask.commitHash = commitResult.commitHash;
              logger.info(`Task ${task.id} committed: ${commitResult.commitHash.slice(0, 7)}`);
            }
            if (isNonEmptyString(commitResult.branchName)) {
              executionTask.branchName = commitResult.branchName;
            }
            if (isNonEmptyString(commitResult.error)) {
              logger.warn(`Failed to commit task ${task.id}: ${commitResult.error}`);
            }
          }
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

  private _prepareExecution(tasks: Task[], context: ExecutionContext): void {
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
  }
}
