import { EventEmitter } from 'node:events';

import { match } from 'ts-pattern';

import type { TaskOrchestrator } from '../mcp/orchestrator';
import type { Plan } from '../types/decomposer';
import type {
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  ExecutionTask,
  TaskExecutionRequest,
  TaskExecutionResult,
} from '../types/execution';

import { toErrorMessage } from '../utils/errors';
import { logger } from '../utils/logger';
import { hasContent } from '../validation/guards';
import { createVcsBackend, detectAvailableVcsBackend } from '../vcs';

import type { ExecutionMonitor } from './execution-monitor';
import type { ExecutionPlanner } from './execution-planner';
import type { StateManager } from './state-manager';
import type { VcsEngine, WorktreeExecutionContext } from './vcs-engine';

export type ExecutionEngineDependencies = {
  monitor: ExecutionMonitor;
  orchestrator: TaskOrchestrator;
  planner: ExecutionPlanner;
  stateManager: StateManager;
  vcsEngine: VcsEngine;
};

export class ExecutionEngine extends EventEmitter {
  private readonly planner: ExecutionPlanner;
  private readonly stateManager: StateManager;
  private readonly monitor: ExecutionMonitor;
  private readonly orchestrator: TaskOrchestrator;
  private readonly activePlans: Map<string, ExecutionPlan>;
  private readonly vcsEngine: VcsEngine;
  private readonly worktreeContexts: Map<string, WorktreeExecutionContext>;

  constructor(dependencies: ExecutionEngineDependencies) {
    super();
    this.planner = dependencies.planner;
    this.stateManager = dependencies.stateManager;
    this.monitor = dependencies.monitor;
    this.orchestrator = dependencies.orchestrator;
    this.vcsEngine = dependencies.vcsEngine;
    this.activePlans = new Map();
    this.worktreeContexts = new Map();

    this._setupEventForwarding();
  }

  private _setupEventForwarding(): void {
    this.monitor.on('execution_event', (event) => {
      this.emit('execution_event', event);
    });

    this.orchestrator.on('taskUpdate', (update) => {
      this.emit('task_update', update);
    });

    this.vcsEngine.on('worktree_created', (event) => {
      this.emit('worktree_created', event);
    });

    this.vcsEngine.on('stack_built', (event) => {
      this.emit('stack_built', event);
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

      logger.info(`[chopstack] Starting execution in ${options.mode} mode`);
      logger.info(`[chopstack] Strategy: ${executionPlan.strategy}`);
      logger.info(`[chopstack] Tasks: ${executionPlan.tasks.size}`);

      this.monitor.startMonitoring(executionPlan);

      const result = await match(options.mode)
        .with('plan', async () => this._executePlanMode(executionPlan, options))
        .with('dry-run', () => this._executeDryRunMode(executionPlan))
        .with('execute', async () => this._executeFullMode(executionPlan, options))
        .with('validate', () => this._executeValidateMode(executionPlan))
        .exhaustive();

      this.monitor.stopMonitoring(executionPlan);
      logger.info(this.monitor.formatExecutionSummary(executionPlan));

      return result;
    } finally {
      this.activePlans.delete(executionPlan.id);
    }
  }

  private async _executePlanMode(
    plan: ExecutionPlan,
    options: ExecutionOptions,
  ): Promise<ExecutionResult> {
    logger.info('[chopstack] Generating execution plans for all tasks...');

    for (const layer of plan.executionLayers) {
      const layerPromises = layer.map(async (task) => {
        logger.info(`[chopstack] Planning: ${task.id} - ${task.title}`);

        // Proper state transition: ready → queued → running
        if (task.state === 'ready') {
          this.stateManager.transitionTask(task, 'queued');
        }
        const previousState = task.state;
        this.stateManager.transitionTask(task, 'running');
        this.monitor.onTaskStateChange(plan, task, previousState, 'running');

        try {
          const result = await this._executeTaskInPlanMode(task, options);
          task.output = result.output;

          // Display the execution plan for this task
          logger.info(`[chopstack] ✓ Plan for ${task.id}:`);
          if (hasContent(result.output)) {
            logger.info(
              `[chopstack]   ${result.output.trim().replaceAll('\n', '\n[chopstack]   ')}`,
            );
          } else {
            logger.info(`[chopstack]   No detailed plan output available`);
          }

          this.stateManager.transitionTask(task, 'completed');
          this.monitor.onTaskStateChange(plan, task, 'running', 'completed');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          task.error = errorMessage;
          logger.info(`[chopstack] ✗ Planning failed for ${task.id}: ${errorMessage}`);
          this.stateManager.transitionTask(task, 'failed');
          this.monitor.onTaskStateChange(plan, task, 'running', 'failed');
        }
      });

      await Promise.allSettled(layerPromises);
    }

    return this._createExecutionResult(plan);
  }

  private _executeDryRunMode(plan: ExecutionPlan): ExecutionResult {
    logger.info('[chopstack] Running in dry-run mode (no actual changes)...');

    for (const layer of plan.executionLayers) {
      for (const task of layer) {
        // Simulate task execution with proper monitoring
        const previousState = task.state;

        // Ensure we can transition to running from any state
        if (task.state === 'pending') {
          this.stateManager.transitionTask(task, 'ready');
        }
        if (task.state === 'ready') {
          this.stateManager.transitionTask(task, 'queued');
        }
        if (task.state === 'queued') {
          this.stateManager.transitionTask(task, 'running');
        }

        this.monitor.onTaskStateChange(plan, task, previousState, 'running');

        // Simulate some execution time
        task.startTime = new Date();

        // Mark as completed
        task.endTime = new Date();
        task.duration = task.endTime.getTime() - task.startTime.getTime();
        task.output = '[Dry run - no actual execution]';

        this.stateManager.transitionTask(task, 'completed');
        this.monitor.onTaskStateChange(plan, task, 'running', 'completed');
      }

      // Update progress after each layer
      this.monitor.updateProgress(plan);
    }

    return this._createExecutionResult(plan);
  }

  private async _executeFullMode(
    plan: ExecutionPlan,
    options: ExecutionOptions,
  ): Promise<ExecutionResult> {
    logger.info('[chopstack] Executing tasks with full changes...');

    const baseRef = (options.gitSpice ?? false) ? 'HEAD' : 'main';
    const workdir = options.workdir ?? process.cwd();

    // Analyze worktree needs for the execution plan
    const worktreeNeeds = await this.vcsEngine.analyzeWorktreeNeeds(
      { tasks: [...plan.tasks.values()] },
      workdir,
    );

    logger.info(
      `[chopstack] Worktree analysis: ${worktreeNeeds.requiresWorktrees ? 'Required' : 'Not required'}`,
    );

    for (const layer of plan.executionLayers) {
      // Create worktrees for parallel tasks if needed
      if (worktreeNeeds.requiresWorktrees && layer.length > 1) {
        const contexts = await this.vcsEngine.createWorktreesForLayer(layer, baseRef, workdir);
        for (const context of contexts) {
          this.worktreeContexts.set(context.taskId, context);
        }
      }

      const layerResults = await this._executeLayer(plan, layer, options, baseRef);

      const failedTasks = layerResults.filter((r) => r.state === 'failed');
      if (failedTasks.length > 0 && !(options.continueOnError ?? false)) {
        throw new Error(`Execution failed: ${failedTasks.length} tasks failed in layer`);
      }

      this.planner.updateTaskDependencies(plan);
    }

    if (options.gitSpice ?? false) {
      await this._createVcsStackWithWorktrees(plan, options);
    }

    // Cleanup worktrees
    const contexts = [...this.worktreeContexts.values()];
    if (contexts.length > 0) {
      await this.vcsEngine.cleanupWorktrees(contexts);
      this.worktreeContexts.clear();
    }

    return this._createExecutionResult(plan);
  }

  private _executeValidateMode(plan: ExecutionPlan): ExecutionResult {
    logger.info('[chopstack] Validating execution readiness...');

    const validation = this.planner.validateExecutionPlan(plan);

    logger.info(`[chopstack] Validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);

    if (validation.errors.length > 0) {
      logger.error('[chopstack] Errors:');
      for (const error of validation.errors) {
        logger.error(`[chopstack]   - ${error}`);
      }
    }

    if (validation.warnings.length > 0) {
      logger.warn('[chopstack] Warnings:');
      for (const warning of validation.warnings) {
        logger.warn(`[chopstack]   - ${warning}`);
      }
    }

    if (validation.suggestions.length > 0) {
      logger.info('[chopstack] Suggestions:');
      for (const suggestion of validation.suggestions) {
        logger.info(`[chopstack]   - ${suggestion}`);
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
      const result = await this._executeTask(plan, task, options);
      results.push(result);
    }

    return results;
  }

  private async _executeLayerInParallel(
    plan: ExecutionPlan,
    layer: ExecutionTask[],
    options: ExecutionOptions,
    _baseRef: string,
  ): Promise<TaskExecutionResult[]> {
    // Mark all tasks as running and notify monitor
    for (const task of layer) {
      const previousState = task.state;
      // Proper state transition: ready → queued → running
      if (task.state === 'ready') {
        this.stateManager.transitionTask(task, 'queued');
      }
      this.stateManager.transitionTask(task, 'running');
      this.monitor.onTaskStateChange(plan, task, previousState, 'running');
    }

    this.monitor.updateProgress(plan);

    // Execute tasks in parallel, each in its own worktree if available
    const taskPromises = layer.map(async (task) => {
      const worktreeContext = this.worktreeContexts.get(task.id);
      const workdir = worktreeContext?.absolutePath ?? options.workdir ?? process.cwd();

      const result = await this.orchestrator.executeClaudeTask(
        task.id,
        task.title,
        task.agentPrompt,
        task.touches,
        workdir,
        options.mode,
      );

      // Commit changes if task completed successfully in a worktree
      if (result.status === 'completed' && worktreeContext !== undefined) {
        try {
          const commitHash = await this.vcsEngine.commitTaskChanges(task, worktreeContext, {
            includeAll: true,
            generateMessage: true,
          });
          task.commitHash = commitHash;
          logger.info(`[chopstack] Committed task ${task.id}: ${commitHash.slice(0, 7)}`);
        } catch (error) {
          logger.warn(
            `[chopstack] Failed to commit task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        state: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
      };

      // Update task state and notify monitor
      const finalState = executionResult.state;
      this.stateManager.transitionTask(task, finalState);
      this.monitor.onTaskStateChange(plan, task, 'running', finalState);

      task.output = executionResult.output;
      task.error = executionResult.error;
      task.duration = executionResult.duration;

      return executionResult;
    });

    return Promise.all(taskPromises);
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
      // Handle case where orchestrator rejects with TaskResult object
      const errorMessage = toErrorMessage(error);

      const errorResult: TaskExecutionResult = {
        taskId: task.id,
        state: 'failed',
        error: errorMessage,
      };

      task.error = errorResult.error;
      this.stateManager.transitionTask(task, 'failed');
      this.monitor.onTaskStateChange(plan, task, 'running', 'failed');

      if (this.stateManager.canRetry(task) && (options.retryAttempts ?? 0) > 0) {
        logger.info(`[chopstack] Retrying task ${task.id}...`);
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

  private async _createVcsStackWithWorktrees(
    plan: ExecutionPlan,
    options: ExecutionOptions,
  ): Promise<void> {
    logger.info('[chopstack] Creating VCS stack from worktree commits...');

    const completedTasks = [...plan.tasks.values()].filter(
      (task) => task.state === 'completed' && task.commitHash !== undefined,
    );

    if (completedTasks.length === 0) {
      logger.info('[chopstack] No completed tasks with commits to create stack from');
      return;
    }

    try {
      const stackInfo = await this.vcsEngine.buildStackIncremental(
        completedTasks,
        options.workdir ?? process.cwd(),
        {
          parentRef: 'main',
          strategy: 'dependency-order',
          submitStack: options.submitStack ?? false,
        },
      );

      logger.info('[chopstack] Stack created with branches:');
      for (const branch of stackInfo.branches) {
        logger.info(`[chopstack]   └─ ${branch.name} (task: ${branch.taskId})`);
      }

      if (stackInfo.prUrls !== undefined && stackInfo.prUrls.length > 0) {
        plan.prUrls = stackInfo.prUrls;
        logger.info('[chopstack] Pull requests created:');
        for (const url of stackInfo.prUrls) {
          logger.info(`[chopstack]   └─ ${url}`);
        }
      }
    } catch (error) {
      logger.error(
        `[chopstack] Failed to create VCS stack: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't throw - VCS failure shouldn't fail the entire execution
    }
  }

  private async _createVcsStack(plan: ExecutionPlan, options: ExecutionOptions): Promise<void> {
    logger.info('[chopstack] Creating VCS stack...');

    try {
      // Detect available VCS backend
      const backendType = await detectAvailableVcsBackend();
      if (backendType === null) {
        logger.warn('[chopstack] No VCS backend available (git-spice, jj, graphite)');
        return;
      }

      logger.info(`[chopstack] Using VCS backend: ${backendType}`);

      // Create backend instance
      const vcsBackend = await createVcsBackend(backendType);

      // Get completed tasks with commits
      const completedTasks = [...plan.tasks.values()].filter((task) => task.state === 'completed');

      if (completedTasks.length === 0) {
        logger.info('[chopstack] No completed tasks to create stack from');
        return;
      }

      // Create the stack using VCS backend
      const stackInfo = await vcsBackend.createStack(
        completedTasks,
        options.workdir ?? process.cwd(),
      );

      logger.info('[chopstack] Stack created with branches:');
      for (const branch of stackInfo.branches) {
        logger.info(`[chopstack]   └─ ${branch.name} (task: ${branch.taskId})`);
      }

      // Submit stack to remote if requested
      try {
        const prUrls = await vcsBackend.submitStack(options.workdir ?? process.cwd());
        if (prUrls.length > 0) {
          // Update execution result with PR URLs
          plan.prUrls = prUrls;
        }
      } catch (error) {
        logger.warn(
          `[chopstack] Stack created but submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        logger.info(
          `[chopstack] Run '${backendType === 'git-spice' ? 'gs stack submit' : 'stack submit'} manually to create PRs`,
        );
      }
    } catch (error) {
      logger.error(
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
