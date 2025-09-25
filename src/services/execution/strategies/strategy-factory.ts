import type { ExecutionContext } from '@/core/execution/interfaces';
import type { ExecutionPlan } from '@/core/execution/types';

import { logger } from '@/utils/logger';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

import type { ExecutionStrategy } from './execution-strategy';

import { ParallelExecutionStrategy } from './parallel-strategy';
import { SerialExecutionStrategy } from './serial-strategy';
import { WorktreeExecutionStrategy } from './worktree-strategy';

/**
 * Factory for creating and selecting appropriate execution strategies
 */
export class ExecutionStrategyFactory {
  private readonly strategies: ExecutionStrategy[] = [
    new WorktreeExecutionStrategy(),
    new ParallelExecutionStrategy(),
    new SerialExecutionStrategy(),
  ];

  /**
   * Get all available strategies
   */
  getAllStrategies(): ExecutionStrategy[] {
    return [...this.strategies];
  }

  /**
   * Get strategy by name
   */
  getStrategy(name: string): ExecutionStrategy | null {
    return this.strategies.find((strategy) => strategy.getName() === name) ?? null;
  }

  /**
   * Select the best strategy for the given execution plan and context
   */
  selectStrategy(plan: ExecutionPlan, context: ExecutionContext): ExecutionStrategy {
    // If explicit strategy is specified, use it if available
    if (isNonEmptyString(context.strategy)) {
      const explicitStrategy = this.getStrategy(context.strategy);
      if (isNonNullish(explicitStrategy) && explicitStrategy.canHandle(plan, context)) {
        logger.debug(`Using explicit strategy: ${context.strategy}`);
        return explicitStrategy;
      }
      logger.warn(
        `Requested strategy '${context.strategy}' not available or cannot handle plan, selecting automatically`,
      );
    }

    // Find the best strategy that can handle the plan
    for (const strategy of this.strategies) {
      if (strategy.canHandle(plan, context)) {
        logger.debug(`Selected strategy: ${strategy.getName()}`);
        return strategy;
      }
    }

    // Fallback to serial strategy (should always be able to handle any plan)
    const fallbackStrategy = this.getStrategy('serial');
    if (!isNonNullish(fallbackStrategy)) {
      throw new Error('Serial strategy not found - this should never happen');
    }
    logger.warn(`No optimal strategy found, falling back to: ${fallbackStrategy.getName()}`);
    return fallbackStrategy;
  }

  /**
   * Get execution time estimates for all compatible strategies
   */
  getExecutionEstimates(
    plan: ExecutionPlan,
    context: ExecutionContext,
  ): Array<{
    canHandle: boolean;
    estimatedTime: number;
    strategy: string;
  }> {
    return this.strategies.map((strategy) => ({
      strategy: strategy.getName(),
      estimatedTime: strategy.estimateExecutionTime(plan),
      canHandle: strategy.canHandle(plan, context),
    }));
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(strategy: ExecutionStrategy): void {
    const existingIndex = this.strategies.findIndex((s) => s.getName() === strategy.getName());

    if (existingIndex >= 0) {
      this.strategies[existingIndex] = strategy;
      logger.debug(`Replaced existing strategy: ${strategy.getName()}`);
    } else {
      this.strategies.unshift(strategy); // Add to beginning for priority
      logger.debug(`Registered new strategy: ${strategy.getName()}`);
    }
  }
}

/**
 * Default factory instance
 */
export const executionStrategyFactory = new ExecutionStrategyFactory();
