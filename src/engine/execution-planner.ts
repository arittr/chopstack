import { execSync } from 'node:child_process';
import { cpus } from 'node:os';

import { match, P } from 'ts-pattern';

import type { Plan } from '../types/decomposer';
import type {
  ExecutionOptions,
  ExecutionPlan,
  ExecutionStrategy,
  ExecutionTask,
  ExecutionValidation,
} from '../types/execution';

import { DagValidator } from '../utils/dag-validator';
import { isNonEmptyArray } from '../utils/guards';

export class ExecutionPlanner {
  determineStrategy(plan: Plan, options: ExecutionOptions): ExecutionStrategy {
    if (options.strategy !== undefined) {
      return options.strategy;
    }

    const metrics = DagValidator.calculateMetrics(plan);
    const validation = DagValidator.validatePlan(plan);

    return match({ metrics, validation, options })
      .with({ validation: { valid: false } }, () => 'serial' as ExecutionStrategy)
      .with({ metrics: { taskCount: 1 } }, () => 'serial' as ExecutionStrategy)
      .with({ options: { parallel: false } }, () => 'serial' as ExecutionStrategy)
      .with({ metrics: { maxParallelization: 1 } }, () => 'serial' as ExecutionStrategy)
      .with(
        { metrics: { estimatedSpeedup: P.number.lte(1.2) } },
        () => 'serial' as ExecutionStrategy,
      )
      .with(
        {
          metrics: {
            maxParallelization: P.number.gte(3),
            estimatedSpeedup: P.number.gte(2),
          },
        },
        () => 'parallel' as ExecutionStrategy,
      )
      .with(
        {
          validation: {
            conflicts: P.when((c): c is string[] => isNonEmptyArray(c)),
          },
        },
        () => 'serial' as ExecutionStrategy,
      )
      .otherwise(() => 'hybrid' as ExecutionStrategy);
  }

  createExecutionPlan(plan: Plan, options: ExecutionOptions): ExecutionPlan {
    const strategy = this.determineStrategy(plan, options);
    const executionTasks = this._createExecutionTasks(plan, options);
    const executionLayers = this._createExecutionLayers(plan, executionTasks);

    return {
      id: this._generatePlanId(),
      mode: options.mode,
      strategy,
      plan,
      tasks: executionTasks,
      executionLayers,
      createdAt: new Date(),
      status: 'pending',
    };
  }

  private _createExecutionTasks(plan: Plan, options: ExecutionOptions): Map<string, ExecutionTask> {
    const tasks = new Map<string, ExecutionTask>();

    for (const task of plan.tasks) {
      const executionTask: ExecutionTask = {
        ...task,
        state: 'pending',
        stateHistory: [
          {
            from: 'pending' as const,
            to: 'pending' as const,
            timestamp: new Date(),
          },
        ],
        retryCount: 0,
        maxRetries: options.retryAttempts ?? 2,
      };

      tasks.set(task.id, executionTask);
    }

    this._updateTaskReadiness(tasks);
    return tasks;
  }

  private _createExecutionLayers(plan: Plan, tasks: Map<string, ExecutionTask>): ExecutionTask[][] {
    const layers = DagValidator.getExecutionLayers(plan);

    return layers.map((layerTasks) =>
      layerTasks
        .map((task) => tasks.get(task.id))
        .filter((task): task is ExecutionTask => task !== undefined),
    );
  }

  private _updateTaskReadiness(tasks: Map<string, ExecutionTask>): void {
    for (const task of tasks.values()) {
      const allDependenciesMet = task.requires.every((depId) => {
        const dep = tasks.get(depId);
        return dep?.state === 'completed';
      });

      if (allDependenciesMet && task.requires.length === 0) {
        this._transitionTaskState(task, 'ready');
      }
    }
  }

  private _transitionTaskState(task: ExecutionTask, newState: ExecutionTask['state']): void {
    const transition = {
      from: task.state,
      to: newState,
      timestamp: new Date(),
    };

    task.stateHistory.push(transition);
    task.state = newState;
  }

  validateExecutionPlan(plan: ExecutionPlan): ExecutionValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    const dagValidation = DagValidator.validatePlan(plan.plan);

    if (!dagValidation.valid) {
      errors.push('Invalid DAG structure');
      if (
        Array.isArray(dagValidation.circularDependencies) &&
        dagValidation.circularDependencies.length > 0
      ) {
        for (const cycle of dagValidation.circularDependencies) {
          errors.push(`Circular dependency: ${cycle}`);
        }
      }
      if (Array.isArray(dagValidation.conflicts) && dagValidation.conflicts.length > 0) {
        for (const conflict of dagValidation.conflicts) {
          warnings.push(`File conflict: ${conflict}`);
        }
      }
    }

    if (plan.strategy === 'parallel' && !this._canRunParallel(plan)) {
      warnings.push('Parallel strategy selected but system resources may be insufficient');
      suggestions.push('Consider using hybrid strategy for better resource utilization');
    }

    const hasGitWorktreeSupport = this._checkGitWorktreeSupport();
    if (!hasGitWorktreeSupport && plan.strategy !== 'serial') {
      errors.push('Git worktree support required for parallel execution');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      canProceed: errors.length === 0,
    };
  }

  getExecutionOrder(plan: ExecutionPlan): ExecutionTask[] {
    return match(plan.strategy)
      .with('serial', () => this._getSerialOrder(plan))
      .with('parallel', () => this._getParallelOrder(plan))
      .with('hybrid', () => this._getHybridOrder(plan))
      .exhaustive();
  }

  private _getSerialOrder(plan: ExecutionPlan): ExecutionTask[] {
    const order = DagValidator.getExecutionOrder(plan.plan);
    return order
      .map((task) => plan.tasks.get(task.id))
      .filter((task): task is ExecutionTask => task !== undefined);
  }

  private _getParallelOrder(plan: ExecutionPlan): ExecutionTask[] {
    return plan.executionLayers.flat();
  }

  private _getHybridOrder(plan: ExecutionPlan): ExecutionTask[] {
    const parallelTasks: ExecutionTask[] = [];
    const serialTasks: ExecutionTask[] = [];

    for (const layer of plan.executionLayers) {
      if (layer.length > 1) {
        parallelTasks.push(...layer);
      } else {
        serialTasks.push(...layer);
      }
    }

    return [...parallelTasks, ...serialTasks];
  }

  estimateExecutionTime(plan: ExecutionPlan): number {
    const avgLinesPerMinute = 50;
    const setupTimePerTask = 30;

    return match(plan.strategy)
      .with('serial', () => {
        const totalLines = [...plan.tasks.values()].reduce(
          (sum, task) => sum + task.estimatedLines,
          0,
        );
        const totalSetup = plan.tasks.size * setupTimePerTask;
        return totalLines / avgLinesPerMinute + totalSetup;
      })
      .with('parallel', () => {
        const criticalPath = this._calculateCriticalPath(plan);
        return criticalPath / avgLinesPerMinute + setupTimePerTask * plan.executionLayers.length;
      })
      .with('hybrid', () => {
        const serialTime = this._estimateSerialTime(plan);
        const parallelTime = this._estimateParallelTime(plan);
        return (serialTime + parallelTime) * 0.8;
      })
      .exhaustive();
  }

  private _calculateCriticalPath(plan: ExecutionPlan): number {
    let maxPath = 0;

    for (const layer of plan.executionLayers) {
      const layerMax = Math.max(...layer.map((task) => task.estimatedLines));
      maxPath += layerMax;
    }

    return maxPath;
  }

  private _estimateSerialTime(plan: ExecutionPlan): number {
    const serialTasks = [...plan.tasks.values()].filter((task) => task.requires.length > 0);
    return serialTasks.reduce((sum, task) => sum + task.estimatedLines, 0) / 50;
  }

  private _estimateParallelTime(plan: ExecutionPlan): number {
    const parallelLayers = plan.executionLayers.filter((layer) => layer.length > 1);
    return (
      parallelLayers.reduce((sum, layer) => {
        const maxInLayer = Math.max(...layer.map((task) => task.estimatedLines));
        return sum + maxInLayer;
      }, 0) / 50
    );
  }

  private _canRunParallel(plan: ExecutionPlan): boolean {
    const maxParallelTasks = Math.max(...plan.executionLayers.map((layer) => layer.length));
    const availableCores = this._getAvailableCores();
    return maxParallelTasks <= availableCores;
  }

  private _getAvailableCores(): number {
    try {
      return Math.max(1, cpus().length - 1);
    } catch {
      return 2;
    }
  }

  private _checkGitWorktreeSupport(): boolean {
    try {
      execSync('git worktree list', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private _generatePlanId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  updateTaskDependencies(plan: ExecutionPlan): void {
    for (const task of plan.tasks.values()) {
      if (task.state !== 'pending' && task.state !== 'blocked') {
        continue;
      }

      const allDependenciesCompleted = task.requires.every((depId) => {
        const dep = plan.tasks.get(depId);
        return dep?.state === 'completed';
      });

      const anyDependencyFailed = task.requires.some((depId) => {
        const dep = plan.tasks.get(depId);
        return dep?.state === 'failed';
      });

      if (anyDependencyFailed) {
        this._transitionTaskState(task, 'blocked');
      } else if (allDependenciesCompleted) {
        this._transitionTaskState(task, 'ready');
      }
    }
  }

  getNextExecutableTasks(plan: ExecutionPlan, maxTasks?: number): ExecutionTask[] {
    const readyTasks = [...plan.tasks.values()].filter((task) => task.state === 'ready');

    const limit = maxTasks ?? readyTasks.length;
    return readyTasks.slice(0, limit);
  }

  canContinueExecution(plan: ExecutionPlan): boolean {
    const hasExecutableTasks = [...plan.tasks.values()].some(
      (task) => task.state === 'ready' || task.state === 'queued',
    );

    const hasRunningTasks = [...plan.tasks.values()].some((task) => task.state === 'running');

    const allTasksFinished = [...plan.tasks.values()].every((task) =>
      ['completed', 'failed', 'skipped', 'blocked'].includes(task.state),
    );

    return (hasExecutableTasks || hasRunningTasks) && !allTasksFinished;
  }
}
