import { EventEmitter } from 'node:events';

import { match } from 'ts-pattern';

import type {
  ExecuteModeHandler,
  ExecutionContext,
  ExecutionResult,
  PlanModeHandler,
  PlanModeResult,
  TaskResult,
  ValidateModeHandler,
} from '@/core/execution/interfaces';
import type { ExecutionMode, ExecutionOptions } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { TaskOrchestrator } from '@/services/orchestration';
import type { Plan, ValidationResult } from '@/types/decomposer';

import { TaskTransitionManager } from '@/core/execution/task-transitions';
import { logger } from '@/utils/logger';

import { ExecuteModeHandlerImpl } from './modes/execute-mode-handler';
import { PlanModeHandlerImpl } from './modes/plan-mode-handler';
import { ValidateModeHandlerImpl } from './modes/validate-mode-handler';

/**
 * Dependencies for the execution orchestrator
 */
export type ExecutionOrchestratorDependencies = {
  taskOrchestrator: TaskOrchestrator;
  vcsEngine: VcsEngineService;
};

/**
 * Events emitted by the execution orchestrator
 */
export type ExecutionOrchestratorEvents = {
  executionComplete: ExecutionResult;
  executionError: Error;
  executionStart: { options: ExecutionOptions; plan: Plan };
  taskComplete: TaskResult;
  taskError: { error: Error; taskId: string };
  taskStart: { taskId: string };
};

/**
 * Main orchestrator for task execution that coordinates mode-specific handlers
 * and manages the overall execution lifecycle
 */
export class ExecutionOrchestrator extends EventEmitter {
  private readonly taskTransitionManager: TaskTransitionManager;
  private readonly planModeHandler: PlanModeHandler;
  private readonly executeModeHandler: ExecuteModeHandler;
  private readonly validateModeHandler: ValidateModeHandler;

  constructor(dependencies: ExecutionOrchestratorDependencies) {
    super();

    this.taskTransitionManager = new TaskTransitionManager();

    // Initialize mode handlers
    this.planModeHandler = new PlanModeHandlerImpl(dependencies.taskOrchestrator);
    this.executeModeHandler = new ExecuteModeHandlerImpl(
      dependencies.taskOrchestrator,
      dependencies.vcsEngine,
    );
    this.validateModeHandler = new ValidateModeHandlerImpl();
  }

  /**
   * Execute a plan with the specified mode
   */
  async execute(plan: Plan, options: ExecutionOptions): Promise<ExecutionResult> {
    const context = this._createExecutionContext(options);

    try {
      this.emit('executionStart', { plan, options });
      logger.info(`🚀 Starting execution in ${options.mode} mode with ${plan.tasks.length} tasks`);

      const result = await this._executeWithMode(plan, context, options.mode);

      this.emit('executionComplete', result);
      return result;
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error(String(error));
      this.emit('executionError', executionError);
      throw executionError;
    }
  }

  /**
   * Execute plan with specific mode handler
   */
  private async _executeWithMode(
    plan: Plan,
    context: ExecutionContext,
    mode: ExecutionMode,
  ): Promise<ExecutionResult> {
    return match(mode)
      .with('plan', async () => {
        const planResult = await this.planModeHandler.handle(plan.tasks, context);
        return this._convertPlanModeResult(planResult);
      })
      .with('execute', async () => {
        return this.executeModeHandler.handle(plan.tasks, context);
      })
      .with('validate', async () => {
        const validationResult = await this.validateModeHandler.handle(plan);
        return this._convertValidationResult(validationResult);
      })
      .with('dry-run', async () => {
        // For dry-run, simulate plan mode
        const planResult = await this.planModeHandler.handle(plan.tasks, context);
        return this._convertPlanModeResult(planResult);
      })
      .exhaustive();
  }

  /**
   * Create execution context from options
   */
  private _createExecutionContext(options: ExecutionOptions): ExecutionContext {
    return {
      agentType: 'claude',
      continueOnError: options.continueOnError ?? false,
      cwd: options.workdir ?? process.cwd(),
      dryRun: options.dryRun ?? false,
      maxRetries: 3,
      strategy: options.strategy,
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Convert plan mode result to execution result
   */
  private _convertPlanModeResult(result: PlanModeResult): ExecutionResult {
    return {
      totalDuration: result.totalDuration,
      tasks: result.tasks,
      branches: [],
      commits: [],
    };
  }

  /**
   * Convert validation result to execution result
   */
  private _convertValidationResult(result: ValidationResult): ExecutionResult {
    const isValid = result.valid;
    const errors = result.errors ?? [];

    return {
      totalDuration: 0,
      tasks: [
        {
          taskId: 'validation',
          status: isValid ? 'success' : 'failure',
          duration: 0,
          ...(errors.length > 0 && { error: errors.join('; ') }),
          output: isValid ? 'Plan validation passed' : 'Plan validation failed',
        },
      ],
      branches: [],
      commits: [],
    };
  }
}
