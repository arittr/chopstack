import type { ExecutionContext, ExecutionResult, TaskResult } from '@/core/execution/interfaces';
import type { ExecutionPlan, ExecutionTask } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { TaskOrchestrator } from '@/services/orchestration';

import { isNonNullish } from '@/validation/guards';

/**
 * Base interface for execution strategies
 */
export type ExecutionStrategy = {
  /**
   * Check if this strategy can handle the given plan
   */
  canHandle(plan: ExecutionPlan, context: ExecutionContext): boolean;

  /**
   * Get estimated execution time for this strategy
   */
  estimateExecutionTime(plan: ExecutionPlan): number;

  /**
   * Execute tasks using this strategy
   */
  execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult>;

  /**
   * Get strategy name
   */
  getName(): string;
};

/**
 * Dependencies required by execution strategies
 */
export type ExecutionStrategyDependencies = {
  onTaskComplete?: (result: TaskResult) => void;
  onTaskError?: (taskId: string, error: Error) => void;
  onTaskStart?: (taskId: string) => void;
  orchestrator: TaskOrchestrator;
  vcsEngine: VcsEngineService;
};

/**
 * Abstract base class for execution strategies
 */
export abstract class BaseExecutionStrategy implements ExecutionStrategy {
  protected readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  abstract execute(
    plan: ExecutionPlan,
    context: ExecutionContext,
    dependencies: ExecutionStrategyDependencies,
  ): Promise<ExecutionResult>;

  abstract canHandle(plan: ExecutionPlan, context: ExecutionContext): boolean;

  estimateExecutionTime(plan: ExecutionPlan): number {
    // Default implementation - can be overridden by specific strategies
    const totalComplexity = [...plan.tasks.values()].reduce(
      (sum, task) => sum + task.estimatedLines,
      0,
    );
    const baseTimePerLine = 2; // seconds per line (rough estimate)
    return totalComplexity * baseTimePerLine;
  }

  /**
   * Helper method to execute a single task
   */
  protected async executeTask(
    task: ExecutionTask,
    context: ExecutionContext,
    orchestrator: TaskOrchestrator,
    callbacks: {
      onComplete?: (result: TaskResult) => void;
      onError?: (taskId: string, error: Error) => void;
      onStart?: (taskId: string) => void;
    } = {},
  ): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      callbacks.onStart?.(task.id);

      const result = await orchestrator.executeTask(
        task.id,
        task.title,
        task.agentPrompt,
        task.touches,
        context.cwd,
        context.dryRun ? 'plan' : 'execute',
      );

      const taskResult: TaskResult = {
        taskId: task.id,
        status: result.status === 'completed' ? 'success' : 'failure',
        duration: Date.now() - startTime,
        ...(isNonNullish(result.output) && { output: result.output }),
      };

      callbacks.onComplete?.(taskResult);
      return taskResult;
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(task.id, executionError);

      return {
        taskId: task.id,
        status: 'failure',
        duration: Date.now() - startTime,
        error: executionError.message,
      };
    }
  }

  /**
   * Helper method to create execution result
   */
  protected createExecutionResult(
    results: TaskResult[],
    startTime: number,
    branches: string[] = [],
    commits: string[] = [],
  ): ExecutionResult {
    const duration = Date.now() - startTime;

    return {
      totalDuration: duration,
      tasks: results,
      branches,
      commits,
    };
  }
}
