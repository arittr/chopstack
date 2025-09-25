import type { ExecutionContext, ExecutionResult, TaskResult } from '@/core/execution/interfaces';
import type { ExecutionPlan, ExecutionTask } from '@/core/execution/types';

import { logger } from '@/utils/logger';
import { isNonNullish } from '@/validation/guards';

import { BaseExecutionStrategy, type ExecutionStrategyDependencies } from './execution-strategy';

/**
 * Serial execution strategy - executes tasks one by one in dependency order
 */
export class SerialExecutionStrategy extends BaseExecutionStrategy {
  constructor() {
    super('serial');
  }

  canHandle(_plan: ExecutionPlan, _context: ExecutionContext): boolean {
    // Serial strategy can handle any plan
    return true;
  }

  async execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult> {
    logger.info(`🔄 Executing ${plan.tasks.size} tasks serially`);

    const startTime = Date.now();
    const results = [];

    for (const task of this._getExecutionOrder(plan)) {
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
      const result = await this.executeTask(task, context, dependencies.orchestrator, callbacks);

      results.push(result);

      // Stop on first failure if not continuing on error
      if (result.status === 'failure' && !context.continueOnError) {
        logger.warn(`⚠️ Stopping execution due to task failure: ${task.id}`);
        break;
      }
    }

    return this.createExecutionResult(results, startTime);
  }

  override estimateExecutionTime(plan: ExecutionPlan): number {
    // Serial execution: sum of all task times
    return [...plan.tasks.values()].reduce((sum, task) => sum + task.estimatedLines * 2, 0);
  }

  /**
   * Get tasks in proper execution order (topological sort)
   */
  private _getExecutionOrder(plan: ExecutionPlan): ExecutionTask[] {
    const tasks = [...plan.tasks.values()];
    const result: ExecutionTask[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) {
        return;
      }
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task: ${taskId}`);
      }

      const task = tasks.find((t) => t.id === taskId);
      if (!isNonNullish(task)) {
        return;
      }

      visiting.add(taskId);

      // Visit dependencies first
      for (const depId of task.requires) {
        visit(depId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      result.push(task);
    };

    // Start with tasks that have no dependencies
    for (const task of tasks) {
      if (task.requires.length === 0) {
        visit(task.id);
      }
    }

    // Visit any remaining tasks (shouldn't happen if DAG is valid)
    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }
}
