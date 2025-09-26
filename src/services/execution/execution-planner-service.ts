import { cpus } from 'node:os';

import { execaSync } from 'execa';

import type {
  ExecutionOptions,
  ExecutionPlan,
  ExecutionStrategy,
  ExecutionTask,
} from '@/core/execution/types';
import type { Plan } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';
import { DagValidator } from '@/validation/dag-validator';
import { isNonNullish } from '@/validation/guards';

/**
 * Configuration for the execution planner
 */
export type ExecutionPlannerConfig = {
  defaultParallelism?: number;
  maxConcurrency?: number;
  minSpeedupThreshold?: number;
};

/**
 * Interface for execution planning service
 */
export type ExecutionPlannerService = {
  /**
   * Create an execution plan from a decomposed plan
   */
  createExecutionPlan(plan: Plan, options: ExecutionOptions): Promise<ExecutionPlan>;

  /**
   * Determine the best execution strategy for a plan
   */
  determineStrategy(plan: Plan, options: ExecutionOptions): ExecutionStrategy;

  /**
   * Estimate resource requirements for parallel execution
   */
  estimateResourceRequirements(
    plan: Plan,
    strategy: ExecutionStrategy,
  ): Promise<{
    estimatedConcurrency: number;
    estimatedMemoryUsage: number;
    recommendedStrategy: ExecutionStrategy;
  }>;

  /**
   * Optimize execution layers for maximum parallelism
   */
  optimizeExecutionLayers(plan: Plan): ExecutionTask[][];
};

/**
 * Enhanced execution planner service with advanced strategy selection
 * and resource management
 */
export class ExecutionPlannerServiceImpl implements ExecutionPlannerService {
  private readonly config: ExecutionPlannerConfig;

  constructor(config: ExecutionPlannerConfig = {}) {
    this.config = {
      defaultParallelism: cpus().length,
      maxConcurrency: Math.max(2, cpus().length * 2),
      minSpeedupThreshold: 1.3,
      ...config,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async createExecutionPlan(plan: Plan, options: ExecutionOptions): Promise<ExecutionPlan> {
    const strategy = this.determineStrategy(plan, options);

    // Convert tasks to execution tasks
    const executionTasks = new Map<string, ExecutionTask>();

    for (const task of plan.tasks) {
      const executionTask: ExecutionTask = {
        ...task,
        state: 'pending' as const,
        maxRetries: 3,
        retryCount: 0,
        stateHistory: [],
      };
      executionTasks.set(task.id, executionTask);
    }

    // Optimize execution layers - convert tasks to array temporarily
    const layers = this.optimizeExecutionLayers(plan).map((layer) =>
      layer.map((task) => {
        const execTask = executionTasks.get(task.id);
        if (!isNonNullish(execTask)) {
          throw new Error(`Task ${task.id} not found`);
        }
        return execTask;
      }),
    );

    const executionPlan: ExecutionPlan = {
      id: `plan-${Date.now()}`,
      plan: {
        tasks: plan.tasks,
      },
      tasks: executionTasks,
      executionLayers: layers,
      strategy,
      mode: options.mode,
      status: 'pending',
      createdAt: new Date(),
    };

    logger.info(
      `📋 Created execution plan with ${executionTasks.size} tasks in ${layers.length} layers using ${strategy} strategy`,
    );

    return executionPlan;
  }

  determineStrategy(_plan: Plan, options: ExecutionOptions): ExecutionStrategy {
    // Strategy is now required in ExecutionOptions
    logger.info(`🎯 Using strategy: ${options.strategy}`);
    return options.strategy;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async estimateResourceRequirements(
    plan: Plan,
    strategy: ExecutionStrategy,
  ): Promise<{
    estimatedConcurrency: number;
    estimatedMemoryUsage: number;
    recommendedStrategy: ExecutionStrategy;
  }> {
    const metrics = DagValidator.calculateMetrics(plan);

    let estimatedConcurrency = 1;
    let estimatedMemoryUsage = 512; // Base memory in MB

    switch (strategy) {
      case 'serial': {
        estimatedConcurrency = 1;
        estimatedMemoryUsage = 512;
        break;
      }
      case 'parallel': {
        estimatedConcurrency = Math.min(
          metrics.maxParallelization,
          this.config.maxConcurrency ?? 8,
        );
        estimatedMemoryUsage = estimatedConcurrency * 256 + 512;
        break;
      }
      case 'hybrid': {
        estimatedConcurrency = Math.min(
          metrics.maxParallelization,
          Math.floor((this.config.maxConcurrency ?? 8) / 2),
        );
        estimatedMemoryUsage = estimatedConcurrency * 512 + 1024; // Higher memory for worktrees
        break;
      }
      case 'worktree': {
        estimatedConcurrency = Math.min(
          metrics.maxParallelization,
          this.config.maxConcurrency ?? 8,
        );
        estimatedMemoryUsage = estimatedConcurrency * 512 + 1024;
        break;
      }
      default: {
        estimatedConcurrency = Math.min(
          Math.ceil(metrics.maxParallelization / 2),
          this.config.defaultParallelism ?? 4,
        );
        estimatedMemoryUsage = estimatedConcurrency * 384 + 768;
        break;
      }
    }

    // Check system resources and recommend strategy
    const availableCpus = cpus().length;
    let recommendedStrategy = strategy;

    if (estimatedConcurrency > availableCpus * 2) {
      recommendedStrategy = 'hybrid';
      logger.warn(
        `⚠️ High concurrency (${estimatedConcurrency}) detected, recommending hybrid strategy`,
      );
    }

    try {
      const memInfo = execaSync('free', ['-m'], { reject: false });
      if (memInfo.exitCode === 0) {
        const availableMemory = this._parseAvailableMemory(memInfo.stdout);
        if (isNonNullish(availableMemory) && estimatedMemoryUsage > availableMemory * 0.8) {
          recommendedStrategy = 'serial';
          logger.warn(
            `⚠️ High memory usage (${estimatedMemoryUsage}MB) detected, recommending serial strategy`,
          );
        }
      }
    } catch {
      // Memory check failed, continue with current recommendation
    }

    return {
      estimatedConcurrency,
      estimatedMemoryUsage,
      recommendedStrategy,
    };
  }

  optimizeExecutionLayers(plan: Plan): ExecutionTask[][] {
    const tasks = plan.tasks as ExecutionTask[];
    const layers: ExecutionTask[][] = [];
    const completed = new Set<string>();
    const remaining = new Map<string, ExecutionTask>();

    // Initialize remaining tasks
    for (const task of tasks) {
      remaining.set(task.id, task);
    }

    while (remaining.size > 0) {
      const currentLayer: ExecutionTask[] = [];

      // Find tasks that can be executed (all dependencies completed)
      for (const [, task] of remaining) {
        const canExecute = task.requires.every((dep) => completed.has(dep));
        if (canExecute) {
          currentLayer.push(task);
        }
      }

      if (currentLayer.length === 0) {
        // Circular dependency detected
        logger.error('❌ Circular dependency detected in execution optimization');
        break;
      }

      // Remove tasks from remaining and mark as completed
      for (const task of currentLayer) {
        remaining.delete(task.id);
        completed.add(task.id);
      }

      layers.push(currentLayer);
    }

    logger.info(
      `🔄 Optimized execution into ${layers.length} layers with max concurrency of ${Math.max(...layers.map((l) => l.length))}`,
    );

    return layers;
  }

  private _parseAvailableMemory(freeOutput: string): number | null {
    try {
      const lines = freeOutput.split('\n');
      const memLine = lines.find((line) => line.startsWith('Mem:'));
      if (isNonNullish(memLine)) {
        const parts = memLine.split(/\s+/);
        const availableString = parts[6] ?? parts[3] ?? '0';
        const available = Number.parseInt(availableString, 10); // Available or free memory
        return available;
      }
    } catch {
      // Parsing failed
    }
    return null;
  }
}
