import { z } from 'zod';

import { AgentTypeSchema, type DecomposeOptions, DecomposeOptionsSchema } from './decomposer';
import { ExecutionOptionsSchema } from './execution';

// Re-export types for convenience
export type { DecomposeOptions } from './decomposer';
export type { ExecutionMode, ExecutionOptions, ExecutionStrategy } from './execution';

// Decompose command options schema
export const DecomposeCommandOptionsSchema = z.object({
  agent: AgentTypeSchema,
  output: z.string().optional(),
  spec: z.string().min(1, 'Spec file path cannot be empty'),
  verbose: z.boolean(),
});
export type DecomposeCommandOptions = z.infer<typeof DecomposeCommandOptionsSchema>;

// Execute command options schema - extends ExecutionOptions with plan file
export const ExecuteCommandOptionsSchema = ExecutionOptionsSchema.extend({
  plan: z.string().min(1, 'Plan file path cannot be empty'),
});
export type ExecuteCommandOptions = z.infer<typeof ExecuteCommandOptionsSchema>;

// Helper functions for validation
export function validateDecomposeArgs(raw: unknown): DecomposeOptions {
  return DecomposeOptionsSchema.parse(raw);
}

export function validateExecuteArgs(raw: unknown): ExecuteCommandOptions {
  return ExecuteCommandOptionsSchema.parse(raw);
}
