import { z } from 'zod';

export const ExecuteTaskSchema = z.object({
  taskId: z.string().describe('Unique identifier for the task'),
  title: z.string().describe('Human-readable task title'),
  prompt: z.string().describe('The prompt to send to Claude Code'),
  files: z.array(z.string()).describe('List of files relevant to this task'),
  strategy: z.enum(['serial', 'parallel']).describe('Execution strategy'),
  workdir: z.string().optional().describe('Working directory for parallel tasks'),
});

export const ParallelTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  files: z.array(z.string()),
});

export const ExecuteParallelTasksSchema = z.object({
  tasks: z.array(ParallelTaskSchema).describe('Array of tasks to execute in parallel'),
  baseRef: z.string().describe('Git reference to branch from'),
});

export type ExecuteTaskParams = z.infer<typeof ExecuteTaskSchema>;
export type ParallelTask = z.infer<typeof ParallelTaskSchema>;
export type ExecuteParallelTasksParams = z.infer<typeof ExecuteParallelTasksSchema>;
