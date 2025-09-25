import type { ExecutionMode } from '@/core/execution/types';

/**
 * Status lifecycle for orchestrated tasks
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

/**
 * Result payload emitted by task orchestration flows
 */
export type OrchestratorTaskResult = {
  duration?: number;
  endTime?: Date;
  error?: string;
  exitCode?: number;
  filesChanged?: string[];
  mode: ExecutionMode;
  output?: string;
  startTime?: Date;
  status: TaskStatus;
  taskId: string;
  validationResults?: {
    canProceed: boolean;
    errors: string[];
    warnings: string[];
  };
};

/**
 * Streaming updates emitted during task execution
 */
export type StreamingUpdate = {
  data: string;
  taskId: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'status';
};

/**
 * Incoming execution request from orchestrator to adapters
 */
export type TaskExecutionRequest = {
  files: string[];
  mode: ExecutionMode;
  prompt: string;
  taskId: string;
  title: string;
  workdir?: string;
};

/**
 * Adapter responsible for delegating task execution to concrete agents
 */
export type TaskExecutionAdapter = {
  executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult>;

  stopTask?(taskId: string): boolean;
};
