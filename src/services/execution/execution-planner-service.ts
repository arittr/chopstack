import { cpus } from 'node:os';

import type { ExecutionOptions, ExecutionPlan, ExecutionTask } from '@/core/execution/types';
import type { Plan } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';
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
      mode: options.mode,
      status: 'pending',
      createdAt: new Date(),
      totalTasks: plan.tasks.length,
      vcsMode: options.vcsMode,
    };

    logger.info(
      `📋 Created execution plan with ${executionTasks.size} tasks in ${layers.length} layers using ${options.vcsMode} VCS mode`,
    );

    return executionPlan;
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
}
