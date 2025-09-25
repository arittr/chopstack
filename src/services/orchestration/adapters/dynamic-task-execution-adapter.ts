import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
} from '@/services/orchestration/types';

import { isNonNullish } from '@/validation/guards';

import { TaskExecutionAdapterFactory } from './task-execution-adapter-factory';

/**
 * Dynamic task execution adapter that selects the appropriate adapter
 * based on the agent type specified in the request or a default
 */
export class DynamicTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly adapters = new Map<string, TaskExecutionAdapter>();
  private _defaultAgent: string;

  constructor(defaultAgent: string = 'claude') {
    this._defaultAgent = defaultAgent;
  }

  /**
   * Set the default agent for execution
   */
  setDefaultAgent(agent: string): void {
    this._defaultAgent = agent;
  }

  /**
   * Get or create an adapter for the specified agent type
   */
  private _getAdapter(agentType?: string): TaskExecutionAdapter {
    const agent = agentType ?? this._defaultAgent;

    if (!this.adapters.has(agent)) {
      const adapter = TaskExecutionAdapterFactory.createAdapter(agent);
      this.adapters.set(agent, adapter);
    }

    const adapter = this.adapters.get(agent);
    if (adapter === undefined) {
      throw new Error(`Adapter for agent '${agent}' not found`);
    }
    return adapter;
  }

  async executeTask(
    request: TaskExecutionRequest & { agent?: string },
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult> {
    // Use agent from request if specified, otherwise use default
    const adapter = this._getAdapter(request.agent ?? this._defaultAgent);
    return adapter.executeTask(request, emitUpdate);
  }

  stopTask(taskId: string): boolean {
    // Try to stop the task in all adapters
    for (const adapter of this.adapters.values()) {
      if (isNonNullish(adapter.stopTask) && adapter.stopTask(taskId)) {
        return true;
      }
    }
    return false;
  }

  getAllTaskStatuses(): Map<string, 'running' | 'stopped' | 'completed' | 'failed'> {
    // Aggregate statuses from all adapters
    const allStatuses = new Map<string, 'running' | 'stopped' | 'completed' | 'failed'>();

    for (const adapter of this.adapters.values()) {
      // Check if adapter has the getAllTaskStatuses method
      if (isNonNullish(adapter.getAllTaskStatuses)) {
        const statuses = adapter.getAllTaskStatuses();
        for (const [taskId, status] of statuses) {
          allStatuses.set(taskId, status);
        }
      }
    }

    return allStatuses;
  }
}
