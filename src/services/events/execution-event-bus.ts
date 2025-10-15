import { EventEmitter } from 'node:events';

import type {
  ClaudeStreamEvent,
  EventHandler,
  ExecutionEvents,
  LogLevel,
  TaskContext,
  TaskProgress,
  TaskResult,
} from '@/types/events.js';
import type { TaskV2 } from '@/types/schemas-v2.js';

/**
 * Central event bus for execution events.
 * Decouples event emission from consumption, enabling flexible logging,
 * TUI rendering, metrics collection, and more.
 */
export class ExecutionEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to avoid warnings in parallel execution scenarios
    this.setMaxListeners(50);
  }

  // ==================== Task Events ====================

  emitTaskStart(task: TaskV2, context: TaskContext): void {
    this.emit('task:start', { task, context });
  }

  emitTaskProgress(taskId: string, progress: TaskProgress): void {
    this.emit('task:progress', { taskId, progress });
  }

  emitTaskComplete(taskId: string, result: TaskResult): void {
    this.emit('task:complete', { taskId, result });
  }

  emitTaskFailed(taskId: string, error: Error): void {
    this.emit('task:failed', { taskId, error });
  }

  // ==================== Stream Events ====================

  emitStreamData(taskId: string, event: ClaudeStreamEvent): void {
    this.emit('stream:data', { taskId, event });
  }

  // ==================== Log Events ====================

  emitLog(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    this.emit('log', { level, message, metadata });
  }

  // ==================== VCS Events ====================

  emitBranchCreated(branchName: string, parentBranch: string): void {
    this.emit('vcs:branch-created', { branchName, parentBranch });
  }

  emitCommit(branchName: string, message: string, filesChanged: string[]): void {
    this.emit('vcs:commit', { branchName, message, filesChanged });
  }

  // ==================== Type-safe Event Subscriptions ====================

  onTaskStart(handler: EventHandler<'task:start'>): void {
    this.on('task:start', handler);
  }

  onTaskProgress(handler: EventHandler<'task:progress'>): void {
    this.on('task:progress', handler);
  }

  onTaskComplete(handler: EventHandler<'task:complete'>): void {
    this.on('task:complete', handler);
  }

  onTaskFailed(handler: EventHandler<'task:failed'>): void {
    this.on('task:failed', handler);
  }

  onStreamData(handler: EventHandler<'stream:data'>): void {
    this.on('stream:data', handler);
  }

  onLog(handler: EventHandler<'log'>): void {
    this.on('log', handler);
  }

  onBranchCreated(handler: EventHandler<'vcs:branch-created'>): void {
    this.on('vcs:branch-created', handler);
  }

  onCommit(handler: EventHandler<'vcs:commit'>): void {
    this.on('vcs:commit', handler);
  }

  // ==================== Utility Methods ====================

  /**
   * Remove all event listeners for a specific event type.
   * Useful for cleanup in tests or when reconfiguring consumers.
   */
  removeAllListenersForEvent<T extends keyof ExecutionEvents>(event: T): void {
    this.removeAllListeners(event);
  }

  /**
   * Get the count of listeners for a specific event type.
   * Useful for debugging and testing.
   */
  getListenerCount<T extends keyof ExecutionEvents>(event: T): number {
    return this.listenerCount(event);
  }
}
