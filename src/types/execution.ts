import { z } from 'zod';

import type { Plan, Task } from './decomposer';

export const ExecutionModeSchema = z.enum(['plan', 'dry-run', 'execute', 'validate']);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const TaskStateSchema = z.enum([
  'pending', // Initial state
  'ready', // Dependencies satisfied
  'queued', // Scheduled for execution
  'running', // Currently executing
  'completed', // Successfully finished
  'failed', // Execution failed
  'blocked', // Waiting on dependencies
  'skipped', // Conditionally skipped
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const ExecutionStrategySchema = z.enum(['serial', 'parallel', 'hybrid']);
export type ExecutionStrategy = z.infer<typeof ExecutionStrategySchema>;

export type TaskStateTransition = {
  from: TaskState;
  reason?: string | undefined;
  timestamp: Date;
  to: TaskState;
};

export type ExecutionTask = Task & {
  commitHash?: string | undefined;
  duration?: number | undefined;
  endTime?: Date | undefined;
  error?: string | undefined;
  exitCode?: number | undefined;
  maxRetries: number;
  output?: string | undefined;
  retryCount: number;
  startTime?: Date | undefined;
  state: TaskState;
  stateHistory: TaskStateTransition[];
  worktreePath?: string | undefined;
};

export type ExecutionPlan = {
  completedAt?: Date | undefined;
  createdAt: Date;
  executionLayers: ExecutionTask[][];
  id: string;
  mode: ExecutionMode;
  plan: Plan;
  startedAt?: Date | undefined;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  strategy: ExecutionStrategy;
  tasks: Map<string, ExecutionTask>;
};

export const ExecutionOptionsSchema = z.object({
  cleanupOnFailure: z.boolean().optional(),
  continueOnError: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  gitSpice: z.boolean().optional(),
  maxParallelTasks: z.number().int().min(1).optional(),
  mode: ExecutionModeSchema,
  parallel: z.boolean().optional(),
  retryAttempts: z.number().int().min(0).optional(),
  retryDelay: z.number().int().min(0).optional(),
  strategy: ExecutionStrategySchema.optional(),
  timeout: z.number().int().min(1).optional(),
  verbose: z.boolean().optional(),
  workdir: z.string().optional(),
});
export type ExecutionOptions = z.infer<typeof ExecutionOptionsSchema>;

export type ExecutionResult = {
  duration: number;
  endTime: Date;
  error?: string | undefined;
  gitBranches?: string[] | undefined;
  mode: ExecutionMode;
  planId: string;
  stackUrl?: string | undefined;
  startTime: Date;
  strategy: ExecutionStrategy;
  success: boolean;
  tasks: ExecutionTask[];
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  tasksTotal: number;
};

export type ExecutionMetrics = {
  averageTaskDuration: number;
  completedCount: number;
  criticalPathDuration: number;
  failedCount: number;
  parallelizationEfficiency: number;
  resourceUsage?:
    | {
        avgCpu: number;
        peakMemory: number;
      }
    | undefined;
  skippedCount: number;
  taskCount: number;
  totalDuration: number;
};

export type ExecutionEvent = {
  data: unknown;
  planId: string;
  taskId?: string | undefined;
  timestamp: Date;
  type:
    | 'task_state_change'
    | 'execution_start'
    | 'execution_complete'
    | 'execution_error'
    | 'progress_update';
};

export type TaskExecutionRequest = {
  mode: ExecutionMode;
  retryAttempts?: number | undefined;
  task: ExecutionTask;
  timeout?: number | undefined;
  workdir?: string | undefined;
};

export type TaskExecutionResult = {
  commitHash?: string | undefined;
  duration?: number | undefined;
  error?: string | undefined;
  exitCode?: number | undefined;
  filesChanged?: string[] | undefined;
  linesAdded?: number | undefined;
  linesRemoved?: number | undefined;
  output?: string | undefined;
  state: TaskState;
  taskId: string;
};

export type ExecutionProgressUpdate = {
  currentLayer: number;
  estimatedTimeRemaining?: number | undefined;
  message: string;
  planId: string;
  tasksCompleted: string[];
  tasksFailed: string[];
  tasksInProgress: string[];
  totalLayers: number;
};

export type ExecutionValidation = {
  canProceed: boolean;
  errors: string[];
  suggestions: string[];
  valid: boolean;
  warnings: string[];
};

export type WorktreeInfo = {
  baseRef: string;
  branch: string;
  createdAt: Date;
  path: string;
  status: 'active' | 'completed' | 'failed' | 'cleanup-pending';
  taskId: string;
};

export type GitSpiceStackInfo = {
  branches: Array<{
    commitHash: string;
    name: string;
    parent: string;
    taskId: string;
  }>;
  prUrls?: string[] | undefined;
  stackRoot: string;
};
