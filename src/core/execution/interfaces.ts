import type { ExecutionStrategy } from '@/core/execution/types';
import type { Plan, Task, ValidationResult } from '@/types/decomposer';

/**
 * Core interface for task execution
 */
export type TaskExecutor = {
  execute(task: Task, context: ExecutionContext): Promise<TaskResult>;
};

/**
 * Core interface for plan generation
 */
export type PlanGenerator = {
  generate(spec: string, options: PlanGenerationOptions): Promise<Plan>;
};

/**
 * Core interface for plan validation
 */
export type PlanValidator = {
  validate(plan: Plan): Promise<ValidationResult>;
};

/**
 * Handler for plan mode execution
 */
export type PlanModeHandler = {
  handle(tasks: Task[], context: ExecutionContext): Promise<PlanModeResult>;
};

/**
 * Handler for execute mode
 */
export type ExecuteModeHandler = {
  handle(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult>;
};

/**
 * Handler for validate mode
 */
export type ValidateModeHandler = {
  handle(plan: Plan): Promise<ValidationResult>;
};

/**
 * Context passed to execution handlers
 */
export type ExecutionContext = {
  agentType: string;
  continueOnError: boolean;
  cwd: string;
  dryRun: boolean;
  maxRetries: number;
  strategy: ExecutionStrategy;
  verbose: boolean;
};

/**
 * Result from task execution
 */
export type TaskResult = {
  duration: number;
  error?: string;
  output?: string;
  planOutput?: Record<string, unknown>;
  status: 'success' | 'failure' | 'skipped';
  taskId: string;
};

/**
 * Result from plan mode
 */
export type PlanModeResult = {
  failureCount: number;
  skippedCount: number;
  successCount: number;
  tasks: TaskResult[];
  totalDuration: number;
};

/**
 * Result from execute mode
 */
export type ExecutionResult = {
  branches: string[];
  commits: string[];
  tasks: TaskResult[];
  totalDuration: number;
};

/**
 * Options for plan generation
 */
export type PlanGenerationOptions = {
  agentType: string;
  cwd: string;
  maxRetries: number;
  verbose: boolean;
};
