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

import { OrchestrationError, TaskExecutionError } from './errors';

/**
 * Orchestrates task execution with improved error handling and consistent event emission
 */
export class TaskOrchestrator extends EventEmitter {
  private readonly taskStatuses = new Map<string, TaskStatus>();
  private readonly taskOutputs = new Map<string, string[]>();
  private readonly taskStartTimes = new Map<string, Date>();
  private readonly activeTasks = new Set<string>();

  constructor(private readonly _adapter: TaskExecutionAdapter) {
    super();
  }

  /**
   * Execute a task with proper error handling
   * @throws {TaskExecutionError} When task execution fails
   * @throws {OrchestrationError} For other orchestration errors
   */
  async executeTask(
    taskId: string,
    title: string,
    prompt: string,
    files: string[],
    workdir?: string,
    mode: ExecutionMode = 'execute',
    agent?: string,
  ): Promise<OrchestratorTaskResult> {
    const request: TaskExecutionRequest & { agent?: string } = {
      taskId,
      title,
      prompt,
      files,
      mode,
      ...(isNonNullish(workdir) ? { workdir } : {}),
      ...(isNonNullish(agent) ? { agent } : {}),
    };

    // Initialize task state
    this._initializeTask(taskId);

    try {
      // Execute task through adapter
      const result = await this._adapter.executeTask(request, (update) => {
        this._handleStreamingUpdate(update);
      });

      // Finalize successful task
      this._finalizeTask(taskId, result);
      return result;
    } catch (error) {
      // Handle and wrap errors appropriately
      const wrappedError = this._wrapError(error, request);
      const failedResult = this._createFailedResult(request, wrappedError);

      // Finalize failed task
      this._finalizeTask(taskId, failedResult);

      // Always throw Error instances, not plain objects
      throw wrappedError;
    } finally {
      // Clean up task state
      this.activeTasks.delete(taskId);
      this.taskStartTimes.delete(taskId);
    }
  }

  /**
   * Stop a running task
   */
  stopTask(taskId: string): boolean {
    const stopped = this._adapter.stopTask?.(taskId) ?? false;

    if (stopped) {
      this._updateTaskStatus(taskId, 'stopped');
      this.activeTasks.delete(taskId);
      this.taskStartTimes.delete(taskId);
    }

    return stopped;
  }

  /**
   * Get the status of a specific task
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskStatuses.get(taskId);
  }

  /**
   * Get all task statuses
   */
  getAllTaskStatuses(): Map<string, TaskStatus> {
    return new Map(this.taskStatuses);
  }

  /**
   * Get IDs of currently running tasks
   */
  getRunningTasks(): string[] {
    return [...this.activeTasks.values()];
  }

  /**
   * Get output for a specific task
   */
  getTaskOutput(taskId: string): string | undefined {
    const outputs = this.taskOutputs.get(taskId);
    return outputs !== undefined ? outputs.join('\n') : undefined;
  }

  private _initializeTask(taskId: string): void {
    this.taskStatuses.set(taskId, 'running');
    this.taskOutputs.set(taskId, []);
    this.taskStartTimes.set(taskId, new Date());
    this.activeTasks.add(taskId);

    // Emit initial status
    this._emitUpdate({
      taskId,
      type: 'status',
      data: 'running',
      timestamp: new Date(),
    });
  }

  private _handleStreamingUpdate(update: StreamingUpdate): void {
    // Record output
    const outputs = this.taskOutputs.get(update.taskId);
    if (outputs !== undefined) {
      if (update.type === 'stdout') {
        outputs.push(update.data);
      } else if (update.type === 'stderr') {
        outputs.push(`[stderr] ${update.data}`);
      }
    }

    // Update status
    if (update.type === 'status') {
      const status = this._coerceStatus(update.data);
      if (status !== undefined) {
        this.taskStatuses.set(update.taskId, status);
      }
    }

    // Always emit the update
    this._emitUpdate(update);
  }

  private _finalizeTask(taskId: string, result: OrchestratorTaskResult): void {
    this.taskStatuses.set(taskId, result.status);
    this._ensureOutputRecorded(taskId, result.output);
  }

  private _updateTaskStatus(taskId: string, status: TaskStatus): void {
    this.taskStatuses.set(taskId, status);
    this._emitUpdate({
      taskId,
      type: 'status',
      data: status,
      timestamp: new Date(),
    });
  }

  private _emitUpdate(update: StreamingUpdate): void {
    this.emit('taskUpdate', update);
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

  private _wrapError(error: unknown, request: TaskExecutionRequest): Error {
    // If it's already an OrchestrationError, return as-is
    if (error instanceof OrchestrationError) {
      return error;
    }

    // If it's a regular Error, wrap it
    if (error instanceof Error) {
      return new TaskExecutionError(error.message, request.taskId, undefined, undefined, {
        originalError: error.name,
        stack: error.stack,
      });
    }

    // For unknown errors, create a new TaskExecutionError
    return new TaskExecutionError(
      `Task execution failed: ${String(error)}`,
      request.taskId,
      undefined,
      undefined,
      { originalError: String(error) },
    );
  }

  private _createFailedResult(request: TaskExecutionRequest, error: Error): OrchestratorTaskResult {
    const startTime = this.taskStartTimes.get(request.taskId);
    const endTime = new Date();
    const duration = isNonNullish(startTime) ? endTime.getTime() - startTime.getTime() : undefined;

    // Extract details from TaskExecutionError if available
    const executionError = error instanceof TaskExecutionError ? error : undefined;

    return {
      taskId: request.taskId,
      mode: request.mode,
      status: 'failed',
      error: error.message,
      output: this.getTaskOutput(request.taskId) ?? error.message,
      ...(isNonNullish(startTime) && { startTime }),
      endTime,
      ...(isNonNullish(duration) && { duration }),
      ...(isNonNullish(executionError?.exitCode) && { exitCode: executionError.exitCode }),
    };
  }

  private _coerceStatus(value: string): TaskStatus | undefined {
    const validStatuses: TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'stopped'];
    return validStatuses.includes(value as TaskStatus) ? (value as TaskStatus) : undefined;
  }
}
