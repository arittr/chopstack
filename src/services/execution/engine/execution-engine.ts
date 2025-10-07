import { EventEmitter } from 'node:events';

import type { ExecutionResult } from '@/core/execution/interfaces';
import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionMonitorService } from '@/services/execution/execution-monitor-service';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { ExecutionPlannerService } from '@/services/execution/execution-planner-service';
import type { Plan } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';

import type { StateManager } from './state-manager';

export type ExecutionEngineDependencies = {
  monitorService: ExecutionMonitorService;
  orchestrator: ExecutionOrchestrator;
  plannerService: ExecutionPlannerService;
  stateManager: StateManager;
};

/**
 * Modernized ExecutionEngine using modular execution services
 */
export class ExecutionEngine extends EventEmitter {
  private readonly executionOrchestrator: ExecutionOrchestrator;
  private readonly plannerService: ExecutionPlannerService;
  private readonly monitorService: ExecutionMonitorService;
  private readonly stateManager: StateManager;
  private readonly activePlans: Map<string, ExecutionResult>;

  constructor(dependencies: ExecutionEngineDependencies) {
    super();

    this.plannerService = dependencies.plannerService;
    this.monitorService = dependencies.monitorService;
    this.executionOrchestrator = dependencies.orchestrator;
    this.stateManager = dependencies.stateManager;

    this.activePlans = new Map();
    this._setupEventForwarding();
  }

  private _setupEventForwarding(): void {
    // Forward events from the orchestrator
    this.executionOrchestrator.on('executionStart', (event: unknown) => {
      this.emit('execution_event', event);
    });

    this.executionOrchestrator.on('executionComplete', (result: ExecutionResult) => {
      this.emit('execution_event', { type: 'execution_complete', result });
    });

    this.executionOrchestrator.on('executionError', (error: unknown) => {
      this.emit('execution_event', { type: 'execution_error', error });
    });

    this.executionOrchestrator.on('taskStart', (event) => {
      this.emit('task_update', event);
    });

    this.executionOrchestrator.on('taskComplete', (result) => {
      this.emit('task_update', result);
    });

    this.executionOrchestrator.on('taskError', (event) => {
      this.emit('task_update', event);
    });

    // Forward monitor events
    this.monitorService.on('execution_start', (event) => {
      this.emit('execution_event', event);
    });

    this.monitorService.on('task_state_change', (event) => {
      this.emit('task_update', event);
    });

    this.monitorService.on('metrics_update', (event) => {
      this.emit('execution_event', event);
    });
  }

  async execute(plan: Plan, options: ExecutionOptions, jobId?: string): Promise<ExecutionResult> {
    logger.info(`🚀 Starting execution in ${options.mode} mode with modular architecture`);

    try {
      // Create execution plan using planner service
      const executionPlan = await this.plannerService.createExecutionPlan(plan, options, jobId);
      logger.info(`📋 Created execution plan with ${executionPlan.vcsMode} VCS mode`);

      // Start monitoring
      this.monitorService.startMonitoring(executionPlan);

      // Execute using orchestrator
      const result = await this.executionOrchestrator.execute(plan, options);

      // Stop monitoring
      this.monitorService.stopMonitoring(executionPlan.id);

      // Store result for tracking
      const planId = executionPlan.id;
      this.activePlans.set(planId, result);

      logger.info(`✅ Execution completed successfully`);
      logger.info(
        `📊 Duration: ${result.totalDuration}ms, Tasks: ${result.tasks.length} processed`,
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Execution failed: ${errorMessage}`);
      throw error;
    }
  }

  cancelExecution(planId: string): boolean {
    this.activePlans.delete(planId);
    this.monitorService.stopMonitoring(planId);
    logger.info(`🛑 Cancelled execution for plan ${planId}`);
    return true;
  }

  getActivePlans(): ExecutionResult[] {
    return [...this.activePlans.values()];
  }

  getPlanStatus(planId: string): ExecutionResult | undefined {
    return this.activePlans.get(planId);
  }
}
