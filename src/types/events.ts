import type { ClaudeStreamEvent } from '@/services/orchestration/adapters/claude-stream-types.js';

import type { Task } from './decomposer.js';

// Re-export for convenience
export type { ClaudeStreamEvent };

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export type TaskContext = {
  branchName?: string;
  taskId: string;
  taskName: string;
  workdir?: string;
};

export type TaskProgress = {
  filesModified?: number;
  message?: string;
  phase: 'starting' | 'executing' | 'committing' | 'complete' | 'failed';
};

export type TaskResult = {
  error?: Error;
  filesChanged?: string[];
  success: boolean;
};

// Typed event payloads
// Event keys use colon notation for namespacing (allowed by naming-convention rule)
export type ExecutionEvents = {
  log: { level: LogLevel; message: string; metadata?: Record<string, unknown> };
  'stream:data': { event: ClaudeStreamEvent; taskId: string };
  'task:complete': { result: TaskResult; taskId: string };
  'task:failed': { error: Error; taskId: string };
  'task:progress': { progress: TaskProgress; taskId: string };
  'task:start': { context: TaskContext; task: Task };
  'vcs:branch-created': { branchName: string; parentBranch: string };
  'vcs:commit': { branchName: string; filesChanged: string[]; message: string };
};

// Event handler types
export type EventHandler<T extends keyof ExecutionEvents> = (data: ExecutionEvents[T]) => void;
