import { z } from 'zod';

import { TaskSchema } from './decomposer';

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

export const ExecutionTaskSchema = TaskSchema.extend({
  commitHash: z.string().optional(),
  duration: z.number().min(0).optional(),
  endTime: z.date().optional(),
  error: z.string().optional(),
  exitCode: z.number().int().optional(),
  maxRetries: z.number().int().min(0),
  output: z.string().optional(),
  retryCount: z.number().int().min(0),
  startTime: z.date().optional(),
  state: TaskStateSchema,
  stateHistory: z.array(TaskStateTransitionSchema),
  worktreePath: z.string().optional(),
});
export type ExecutionTask = z.infer<typeof ExecutionTaskSchema>;

export const ExecutionPlanSchema = z.object({
  completedAt: z.date().optional(),
  createdAt: z.date(),
  executionLayers: z.array(z.array(ExecutionTaskSchema)),
  id: z.string().min(1),
  mode: ExecutionModeSchema,
  plan: z.lazy(() =>
    z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          touches: z.array(z.string()),
          produces: z.array(z.string()),
          requires: z.array(z.string()),
          estimatedLines: z.number(),
          agentPrompt: z.string(),
        }),
      ),
    }),
  ), // Using z.lazy to avoid circular dependency while maintaining type safety
  prUrls: z.array(z.string().url()).optional(),
  startedAt: z.date().optional(),
  status: ExecutionPlanStatusSchema,
  strategy: ExecutionStrategySchema,
  tasks: z.map(z.string(), ExecutionTaskSchema),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

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

export const ExecutionResultSchema = z.object({
  duration: z.number().min(0),
  endTime: z.date(),
  error: z.string().optional(),
  gitBranches: z.array(z.string()).optional(),
  mode: ExecutionModeSchema,
  planId: z.string().min(1),
  stackUrl: z.url().optional(),
  startTime: z.date(),
  strategy: ExecutionStrategySchema,
  success: z.boolean(),
  tasks: z.array(ExecutionTaskSchema),
  tasksCompleted: z.number().int().min(0),
  tasksFailed: z.number().int().min(0),
  tasksSkipped: z.number().int().min(0),
  tasksTotal: z.number().int().min(0),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const ExecutionMetricsSchema = z.object({
  averageTaskDuration: z.number().min(0),
  completedCount: z.number().int().min(0),
  criticalPathDuration: z.number().min(0),
  failedCount: z.number().int().min(0),
  parallelizationEfficiency: z.number().min(0).max(1),
  resourceUsage: z
    .object({
      avgCpu: z.number().min(0).max(100),
      peakMemory: z.number().int().min(0),
    })
    .optional(),
  skippedCount: z.number().int().min(0),
  taskCount: z.number().int().min(0),
  totalDuration: z.number().min(0),
});
export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

export const ExecutionEventTypeSchema = z.enum([
  'task_state_change',
  'execution_start',
  'execution_complete',
  'execution_error',
  'progress_update',
]);

export const ExecutionEventSchema = z.object({
  data: z.unknown(),
  planId: z.string().min(1),
  taskId: z.string().optional(),
  timestamp: z.date(),
  type: ExecutionEventTypeSchema,
});
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

export const TaskExecutionRequestSchema = z.object({
  mode: ExecutionModeSchema,
  retryAttempts: z.number().int().min(0).optional(),
  task: ExecutionTaskSchema,
  timeout: z.number().int().min(1).optional(),
  workdir: z.string().optional(),
});
export type TaskExecutionRequest = z.infer<typeof TaskExecutionRequestSchema>;

export const TaskExecutionResultSchema = z.object({
  commitHash: z.string().optional(),
  duration: z.number().min(0).optional(),
  error: z.string().optional(),
  exitCode: z.number().int().optional(),
  filesChanged: z.array(z.string()).optional(),
  linesAdded: z.number().int().min(0).optional(),
  linesRemoved: z.number().int().min(0).optional(),
  output: z.string().optional(),
  state: TaskStateSchema,
  taskId: z.string().min(1),
});
export type TaskExecutionResult = z.infer<typeof TaskExecutionResultSchema>;

export const ExecutionProgressUpdateSchema = z.object({
  currentLayer: z.number().int().min(0),
  estimatedTimeRemaining: z.number().int().min(0).optional(),
  message: z.string().min(1),
  planId: z.string().min(1),
  tasksCompleted: z.array(z.string()),
  tasksFailed: z.array(z.string()),
  tasksInProgress: z.array(z.string()),
  totalLayers: z.number().int().min(0),
});
export type ExecutionProgressUpdate = z.infer<typeof ExecutionProgressUpdateSchema>;

export const ExecutionValidationSchema = z.object({
  canProceed: z.boolean(),
  errors: z.array(z.string()),
  suggestions: z.array(z.string()),
  valid: z.boolean(),
  warnings: z.array(z.string()),
});
export type ExecutionValidation = z.infer<typeof ExecutionValidationSchema>;

export const WorktreeStatusSchema = z.enum(['active', 'completed', 'failed', 'cleanup-pending']);

export const WorktreeInfoSchema = z.object({
  baseRef: z.string().min(1),
  branch: z.string().min(1),
  createdAt: z.date(),
  path: z.string().min(1),
  status: WorktreeStatusSchema,
  taskId: z.string().min(1),
});
export type WorktreeInfo = z.infer<typeof WorktreeInfoSchema>;

export const GitSpiceStackInfoSchema = z.object({
  branches: z.array(
    z.object({
      commitHash: z.string().min(1),
      name: z.string().min(1),
      parent: z.string().min(1),
      taskId: z.string().min(1),
    }),
  ),
  prUrls: z.array(z.string().url()).optional(),
  stackRoot: z.string().min(1),
});
export type GitSpiceStackInfo = z.infer<typeof GitSpiceStackInfoSchema>;
