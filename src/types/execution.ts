import type { Plan, Task } from './decomposer';

export type ExecutionMode = 'plan' | 'dry-run' | 'execute' | 'validate';

export type TaskState =
  | 'pending' // Initial state
  | 'ready' // Dependencies satisfied
  | 'queued' // Scheduled for execution
  | 'running' // Currently executing
  | 'completed' // Successfully finished
  | 'failed' // Execution failed
  | 'blocked' // Waiting on dependencies
  | 'skipped'; // Conditionally skipped

export type ExecutionStrategy = 'serial' | 'parallel' | 'hybrid';

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

export type ExecutionOptions = {
  cleanupOnFailure?: boolean | undefined;
  continueOnError?: boolean | undefined;
  dryRun?: boolean | undefined;
  gitSpice?: boolean | undefined;
  maxParallelTasks?: number | undefined;
  mode: ExecutionMode;
  parallel?: boolean | undefined;
  retryAttempts?: number | undefined;
  retryDelay?: number | undefined;
  strategy?: ExecutionStrategy | undefined;
  timeout?: number | undefined;
  verbose?: boolean | undefined;
  workdir?: string | undefined;
};

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
