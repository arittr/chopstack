import { EventEmitter } from 'node:events';

import type { ExecutionMode } from '@/core/execution/types';
import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
  TaskStatus,
} from '@/services/orchestration/types';

import { isNonNullish } from '@/validation/guards';

/**
 * Orchestrates task execution delegating to an injected adapter
 */
export class TaskOrchestrator extends EventEmitter {
  private readonly taskStatuses = new Map<string, TaskStatus>();
  private readonly taskOutputs = new Map<string, string[]>();
  private readonly taskStartTimes = new Map<string, Date>();
  private readonly activeTasks = new Set<string>();

  constructor(private readonly _adapter: TaskExecutionAdapter) {
    super();
  }

  async executeTask(
    taskId: string,
    title: string,
    prompt: string,
    files: string[],
    workdir?: string,
    mode: ExecutionMode = 'execute',
  ): Promise<OrchestratorTaskResult> {
    const request: TaskExecutionRequest = {
      taskId,
      title,
      prompt,
      files,
      mode,
      ...(isNonNullish(workdir) ? { workdir } : {}),
    };

    this.taskStatuses.set(taskId, 'running');
    this.taskOutputs.set(taskId, []);
    this.taskStartTimes.set(taskId, new Date());
    this.activeTasks.add(taskId);

    this._handleStreamingUpdate({
      taskId,
      type: 'status',
      data: 'running',
      timestamp: new Date(),
    });

    try {
      const result = await this._adapter.executeTask(request, (update) => {
        this._handleStreamingUpdate(update);
      });

      this._finalizeTask(taskId, result);
      return result;
    } catch (error) {
      const failedResult = this._normalizeFailureResult(request, error);
      this._finalizeTask(taskId, failedResult);
      throw failedResult;
    } finally {
      this.activeTasks.delete(taskId);
      this.taskStartTimes.delete(taskId);
    }
  }

  stopTask(taskId: string): boolean {
    const stopped = this._adapter.stopTask?.(taskId) ?? false;

    if (stopped) {
      this.taskStatuses.set(taskId, 'stopped');

      this._handleStreamingUpdate({
        taskId,
        type: 'status',
        data: 'stopped',
        timestamp: new Date(),
      });

      this.activeTasks.delete(taskId);
      this.taskStartTimes.delete(taskId);
    }

    return stopped;
  }

  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskStatuses.get(taskId);
  }

  getAllTaskStatuses(): Map<string, TaskStatus> {
    return new Map(this.taskStatuses);
  }

  getRunningTasks(): string[] {
    return [...this.activeTasks.values()];
  }

  getTaskOutput(taskId: string): string | undefined {
    const outputs = this.taskOutputs.get(taskId);
    return outputs !== undefined ? outputs.join('\n') : undefined;
  }

  private _handleStreamingUpdate(update: StreamingUpdate): void {
    const outputs = this.taskOutputs.get(update.taskId);

    if (outputs !== undefined) {
      if (update.type === 'stdout') {
        outputs.push(update.data);
      }

      if (update.type === 'stderr') {
        outputs.push(`[stderr] ${update.data}`);
      }
    }

    if (update.type === 'status') {
      const status = this._coerceStatus(update.data);
      if (status !== undefined) {
        this.taskStatuses.set(update.taskId, status);
      }
    }

    this.emit('taskUpdate', update);
  }

  private _finalizeTask(taskId: string, result: OrchestratorTaskResult): void {
    this.taskStatuses.set(taskId, result.status);
    this._ensureOutputRecorded(taskId, result.output);
  }

  private _ensureOutputRecorded(taskId: string, output?: string): void {
    if (!isNonNullish(output) || output.trim() === '') {
      return;
    }

    const outputs = this.taskOutputs.get(taskId);
    if (outputs === undefined || outputs.length === 0) {
      this.taskOutputs.set(taskId, [output]);
    }
  }

  private _normalizeFailureResult(
    request: TaskExecutionRequest,
    error: unknown,
  ): OrchestratorTaskResult {
    if (this._isOrchestratorTaskResult(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    const startTime = this.taskStartTimes.get(request.taskId);

    return {
      taskId: request.taskId,
      mode: request.mode,
      status: 'failed',
      error: message,
      output: message,
      endTime: new Date(),
      ...(isNonNullish(startTime) ? { startTime } : {}),
    };
  }

  private _coerceStatus(value: string): TaskStatus | undefined {
    if (value === 'pending' || value === 'running' || value === 'completed') {
      return value;
    }

    if (value === 'failed' || value === 'stopped') {
      return value;
    }

    return undefined;
  }

  private _isOrchestratorTaskResult(value: unknown): value is OrchestratorTaskResult {
    return (
      typeof value === 'object' &&
      value !== null &&
      'taskId' in value &&
      'mode' in value &&
      'status' in value
    );
  }
}
