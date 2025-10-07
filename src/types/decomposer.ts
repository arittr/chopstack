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
  layer: z.number().optional().describe('Execution layer for parallel processing'),
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
export const ValidationResultSchema = z.object({
  circularDependencies: z.array(z.string()).optional(),
  conflictingTasks: z.array(TaskSchema).optional(),
  conflicts: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
  valid: z.boolean(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// Plan metrics
export const PlanMetricsSchema = z.object({
  criticalPathLength: z.number().int().min(0),
  estimatedSpeedup: z.number().min(1),
  executionLayers: z.number().int().min(1),
  maxParallelization: z.number().int().min(1),
  taskCount: z.number().int().min(0),
  totalEstimatedLines: z.number().int().min(0),
});
export type PlanMetrics = z.infer<typeof PlanMetricsSchema>;

// Agent types
export const AgentTypeSchema = z.enum(['claude', 'codex', 'mock']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

// Decomposer agent interface
export type DecomposerAgent = {
  decompose(specContent: string, cwd: string, options?: { verbose?: boolean }): Promise<Plan>;
};

// CLI options for decompose command schema
export const DecomposeOptionsSchema = z.object({
  agent: AgentTypeSchema,
  output: z.string().optional(),
  spec: z.string().min(1),
  targetDir: z.string().optional(),
  verbose: z.boolean().optional(),
});
export type DecomposeOptions = z.infer<typeof DecomposeOptionsSchema>;
