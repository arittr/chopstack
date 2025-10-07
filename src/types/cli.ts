import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ExecutionOptionsSchema } from '@/core/execution/types';

import { AgentTypeSchema, type DecomposeOptions, DecomposeOptionsSchema } from './decomposer';

// Re-export types for convenience
export type { DecomposeOptions } from './decomposer';
export type { ExecutionMode, ExecutionOptions, VcsMode } from '@/core/execution/types';

// Decompose command options schema
export const DecomposeCommandOptionsSchema = z.object({
  agent: AgentTypeSchema,
  output: z.string().optional(),
  spec: z.string().min(1, 'Spec file path cannot be empty'),
  verbose: z.boolean(),
});
export type DecomposeCommandOptions = z.infer<typeof DecomposeCommandOptionsSchema>;

// Run command options schema - supports both spec and plan inputs
export const RunCommandOptionsSchema = ExecutionOptionsSchema.extend({
  agent: AgentTypeSchema.optional(),
  plan: z.string().optional(),
  spec: z.string().optional(),
  targetDir: z.string().optional(),
  tui: z.boolean().default(true),
  writeLog: z.boolean().default(false),
})
  .refine((data) => data.spec !== undefined || data.plan !== undefined, {
    message: 'Either --spec or --plan must be provided',
    path: ['spec', 'plan'],
  })
  .refine(
    (data) => {
      // Validate target directory exists and is accessible
      const targetDir = data.targetDir ?? data.workdir;
      if (targetDir === undefined) {
        return true; // Will use process.cwd() as default
      }

      const resolvedPath = resolve(targetDir);
      if (!existsSync(resolvedPath)) {
        return false;
      }

      try {
        const stats = statSync(resolvedPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    },
    {
      message:
        'Target directory does not exist or is not accessible. Please provide a valid directory path.',
      path: ['targetDir'],
    },
  )
  .transform((data) => {
    // Map targetDir to workdir, with targetDir taking precedence
    // Resolve to absolute path for consistency
    const targetPath = data.targetDir ?? data.workdir;
    if (targetPath !== undefined) {
      return { ...data, workdir: resolve(targetPath) };
    }
    return data;
  });
export type RunCommandOptions = z.infer<typeof RunCommandOptionsSchema>;

// Stack command options schema
export const StackCommandOptionsSchema = z.object({
  autoAdd: z.boolean().default(false),
  createStack: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  message: z.string().optional(),
  verbose: z.boolean().default(false),
  tui: z.boolean().default(true),
});
export type StackArgs = z.infer<typeof StackCommandOptionsSchema>;

// Helper functions for validation
export function validateDecomposeArgs(raw: unknown): DecomposeOptions {
  return DecomposeOptionsSchema.parse(raw);
}

export function validateRunArgs(raw: unknown): RunCommandOptions {
  return RunCommandOptionsSchema.parse(raw);
}

export function validateStackArgs(raw: unknown): StackArgs {
  return StackCommandOptionsSchema.parse(raw);
}
