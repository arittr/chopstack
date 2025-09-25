import type { ExecutionContext, ExecutionResult, TaskResult } from '@/core/execution/interfaces';
import type { ExecutionPlan } from '@/types/execution';

import { logger } from '@/utils/logger';
import { isNonNullish } from '@/validation/guards';

import { BaseExecutionStrategy, type ExecutionStrategyDependencies } from './execution-strategy';

/**
 * Parallel execution strategy - executes tasks in parallel by dependency layers
 */
export class ParallelExecutionStrategy extends BaseExecutionStrategy {
  constructor() {
    super('parallel');
  }

  canHandle(plan: ExecutionPlan, context: ExecutionContext): boolean {
    // Check if parallel execution is enabled and beneficial
    return context.strategy === 'parallel' && plan.executionLayers.length > 1;
  }

  async execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult> {
    logger.info(
      `🚀 Executing ${plan.tasks.size} tasks in parallel across ${plan.executionLayers.length} layers`,
    );

    const startTime = Date.now();
    const allResults: TaskResult[] = [];
    let shouldContinue = true;

    for (const [layerIndex, layer] of plan.executionLayers.entries()) {
      if (!shouldContinue) {
        break;
      }

      logger.info(
        `⚡ Processing layer ${layerIndex + 1}/${plan.executionLayers.length} (${layer.length} tasks)`,
      );

      // Execute all tasks in the current layer in parallel
      const layerPromises = layer.map(async (task) => {
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
        return this.executeTask(task, context, dependencies.orchestrator, callbacks);
      });

      const layerResults = await Promise.all(layerPromises);
      allResults.push(...layerResults);

      // Check for failures
      const failures = layerResults.filter((r) => r.status === 'failure');
      if (failures.length > 0 && !context.continueOnError) {
        logger.warn(
          `⚠️ ${failures.length} tasks failed in layer ${layerIndex + 1}, stopping execution`,
        );
        shouldContinue = false;
      }
    }

    return this.createExecutionResult(allResults, startTime);
  }

  override estimateExecutionTime(plan: ExecutionPlan): number {
    // Parallel execution: max time across all layers
    return plan.executionLayers.reduce((maxTime, layer) => {
      const layerMaxTime = Math.max(...layer.map((task) => task.estimatedLines * 2));
      return maxTime + layerMaxTime;
    }, 0);
  }
}
