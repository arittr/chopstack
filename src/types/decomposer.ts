import { z } from 'zod';

// Core task definition
export const TaskSchema = z.object({
  id: z.string().describe('Unique kebab-case identifier'),
  title: z.string().describe('Short descriptive title'),
  description: z.string().describe('Detailed description of what needs to be done'),
  touches: z.array(z.string()).describe('List of existing files to modify'),
  produces: z.array(z.string()).describe('List of new files to create'),
  requires: z.array(z.string()).describe('List of task IDs this depends on'),
  estimatedLines: z.number().describe('Estimated lines of code changes'),
  agentPrompt: z.string().describe('Specific prompt for implementing this task'),
});

export type Task = z.infer<typeof TaskSchema>;

// Plan structure
export const PlanSchema = z.object({
  tasks: z.array(TaskSchema),
});

export type Plan = z.infer<typeof PlanSchema>;

// Raw plan from agent before validation
export type RawPlan = {
  tasks: Partial<Task>[];
};

// Validation results
export type ValidationResult = {
  circularDependencies?: string[];
  conflictingTasks?: Task[];
  conflicts?: string[];
  errors?: string[];
  valid: boolean;
};

// Plan metrics
export type PlanMetrics = {
  criticalPathLength: number;
  estimatedSpeedup: number;
  executionLayers: number;
  maxParallelization: number;
  taskCount: number;
  totalEstimatedLines: number;
};

// Agent types
export const AgentTypeSchema = z.enum(['claude', 'aider', 'mock']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

// Decomposer agent interface
export type DecomposerAgent = {
  decompose(specContent: string, cwd: string): Promise<Plan>;
};

// CLI options for decompose command schema
export const DecomposeOptionsSchema = z.object({
  agent: AgentTypeSchema,
  output: z.string().optional(),
  spec: z.string().min(1),
  verbose: z.boolean().optional(),
});
export type DecomposeOptions = z.infer<typeof DecomposeOptionsSchema>;
