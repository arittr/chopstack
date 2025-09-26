import { EventEmitter } from 'node:events';
import { clearInterval, setInterval } from 'node:timers';

import chalk from 'chalk';
import { match } from 'ts-pattern';

import type {
  ExecutionEvent,
  ExecutionMetrics,
  ExecutionPlan,
  TaskState,
} from '@/core/execution/types';

import { createProgressLine, ProgressFormatter } from '@/services/planning/progress-formatter';
import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

/**
 * Configuration for the execution monitor
 */
export type ExecutionMonitorConfig = {
  enableProgressBar?: boolean;
  enableRealTimeStats?: boolean;
  logLevel?: 'info' | 'debug' | 'verbose';
  progressUpdateInterval?: number;
};

/**
 * Enhanced execution monitoring service interface
 */
export type ExecutionMonitorService = {
  /**
   * Emit execution events
   */
  emit(event: string, ...args: unknown[]): boolean;

  /**
   * Get current execution metrics
   */
  getMetrics(planId: string): ExecutionMetrics | null;

  /**
   * Get execution progress as percentage
   */
  getProgress(planId: string): number;

  /**
   * Register for execution events
   */
  on(event: string, listener: (...args: unknown[]) => void): void;

  /**
   * Start monitoring an execution plan
   */
  startMonitoring(plan: ExecutionPlan): void;

  /**
   * Stop monitoring and cleanup resources
   */
  stopMonitoring(planId: string): void;

  /**
   * Update task state and emit progress events
   */
  updateTaskState(
    planId: string,
    taskId: string,
    state: TaskState,
    metadata?: Record<string, unknown>,
  ): void;
};

/**
 * Real-time execution monitoring with progress tracking,
 * metrics collection, and event emission
 */
export class ExecutionMonitorServiceImpl extends EventEmitter implements ExecutionMonitorService {
  private readonly config: ExecutionMonitorConfig;
  private readonly metricsHistory: Map<string, ExecutionMetrics[]>;
  private readonly startTimes: Map<string, number>;
  private readonly formatter: ProgressFormatter;
  private readonly activePlans: Map<string, ExecutionPlan>;
  private readonly progressIntervals: Map<string, ReturnType<typeof setInterval>>;

  constructor(config: ExecutionMonitorConfig = {}) {
    super();

    this.config = {
      enableProgressBar: true,
      enableRealTimeStats: true,
      logLevel: 'info',
      progressUpdateInterval: 1000,
      ...config,
    };

    this.metricsHistory = new Map();
    this.startTimes = new Map();
    this.formatter = new ProgressFormatter();
    this.activePlans = new Map();
    this.progressIntervals = new Map();
  }

  startMonitoring(plan: ExecutionPlan): void {
    const planId = plan.id;

    this.startTimes.set(planId, Date.now());
    this.metricsHistory.set(planId, []);
    this.activePlans.set(planId, plan);

    this._emitEvent({
      type: 'execution_start',
      timestamp: new Date(),
      planId,
      data: {
        mode: plan.mode,
        vcsMode: plan.vcsMode,
        taskCount: plan.tasks.size,
        layerCount: plan.executionLayers.length,
      },
    });

    // Start real-time progress updates if enabled
    if (this.config.enableRealTimeStats === true) {
      const interval = setInterval(() => {
        this._updateRealTimeMetrics(planId);
      }, this.config.progressUpdateInterval);

      this.progressIntervals.set(planId, interval);
    }

    logger.info(`📊 Started monitoring execution plan ${planId} (${plan.tasks.size} tasks)`);

    if (this.config.enableProgressBar === true) {
      this._showInitialProgress(plan);
    }
  }

  stopMonitoring(planId: string): void {
    const plan = this.activePlans.get(planId);
    const startTime = this.startTimes.get(planId);

    if (isNonNullish(plan) && isNonNullish(startTime)) {
      const duration = Date.now() - startTime;
      const metrics = this.getMetrics(planId);

      this._emitEvent({
        type: 'execution_complete',
        timestamp: new Date(),
        planId,
        data: {
          duration,
          metrics,
          finalStatus: this._calculateFinalStatus(plan),
        },
      });

      logger.info(
        `✅ Completed monitoring execution plan ${planId} (${(duration / 1000).toFixed(1)}s)`,
      );
    }

    // Cleanup resources
    this.activePlans.delete(planId);
    this.startTimes.delete(planId);
    this.metricsHistory.delete(planId);

    const interval = this.progressIntervals.get(planId);
    if (isNonNullish(interval)) {
      clearInterval(interval);
      this.progressIntervals.delete(planId);
    }
  }

  updateTaskState(
    planId: string,
    taskId: string,
    state: TaskState,
    metadata: Record<string, unknown> = {},
  ): void {
    const plan = this.activePlans.get(planId);
    if (!isNonNullish(plan)) {
      return;
    }

    // Update task state in plan
    const task = plan.tasks.get(taskId);
    if (isNonNullish(task)) {
      task.state = state;
      // Update timestamp - tracked separately
    }

    this._emitEvent({
      type: 'task_state_change',
      timestamp: new Date(),
      planId,
      taskId,
      data: {
        state,
        metadata,
        progress: this.getProgress(planId),
      },
    });

    if (this.config.enableProgressBar === true) {
      this._updateProgressDisplay(planId);
    }

    this._logTaskStateChange(taskId, state, metadata);
  }

  getMetrics(planId: string): ExecutionMetrics | null {
    const plan = this.activePlans.get(planId);
    const startTime = this.startTimes.get(planId);

    if (!isNonNullish(plan) || !isNonNullish(startTime)) {
      return null;
    }

    const now = Date.now();
    const duration = now - startTime;

    const tasksByState = [...plan.tasks.values()].reduce<Partial<Record<TaskState, number>>>(
      (accumulator, task) => {
        accumulator[task.state] = (accumulator[task.state] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    const completedTasks = tasksByState.completed ?? 0;
    const failedTasks = tasksByState.failed ?? 0;
    const skippedTasks = tasksByState.skipped ?? 0;

    const totalTasks = plan.tasks.size;

    return {
      taskCount: totalTasks,
      completedCount: completedTasks,
      failedCount: failedTasks,
      skippedCount: skippedTasks,
      totalDuration: duration,
      averageTaskDuration: completedTasks > 0 ? duration / completedTasks : 0,
      criticalPathDuration: 0,
      parallelizationEfficiency: 0,
    };
  }

  getProgress(planId: string): number {
    const metrics = this.getMetrics(planId);
    return isNonNullish(metrics) ? (metrics.completedCount / metrics.taskCount) * 100 : 0;
  }

  private _emitEvent(event: ExecutionEvent): void {
    this.emit(event.type, event);

    if (this.config.logLevel === 'debug') {
      logger.debug(`📡 Event: ${event.type}`, event.data as Record<string, unknown>);
    }
  }

  private _updateRealTimeMetrics(planId: string): void {
    const metrics = this.getMetrics(planId);
    if (!isNonNullish(metrics)) {
      return;
    }

    const history = this.metricsHistory.get(planId) ?? [];
    history.push(metrics);

    // Keep only last 100 metrics for memory efficiency
    if (history.length > 100) {
      history.shift();
    }

    this.metricsHistory.set(planId, history);

    this._emitEvent({
      type: 'progress_update',
      timestamp: new Date(),
      planId,
      data: metrics,
    });
  }

  private _showInitialProgress(plan: ExecutionPlan): void {
    const progressLine = createProgressLine(
      0,
      plan.tasks.size,
      [],
      0,
      1,
      plan.executionLayers.length,
      -1,
    );

    logger.info(`\n${chalk.bold('Execution Progress:')}\n${progressLine}`);

    if (this.config.logLevel === 'verbose') {
      logger.info(`📋 Plan: ${plan.vcsMode} VCS mode, ${plan.executionLayers.length} layers`);

      for (const [index, layer] of plan.executionLayers.entries()) {
        logger.info(`  Layer ${index + 1}: ${layer.map((t) => t.id).join(', ')}`);
      }
    }
  }

  private _updateProgressDisplay(planId: string): void {
    const metrics = this.getMetrics(planId);
    if (!isNonNullish(metrics)) {
      return;
    }

    const progressLine = createProgressLine(
      metrics.completedCount,
      metrics.taskCount,
      [],
      metrics.failedCount,
      1,
      1,
      -1,
    );

    const throughput =
      metrics.completedCount > 0 && metrics.totalDuration > 0
        ? metrics.completedCount / (metrics.totalDuration / 1000)
        : 0;
    const throughputText = throughput > 0 ? ` (${throughput.toFixed(2)} tasks/s)` : '';

    const remainingTasks = metrics.taskCount - metrics.completedCount;
    const estimatedRemainingTime =
      remainingTasks > 0 && throughput > 0 ? remainingTasks / throughput : 0;
    const etaText = estimatedRemainingTime > 0 ? ` ETA: ${estimatedRemainingTime.toFixed(0)}s` : '';

    process.stdout.write(`\r${progressLine}${throughputText}${etaText}`);
  }

  private _logTaskStateChange(
    taskId: string,
    state: TaskState,
    metadata: Record<string, unknown>,
  ): void {
    const stateEmoji = match(state)
      .with('pending', () => '⏳')
      .with('ready', () => '⏳')
      .with('queued', () => '⏳')
      .with('running', () => '🔄')
      .with('completed', () => '✅')
      .with('failed', () => '❌')
      .with('blocked', () => '🚫')
      .with('skipped', () => '⏭️')
      .exhaustive();

    const message = `${stateEmoji} Task ${taskId}: ${state}`;

    match(state)
      .with('completed', () => {
        if (this.config.logLevel === 'verbose') {
          logger.info(message);
        }
      })
      .with('failed', () => {
        const error = isNonNullish(metadata.error) ? ` - ${String(metadata.error)}` : '';
        logger.error(`${message}${error}`);
      })
      .with('running', () => {
        if (this.config.logLevel === 'verbose') {
          logger.info(message);
        }
      })
      .otherwise(() => {
        if (this.config.logLevel === 'debug') {
          logger.debug(message);
        }
      });
  }

  private _calculateFinalStatus(plan: ExecutionPlan): 'success' | 'partial' | 'failure' {
    const tasksByState = [...plan.tasks.values()].reduce<Partial<Record<TaskState, number>>>(
      (accumulator, task) => {
        accumulator[task.state] = (accumulator[task.state] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    const completed = tasksByState.completed ?? 0;
    const failed = tasksByState.failed ?? 0;
    const total = plan.tasks.size;

    if (failed === 0 && completed === total) {
      return 'success';
    } else if (completed > 0) {
      return 'partial';
    }
    return 'failure';
  }
}
