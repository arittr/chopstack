import { EventEmitter } from 'node:events';

import type { ExecutionResult } from '@/core/execution/interfaces';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { TaskOrchestrator } from '@/services/mcp/orchestrator';
import type { Plan } from '@/types/decomposer';
import type { ExecutionOptions } from '@/types/execution';

import {
  ExecutionMonitorServiceImpl,
  ExecutionOrchestrator,
  ExecutionPlannerServiceImpl,
} from '@/services/execution';
import { logger } from '@/utils/logger';

import type { StateManager } from './state-manager';

export type ExecutionEngineDependencies = {
  orchestrator: TaskOrchestrator;
  stateManager: StateManager;
  vcsEngine: VcsEngineService;
};

/**
 * Modernized ExecutionEngine using modular execution services
 */
export class ExecutionEngine extends EventEmitter {
  private readonly executionOrchestrator: ExecutionOrchestrator;
  private readonly plannerService: ExecutionPlannerServiceImpl;
  private readonly monitorService: ExecutionMonitorServiceImpl;
  private readonly activePlans: Map<string, ExecutionResult>;

  constructor(dependencies: ExecutionEngineDependencies) {
    super();

    // Initialize modular services
    this.plannerService = new ExecutionPlannerServiceImpl();
    this.monitorService = new ExecutionMonitorServiceImpl({
      enableProgressBar: true,
      enableRealTimeStats: true,
      logLevel: 'info',
    });

    this.executionOrchestrator = new ExecutionOrchestrator({
      taskOrchestrator: dependencies.orchestrator,
      vcsEngine: dependencies.vcsEngine,
    });

    this.activePlans = new Map();
    this._setupEventForwarding();
  }

  private _setupEventForwarding(): void {
    // Forward events from the orchestrator
    this.executionOrchestrator.on('execution_start', (event: unknown) => {
      this.emit('execution_event', event);
    });

    this.executionOrchestrator.on('execution_complete', (result: ExecutionResult) => {
      this.emit('execution_event', { type: 'execution_complete', result });
    });

    this.executionOrchestrator.on('execution_error', (error: unknown) => {
      this.emit('execution_event', { type: 'execution_error', error });
    });

    this.executionOrchestrator.on('task_start', (event) => {
      this.emit('task_update', event);
    });

    this.executionOrchestrator.on('task_complete', (result) => {
      this.emit('task_update', result);
    });

    this.executionOrchestrator.on('task_error', (event) => {
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

  async execute(plan: Plan, options: ExecutionOptions): Promise<ExecutionResult> {
    logger.info(`🚀 Starting execution in ${options.mode} mode with modular architecture`);

    try {
      // Create execution plan using planner service
      const executionPlan = await this.plannerService.createExecutionPlan(plan, options);
      logger.info(`📋 Created execution plan with ${executionPlan.strategy} strategy`);

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
