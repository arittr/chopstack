import { EventEmitter } from 'node:events';

import chalk from 'chalk';
import { match } from 'ts-pattern';

import type {
  ExecutionEvent,
  ExecutionMetrics,
  ExecutionPlan,
  ExecutionProgressUpdate,
  ExecutionTask,
  TaskState,
} from '@/types/execution';

import {
  createProgressLine,
  ProgressFormatter,
  TaskProgressManager,
} from '@/planning/progress-formatter';
import { logger } from '@/utils/logger';

import { StateManager } from './state-manager';

export class ExecutionMonitor extends EventEmitter {
  private readonly stateManager: StateManager;
  private readonly metricsHistory: Map<string, ExecutionMetrics[]>;
  private readonly startTimes: Map<string, number>;
  private readonly progressManager: TaskProgressManager;
  private readonly formatter: ProgressFormatter;

  constructor() {
    super();
    this.stateManager = new StateManager();
    this.metricsHistory = new Map();
    this.startTimes = new Map();
    this.progressManager = new TaskProgressManager();
    this.formatter = new ProgressFormatter();
  }

  startMonitoring(plan: ExecutionPlan): void {
    this.startTimes.set(plan.id, Date.now());
    this.metricsHistory.set(plan.id, []);

    this._emitEvent({
      type: 'execution_start',
      timestamp: new Date(),
      planId: plan.id,
      data: {
        mode: plan.mode,
        strategy: plan.strategy,
        taskCount: plan.tasks.size,
      },
    });

    this.captureMetrics(plan);
  }

  stopMonitoring(plan: ExecutionPlan): void {
    const duration = this._calculateDuration(plan.id);

    this._emitEvent({
      type: 'execution_complete',
      timestamp: new Date(),
      planId: plan.id,
      data: {
        duration,
        metrics: this._calculateFinalMetrics(plan),
      },
    });

    this._cleanup(plan.id);
  }

  onTaskStateChange(
    plan: ExecutionPlan,
    task: ExecutionTask,
    oldState: TaskState,
    newState: TaskState,
  ): void {
    this._emitEvent({
      type: 'task_state_change',
      timestamp: new Date(),
      planId: plan.id,
      taskId: task.id,
      data: {
        taskTitle: task.title,
        oldState,
        newState,
        duration: task.duration,
      },
    });

    match(newState)
      .with('running', () => {
        this._logTaskStart(plan, task);
      })
      .with('completed', () => {
        this._logTaskCompletion(task);
      })
      .with('failed', () => {
        this._logTaskFailure(task);
      })
      .otherwise(() => {});

    this.updateProgress(plan);
    this.captureMetrics(plan);
  }

  private _logTaskStart(plan: ExecutionPlan, task: ExecutionTask): void {
    const currentLayer = this._getCurrentLayer(plan);
    const totalLayers = plan.executionLayers.length;
    const layerInfo = chalk.cyan(`Layer ${currentLayer}/${totalLayers}`);

    this.progressManager.startTask(task.id, `${layerInfo} ${chalk.bold(task.id)} - ${task.title}`);
  }

  private _logTaskCompletion(task: ExecutionTask): void {
    const durationInSeconds =
      typeof task.duration === 'number' && !Number.isNaN(task.duration)
        ? (task.duration / 1000).toFixed(1)
        : undefined;
    const duration = durationInSeconds !== undefined ? `${durationInSeconds}s` : 'unknown';

    this.progressManager.completeTask(
      task.id,
      `${chalk.bold(task.id)} complete ${chalk.dim(`(${duration})`)}`,
    );
  }

  private _logTaskFailure(task: ExecutionTask): void {
    const errorMessage = this._formatErrorMessage(task.error);

    this.progressManager.failTask(
      task.id,
      `${chalk.bold(task.id)} failed: ${chalk.red(errorMessage)}`,
    );

    if (task.retryCount < task.maxRetries) {
      logger.info(
        chalk.yellow(`⟳ Will retry ${task.id} (attempt ${task.retryCount + 1}/${task.maxRetries})`),
      );
    }
  }

  private _formatErrorMessage(error: unknown): string {
    if (error === null || error === undefined) {
      return 'Unknown error';
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object') {
      return JSON.stringify(error, null, 2);
    }
    return JSON.stringify(error);
  }

  updateProgress(plan: ExecutionPlan): void {
    const progress = this._calculateProgress(plan);

    this._emitEvent({
      type: 'progress_update',
      timestamp: new Date(),
      planId: plan.id,
      data: progress,
    });

    this._logProgress(progress);
  }

  private _calculateProgress(plan: ExecutionPlan): ExecutionProgressUpdate {
    const stats = this.stateManager.getExecutionStats(plan.tasks);
    const currentLayer = this._getCurrentLayer(plan);
    const totalLayers = plan.executionLayers.length;

    const tasksInProgress = [...plan.tasks.values()]
      .filter((t) => t.state === 'running')
      .map((t) => t.id);

    const tasksCompleted = [...plan.tasks.values()]
      .filter((t) => t.state === 'completed')
      .map((t) => t.id);

    const tasksFailed = [...plan.tasks.values()]
      .filter((t) => t.state === 'failed' && t.retryCount >= t.maxRetries)
      .map((t) => t.id);

    const estimatedTimeRemaining = this._estimateTimeRemaining(plan);

    const progressPercentage = this.stateManager.calculateProgress(plan.tasks).percentage;

    return {
      planId: plan.id,
      currentLayer,
      totalLayers,
      tasksInProgress,
      tasksCompleted,
      tasksFailed,
      estimatedTimeRemaining,
      message: `Progress: ${progressPercentage}% (${stats.completed}/${plan.tasks.size} tasks)`,
    };
  }

  private _getCurrentLayer(plan: ExecutionPlan): number {
    for (let index = 0; index < plan.executionLayers.length; index++) {
      const layer = plan.executionLayers[index];
      if (layer === undefined) {
        continue;
      }

      const allCompleted = layer.every((task) => this.stateManager.isTerminalState(task.state));

      if (!allCompleted) {
        return index + 1;
      }
    }

    return plan.executionLayers.length;
  }

  private _estimateTimeRemaining(plan: ExecutionPlan): number {
    const completedTasks = [...plan.tasks.values()].filter((t) => t.state === 'completed');

    if (completedTasks.length === 0) {
      return -1;
    }

    const avgDuration =
      completedTasks.reduce((sum, t) => sum + (t.duration ?? 0), 0) / completedTasks.length;

    const remainingTasks = [...plan.tasks.values()].filter(
      (t) => !this.stateManager.isTerminalState(t.state),
    );

    return Math.round((remainingTasks.length * avgDuration) / 1000);
  }

  private _logProgress(progress: ExecutionProgressUpdate): void {
    const {
      currentLayer,
      totalLayers,
      tasksInProgress,
      tasksCompleted,
      tasksFailed,
      estimatedTimeRemaining,
    } = progress;

    const totalTasks = tasksInProgress.length + tasksCompleted.length + tasksFailed.length;

    if (totalTasks > 0) {
      const progressLine = createProgressLine(
        tasksCompleted.length,
        totalTasks,
        tasksInProgress,
        tasksFailed.length,
        currentLayer,
        totalLayers,
        estimatedTimeRemaining ?? -1,
      );

      this.progressManager.updateMainProgress(progressLine);
    }
  }

  captureMetrics(plan: ExecutionPlan): void {
    const metrics = this._calculateMetrics(plan);
    const history = this.metricsHistory.get(plan.id) ?? [];
    history.push(metrics);
    this.metricsHistory.set(plan.id, history);
  }

  private _calculateMetrics(plan: ExecutionPlan): ExecutionMetrics {
    const stats = this.stateManager.getExecutionStats(plan.tasks);
    const completedTasks = [...plan.tasks.values()].filter((t) => t.state === 'completed');

    const totalDuration = this._calculateDuration(plan.id);
    const avgTaskDuration =
      completedTasks.length > 0
        ? completedTasks.reduce((sum, t) => sum + (t.duration ?? 0), 0) / completedTasks.length
        : 0;

    const parallelizationEfficiency = this._calculateParallelizationEfficiency(plan);
    const criticalPathDuration = this._calculateCriticalPathDuration(plan);

    return {
      taskCount: plan.tasks.size,
      completedCount: stats.completed,
      failedCount: stats.failed,
      skippedCount: stats.skipped,
      totalDuration,
      averageTaskDuration: avgTaskDuration,
      parallelizationEfficiency,
      criticalPathDuration,
    };
  }

  private _calculateParallelizationEfficiency(plan: ExecutionPlan): number {
    if (plan.strategy === 'serial') {
      return 1;
    }

    const serialTime = [...plan.tasks.values()].reduce((sum, t) => sum + (t.duration ?? 0), 0);

    const actualTime = this._calculateDuration(plan.id);

    return actualTime > 0 ? serialTime / actualTime : 1;
  }

  private _calculateCriticalPathDuration(plan: ExecutionPlan): number {
    let maxDuration = 0;

    for (const layer of plan.executionLayers) {
      const layerDuration = Math.max(...layer.map((t) => t.duration ?? 0));
      maxDuration += layerDuration;
    }

    return maxDuration;
  }

  private _calculateFinalMetrics(plan: ExecutionPlan): ExecutionMetrics {
    const metrics = this._calculateMetrics(plan);

    const history = this.metricsHistory.get(plan.id) ?? [];
    if (history.length > 0) {
      const peakMemory = Math.max(...history.map((m) => m.resourceUsage?.peakMemory ?? 0));
      const avgCpu =
        history.reduce((sum, m) => sum + (m.resourceUsage?.avgCpu ?? 0), 0) / history.length;

      metrics.resourceUsage = { peakMemory, avgCpu };
    }

    return metrics;
  }

  private _calculateDuration(planId: string): number {
    const startTime = this.startTimes.get(planId);
    return startTime !== undefined ? Date.now() - startTime : 0;
  }

  getMetricsHistory(planId: string): ExecutionMetrics[] {
    return this.metricsHistory.get(planId) ?? [];
  }

  getLatestMetrics(planId: string): ExecutionMetrics | undefined {
    const history = this.metricsHistory.get(planId);
    return history?.[history.length - 1];
  }

  private _emitEvent(event: ExecutionEvent): void {
    this.emit('execution_event', event);
    this.emit(event.type, event);
  }

  private _cleanup(planId: string): void {
    this.startTimes.delete(planId);
  }

  formatExecutionSummary(plan: ExecutionPlan): string {
    const metrics = this._calculateFinalMetrics(plan);
    const duration = (metrics.totalDuration / 1000).toFixed(1);

    this.progressManager.stopAll();

    const summaryLines = [
      `Mode: ${chalk.bold(plan.mode)}`,
      `Strategy: ${chalk.bold(plan.strategy)}`,
      `Total Duration: ${chalk.cyan(`${duration}s`)}`,
      `Tasks: ${chalk.green(`${metrics.completedCount}/${metrics.taskCount}`)} completed`,
    ];

    if (metrics.failedCount > 0) {
      summaryLines.push(`Failed: ${chalk.red(`${metrics.failedCount} tasks`)}`);
    }

    if (metrics.skippedCount > 0) {
      summaryLines.push(`Skipped: ${chalk.yellow(`${metrics.skippedCount} tasks`)}`);
    }

    const metricsData: {
      averageTaskDuration?: number;
      criticalPathDuration?: number;
      parallelizationEfficiency?: number;
    } = {};

    if (metrics.averageTaskDuration > 0) {
      metricsData.averageTaskDuration = metrics.averageTaskDuration;
    }
    if (metrics.criticalPathDuration > 0) {
      metricsData.criticalPathDuration = metrics.criticalPathDuration;
    }
    if (plan.strategy !== 'serial' && metrics.parallelizationEfficiency > 0) {
      metricsData.parallelizationEfficiency = metrics.parallelizationEfficiency;
    }

    const metricsLines = this.formatter.formatMetrics(metricsData);

    return `\n${this.formatter.formatSummaryBox('Execution Summary', [...summaryLines, ...metricsLines])}\n`;
  }
}
