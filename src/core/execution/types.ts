import { z } from 'zod';

import { type TaskV2, taskV2Schema } from '@/types/schemas-v2';

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

// VCS mode for controlling how commits/branches are organized
export const VcsModeSchema = z.enum(['simple', 'worktree', 'stacked']);
export type VcsMode = z.infer<typeof VcsModeSchema>;

export const ExecutionPlanStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type ExecutionPlanStatus = z.infer<typeof ExecutionPlanStatusSchema>;

export const TaskStateTransitionSchema = z.object({
  from: TaskStateSchema,
  reason: z.string().optional(),
  timestamp: z.date(),
  to: TaskStateSchema,
});
export type TaskStateTransition = z.infer<typeof TaskStateTransitionSchema>;

export const ExecutionTaskSchema = taskV2Schema.extend({
  branchName: z.string().optional(),
  commitHash: z.string().optional(),
  duration: z.number().min(0).optional(),
  endTime: z.date().optional(),
  error: z.string().optional(),
  exitCode: z.number().int().optional(),
  forbiddenFiles: z.array(z.string()).optional(),
  maxRetries: z.number().int().min(0),
  output: z.string().optional(),
  retryCount: z.number().int().min(0),
  startTime: z.date().optional(),
  state: TaskStateSchema,
  stateHistory: z.array(TaskStateTransitionSchema),
  worktreeDir: z.string().optional(),
});
export type ExecutionTask = z.infer<typeof ExecutionTaskSchema>;

export const ExecutionOptionsSchema = z.object({
  agent: z.string().optional(),
  continueOnError: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  mode: ExecutionModeSchema,
  permissiveValidation: z.boolean().optional(),
  retryAttempts: z.number().int().min(0).optional(),
  retryDelay: z.number().int().min(0).optional(),
  silent: z.boolean().optional(),
  timeout: z.number().int().min(0).optional(),
  verbose: z.boolean().optional(),
  vcsMode: VcsModeSchema.optional().default('simple'),
  workdir: z.string().optional(),
});
export type ExecutionOptions = z.infer<typeof ExecutionOptionsSchema>;

// ExecutionResult is defined in interfaces.ts

export type ExecutionPlan = {
  createdAt: Date;
  executionLayers: ExecutionTask[][];
  id: string;
  mode: ExecutionMode;
  plan: {
    tasks: TaskV2[];
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  tasks: Map<string, ExecutionTask>;
  totalTasks: number;
  vcsMode: VcsMode;
};

export type ExecutionEvent = {
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  planId?: string;
  taskId?: string;
  timestamp: Date;
  type:
    | 'task-start'
    | 'task-complete'
    | 'task-fail'
    | 'task-skip'
    | 'plan-start'
    | 'plan-complete'
    | 'execution_start'
    | 'execution_complete'
    | 'task_state_change'
    | 'progress_update';
};

export type ExecutionMetrics = {
  averageTaskDuration: number;
  completedCount: number;
  criticalPathDuration: number;
  failedCount: number;
  parallelizationEfficiency: number;
  skippedCount: number;
  taskCount: number;
  totalDuration: number;
};

export type ExecutionContext = {
  agentType: 'claude' | 'aider' | 'mock';
  continueOnError: boolean;
  cwd: string;
  dryRun: boolean;
  logger?: typeof console;
  maxRetries: number;
  mode?: ExecutionMode;
  parentRef?: string;
  permissiveValidation?: boolean;
  planMode?: boolean;
  taskTimeout?: number;
  vcsMode?: VcsMode;
  verbose: boolean;
  worktreeDir?: string;
};

// Git-spice specific types
export type GitSpiceStackInfo = {
  branches?: Array<{
    commitHash: string;
    name: string;
    parent: string;
    taskId: string;
  }>;
  prUrls: string[];
  stackRoot: string;
};
