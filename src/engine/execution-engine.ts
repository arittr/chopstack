import { EventEmitter } from 'node:events';

import { match } from 'ts-pattern';

import type { Plan } from '../types/decomposer';
import type {
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  ExecutionTask,
  TaskExecutionRequest,
  TaskExecutionResult,
} from '../types/execution';

import { TaskOrchestrator } from '../mcp/orchestrator';
import { createVcsBackend, detectAvailableVcsBackend } from '../vcs';

import { ExecutionMonitor } from './execution-monitor';
import { ExecutionPlanner } from './execution-planner';
import { StateManager } from './state-manager';

export class ExecutionEngine extends EventEmitter {
  private readonly planner: ExecutionPlanner;
  private readonly stateManager: StateManager;
  private readonly monitor: ExecutionMonitor;
  private readonly orchestrator: TaskOrchestrator;
  private readonly activePlans: Map<string, ExecutionPlan>;

  constructor() {
    super();
    this.planner = new ExecutionPlanner();
    this.stateManager = new StateManager();
    this.monitor = new ExecutionMonitor();
    this.orchestrator = new TaskOrchestrator();
    this.activePlans = new Map();

    this._setupEventForwarding();
  }

  private _setupEventForwarding(): void {
    this.monitor.on('execution_event', (event) => {
      this.emit('execution_event', event);
    });

    this.orchestrator.on('taskUpdate', (update) => {
      this.emit('task_update', update);
    });
  }

  async execute(plan: Plan, options: ExecutionOptions): Promise<ExecutionResult> {
    const executionPlan = this.planner.createExecutionPlan(plan, options);
    this.activePlans.set(executionPlan.id, executionPlan);

    try {
      const validation = this.planner.validateExecutionPlan(executionPlan);
      if (!validation.canProceed) {
        throw new Error(`Execution plan validation failed: ${validation.errors.join(', ')}`);
      }

      console.log(`[chopstack] Starting execution in ${options.mode} mode`);
      console.log(`[chopstack] Strategy: ${executionPlan.strategy}`);
      console.log(`[chopstack] Tasks: ${executionPlan.tasks.size}`);

      this.monitor.startMonitoring(executionPlan);

      const result = await match(options.mode)
        .with('plan', async () => this._executePlanMode(executionPlan, options))
        .with('dry-run', () => this._executeDryRunMode(executionPlan))
        .with('execute', async () => this._executeFullMode(executionPlan, options))
        .with('validate', () => this._executeValidateMode(executionPlan))
        .exhaustive();

      this.monitor.stopMonitoring(executionPlan);
      console.log(this.monitor.formatExecutionSummary(executionPlan));

      return result;
    } finally {
      this.activePlans.delete(executionPlan.id);
    }
  }

  private async _executePlanMode(
    plan: ExecutionPlan,
    options: ExecutionOptions,
  ): Promise<ExecutionResult> {
    console.log('[chopstack] Generating execution plans for all tasks...');

    for (const layer of plan.executionLayers) {
      const layerPromises = layer.map(async (task) => {
        this.stateManager.transitionTask(task, 'running');
        this.monitor.onTaskStateChange(plan, task, 'ready', 'running');

        try {
          const result = await this._executeTaskInPlanMode(task, options);
          task.output = result.output;

          this.stateManager.transitionTask(task, 'completed');
          this.monitor.onTaskStateChange(plan, task, 'running', 'completed');
        } catch (error) {
          task.error = String(error);
          this.stateManager.transitionTask(task, 'failed');
          this.monitor.onTaskStateChange(plan, task, 'running', 'failed');
        }
      });

      // eslint-disable-next-line no-await-in-loop -- wait for each layer's parallel tasks to finish
      await Promise.allSettled(layerPromises);
    }

    return this._createExecutionResult(plan);
  }

  private _executeDryRunMode(plan: ExecutionPlan): ExecutionResult {
    console.log('[chopstack] Running in dry-run mode (no actual changes)...');

    for (const layer of plan.executionLayers) {
      console.log(`[chopstack] Would execute ${layer.length} tasks in parallel:`);

      for (const task of layer) {
        console.log(`[chopstack]   - ${task.id}: ${task.title}`);
        console.log(`[chopstack]     Files: ${task.touches.join(', ')}`);

        this.stateManager.transitionTask(task, 'completed');
        task.output = '[Dry run - no actual execution]';
      }
    }

    return this._createExecutionResult(plan);
  }

  private async _executeFullMode(
    plan: ExecutionPlan,
    options: ExecutionOptions,
  ): Promise<ExecutionResult> {
    console.log('[chopstack] Executing tasks with full changes...');

    const baseRef = (options.gitSpice ?? false) ? 'HEAD' : 'main';

    for (const layer of plan.executionLayers) {
      // eslint-disable-next-line no-await-in-loop -- layers intentionally run sequentially
      const layerResults = await this._executeLayer(plan, layer, options, baseRef);

      const failedTasks = layerResults.filter((r) => r.state === 'failed');
      if (failedTasks.length > 0 && !(options.continueOnError ?? false)) {
        throw new Error(`Execution failed: ${failedTasks.length} tasks failed in layer`);
      }

      this.planner.updateTaskDependencies(plan);
    }

    if (options.gitSpice ?? false) {
      await this._createVcsStack(plan, options);
    }

    return this._createExecutionResult(plan);
  }

  private _executeValidateMode(plan: ExecutionPlan): ExecutionResult {
    console.log('[chopstack] Validating execution readiness...');

    const validation = this.planner.validateExecutionPlan(plan);

    console.log(`[chopstack] Validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);

    if (validation.errors.length > 0) {
      console.error('[chopstack] Errors:');
      for (const error of validation.errors) {
        console.error(`[chopstack]   - ${error}`);
      }
    }

    if (validation.warnings.length > 0) {
      console.warn('[chopstack] Warnings:');
      for (const warning of validation.warnings) {
        console.warn(`[chopstack]   - ${warning}`);
      }
    }

    if (validation.suggestions.length > 0) {
      console.log('[chopstack] Suggestions:');
      for (const suggestion of validation.suggestions) {
        console.log(`[chopstack]   - ${suggestion}`);
      }
    }

    for (const task of plan.tasks.values()) {
      task.state = validation.valid ? 'completed' : 'failed';
    }

    return this._createExecutionResult(plan);
  }

  private async _executeLayer(
    plan: ExecutionPlan,
    layer: ExecutionTask[],
    options: ExecutionOptions,
    baseRef: string,
  ): Promise<TaskExecutionResult[]> {
    if (plan.strategy === 'serial' || layer.length === 1) {
      return this._executeLayerSerially(plan, layer, options);
    }
    return this._executeLayerInParallel(plan, layer, options, baseRef);
  }

  private async _executeLayerSerially(
    plan: ExecutionPlan,
    layer: ExecutionTask[],
    options: ExecutionOptions,
  ): Promise<TaskExecutionResult[]> {
    const results: TaskExecutionResult[] = [];

    for (const task of layer) {
      // eslint-disable-next-line no-await-in-loop -- serial strategy requires ordered execution
      const result = await this._executeTask(plan, task, options);
      results.push(result);
    }

    return results;
  }

  private async _executeLayerInParallel(
    plan: ExecutionPlan,
    layer: ExecutionTask[],
    options: ExecutionOptions,
    baseRef: string,
  ): Promise<TaskExecutionResult[]> {
    const taskInputs = layer.map((task) => ({
      id: task.id,
      title: task.title,
      prompt: task.agentPrompt,
      files: task.touches,
    }));

    const results = await this.orchestrator.executeParallelTasks(taskInputs, baseRef);

    return results.map((result, index) => {
      const task = layer[index];
      if (task === undefined) {
        throw new Error(`Task at index ${index} not found`);
      }

      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        state: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
      };

      task.state = executionResult.state;
      task.output = executionResult.output;
      task.error = executionResult.error;
      task.duration = executionResult.duration;

      return executionResult;
    });
  }

  private async _executeTask(
    plan: ExecutionPlan,
    task: ExecutionTask,
    options: ExecutionOptions,
  ): Promise<TaskExecutionResult> {
    this.stateManager.transitionTask(task, 'queued');
    this.stateManager.transitionTask(task, 'running');
    this.monitor.onTaskStateChange(plan, task, 'queued', 'running');

    try {
      const request: TaskExecutionRequest = {
        task,
        mode: options.mode,
        workdir: options.workdir,
        timeout: options.timeout,
        retryAttempts: options.retryAttempts,
      };

      const result = await this._executeTaskWithMode(request);

      task.output = result.output;
      task.duration = result.duration;
      task.exitCode = result.exitCode;

      this.stateManager.transitionTask(task, result.state);
      this.monitor.onTaskStateChange(plan, task, 'running', result.state);

      return result;
    } catch (error) {
      const errorResult: TaskExecutionResult = {
        taskId: task.id,
        state: 'failed',
        error: String(error),
      };

      task.error = errorResult.error;
      this.stateManager.transitionTask(task, 'failed');
      this.monitor.onTaskStateChange(plan, task, 'running', 'failed');

      if (this.stateManager.canRetry(task) && (options.retryAttempts ?? 0) > 0) {
        console.log(`[chopstack] Retrying task ${task.id}...`);
        await this._delay(options.retryDelay ?? 5000);
        return this._executeTask(plan, task, options);
      }

      return errorResult;
    }
  }

  private async _executeTaskWithMode(request: TaskExecutionRequest): Promise<TaskExecutionResult> {
    const { task, mode, workdir } = request;

    const result = await this.orchestrator.executeClaudeTask(
      task.id,
      task.title,
      task.agentPrompt,
      task.touches,
      workdir,
      mode,
    );

    return {
      taskId: task.id,
      state: result.status === 'completed' ? 'completed' : 'failed',
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      duration: result.duration,
    };
  }

  private async _executeTaskInPlanMode(
    task: ExecutionTask,
    options: ExecutionOptions,
  ): Promise<TaskExecutionResult> {
    const result = await this.orchestrator.executeClaudeTask(
      task.id,
      task.title,
      task.agentPrompt,
      task.touches,
      options.workdir,
      'plan',
    );

    return {
      taskId: task.id,
      state: result.status === 'completed' ? 'completed' : 'failed',
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      duration: result.duration,
    };
  }

  private async _createVcsStack(plan: ExecutionPlan, options: ExecutionOptions): Promise<void> {
    console.log('[chopstack] Creating VCS stack...');

    try {
      // Detect available VCS backend
      const backendType = await detectAvailableVcsBackend();
      if (backendType === null) {
        console.warn('[chopstack] No VCS backend available (git-spice, jj, graphite)');
        return;
      }

      console.log(`[chopstack] Using VCS backend: ${backendType}`);

      // Create backend instance
      const vcsBackend = await createVcsBackend(backendType);

      // Get completed tasks with commits
      const completedTasks = [...plan.tasks.values()].filter((task) => task.state === 'completed');

      if (completedTasks.length === 0) {
        console.log('[chopstack] No completed tasks to create stack from');
        return;
      }

      // Create the stack using VCS backend
      const stackInfo = await vcsBackend.createStack(
        completedTasks,
        options.workdir ?? process.cwd(),
      );

      console.log('[chopstack] Stack created with branches:');
      for (const branch of stackInfo.branches) {
        console.log(`[chopstack]   └─ ${branch.name} (task: ${branch.taskId})`);
      }

      // Submit stack to remote if requested
      try {
        const prUrls = await vcsBackend.submitStack(options.workdir ?? process.cwd());
        if (prUrls.length > 0) {
          // Update execution result with PR URLs
          plan.prUrls = prUrls;
        }
      } catch (error) {
        console.warn(
          `[chopstack] Stack created but submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        console.log(
          `[chopstack] Run '${backendType === 'git-spice' ? 'gs stack submit' : 'stack submit'} manually to create PRs`,
        );
      }
    } catch (error) {
      console.error(
        `[chopstack] Failed to create VCS stack: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't throw - VCS failure shouldn't fail the entire execution
    }
  }

  private _createExecutionResult(plan: ExecutionPlan): ExecutionResult {
    const stats = this.stateManager.getExecutionStats(plan.tasks);
    const metrics = this.monitor.getLatestMetrics(plan.id);

    return {
      planId: plan.id,
      mode: plan.mode,
      strategy: plan.strategy,
      startTime: plan.startedAt ?? plan.createdAt,
      endTime: new Date(),
      duration: metrics?.totalDuration ?? 0,
      tasksTotal: plan.tasks.size,
      tasksCompleted: stats.completed,
      tasksFailed: stats.failed,
      tasksSkipped: stats.skipped,
      tasks: [...plan.tasks.values()],
      success: stats.failed === 0,
      error: stats.failed > 0 ? `${stats.failed} tasks failed` : undefined,
      gitBranches: plan.prUrls !== undefined ? [] : undefined, // Will be populated by git-spice integration
      stackUrl: plan.prUrls?.[0], // First PR URL as stack URL
    };
  }

  private async _delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });
  }

  cancelExecution(planId: string): boolean {
    const plan = this.activePlans.get(planId);
    if (plan === undefined) {
      return false;
    }

    const runningTasks = this.stateManager.getTasksByState(plan.tasks, 'running');
    for (const task of runningTasks) {
      this.orchestrator.stopTask(task.id);
      this.stateManager.transitionTask(task, 'failed', 'Execution cancelled');
    }

    plan.status = 'cancelled';
    this.monitor.stopMonitoring(plan);

    return true;
  }

  getActivePlans(): ExecutionPlan[] {
    return [...this.activePlans.values()];
  }

  getPlanStatus(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }
}
