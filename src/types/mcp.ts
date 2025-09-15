import { z } from 'zod';

import { ExecutionStrategySchema } from './execution';

// MCP-specific strategy (subset of full ExecutionStrategy)
export const TaskExecutionStrategySchema = ExecutionStrategySchema.exclude(['hybrid']);
export type TaskExecutionStrategy = z.infer<typeof TaskExecutionStrategySchema>;

export const TaskExecutionParamsSchema = z.object({
  files: z.array(z.string()),
  prompt: z.string().min(1),
  strategy: TaskExecutionStrategySchema,
  taskId: z.string().min(1),
  title: z.string().min(1),
  workdir: z.string().optional(),
});
export type TaskExecutionParams = z.infer<typeof TaskExecutionParamsSchema>;

export const ParallelTaskSchema = z.object({
  files: z.array(z.string()),
  id: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().min(1),
});
export type ParallelTask = z.infer<typeof ParallelTaskSchema>;

export const McpTaskResultSchema = z.object({
  exitCode: z.number().int(),
  output: z.string(),
  status: z.enum(['completed', 'failed']),
  taskId: z.string().min(1),
});
export type McpTaskResult = z.infer<typeof McpTaskResultSchema>;

export const WorktreeResultSchema = z.object({
  branchName: z.string().min(1),
  status: z.literal('created'),
  taskId: z.string().min(1),
  worktreePath: z.string().min(1),
});
export type WorktreeResult = z.infer<typeof WorktreeResultSchema>;

export const BranchResultSchema = z.object({
  branchName: z.string().min(1),
  parentBranch: z.string().optional(),
  status: z.literal('created'),
  tool: z.enum(['git-spice', 'git']),
});
export type BranchResult = z.infer<typeof BranchResultSchema>;

export const MergeResultSchema = z.object({
  branch: z.string().min(1),
  error: z.string().optional(),
  status: z.enum(['merged', 'failed']),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

export const MergeStrategySchema = z.enum(['merge', 'rebase']);
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;
