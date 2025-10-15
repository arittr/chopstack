import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ExecutionOptionsSchema } from '@/core/execution/types';

// Re-export types for convenience
export type { ExecutionMode, ExecutionOptions, VcsMode } from '@/core/execution/types';

// Agent type schema (moved from decomposer.ts)
const AgentTypeSchema = z.enum(['claude', 'codex', 'mock']);

// Decompose command options schema
export const DecomposeCommandOptionsSchema = z
  .object({
    agent: AgentTypeSchema,
    output: z.string().optional(),
    spec: z.string().min(1, 'Spec file path cannot be empty'),
    targetDir: z.string().optional(),
    verbose: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Validate target directory exists and is accessible
      if (data.targetDir === undefined) {
        return true; // Will use process.cwd() as default
      }

      const resolvedPath = resolve(data.targetDir);
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
    // Resolve target directory to absolute path
    if (data.targetDir !== undefined) {
      return { ...data, targetDir: resolve(data.targetDir) };
    }
    return data;
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

// Specify command options schema
export const SpecifyCommandOptionsSchema = z
  .object({
    prompt: z.string().optional(),
    input: z.string().optional(),
    output: z.string().min(1, 'Output file path cannot be empty'),
    cwd: z.string().optional(),
    verbose: z.boolean().default(false),
  })
  .refine((data) => data.prompt !== undefined || data.input !== undefined, {
    message: 'Either --prompt or --input must be provided',
    path: ['prompt', 'input'],
  })
  .refine((data) => !(data.prompt !== undefined && data.input !== undefined), {
    message: 'Cannot specify both --prompt and --input (mutually exclusive)',
    path: ['prompt', 'input'],
  })
  .refine(
    (data) => {
      // Validate cwd exists and is accessible
      if (data.cwd === undefined) {
        return true; // Will use process.cwd() as default
      }

      const resolvedPath = resolve(data.cwd);
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
        'Working directory does not exist or is not accessible. Please provide a valid directory path.',
      path: ['cwd'],
    },
  )
  .transform((data) => {
    // Resolve cwd to absolute path
    if (data.cwd !== undefined) {
      return { ...data, cwd: resolve(data.cwd) };
    }
    return data;
  });
export type SpecifyCommandOptions = z.infer<typeof SpecifyCommandOptionsSchema>;

// Analyze command options schema
export const AnalyzeCommandOptionsSchema = z
  .object({
    spec: z.string().min(1, 'Spec file path cannot be empty'),
    codebase: z.string().optional(),
    output: z.string().optional(),
    format: z.enum(['text', 'json']).default('text'),
    targetDir: z.string().optional(),
    verbose: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Validate target directory exists and is accessible
      if (data.targetDir === undefined) {
        return true; // Will use process.cwd() as default
      }

      const resolvedPath = resolve(data.targetDir);
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
    // Resolve target directory to absolute path
    if (data.targetDir !== undefined) {
      return { ...data, targetDir: resolve(data.targetDir) };
    }
    return data;
  });
export type AnalyzeCommandOptions = z.infer<typeof AnalyzeCommandOptionsSchema>;

// Stack command options schema
export const StackCommandOptionsSchema = z
  .object({
    autoAdd: z.boolean().default(false),
    createStack: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    message: z.string().optional(),
    targetDir: z.string().optional(),
    verbose: z.boolean().default(false),
    tui: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // Validate target directory exists and is accessible
      if (data.targetDir === undefined) {
        return true; // Will use process.cwd() as default
      }

      const resolvedPath = resolve(data.targetDir);
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
    // Resolve target directory to absolute path
    if (data.targetDir !== undefined) {
      return { ...data, targetDir: resolve(data.targetDir) };
    }
    return data;
  });
export type StackArgs = z.infer<typeof StackCommandOptionsSchema>;

// Helper functions for validation
export function validateDecomposeArgs(raw: unknown): DecomposeCommandOptions {
  return DecomposeCommandOptionsSchema.parse(raw);
}

export function validateRunArgs(raw: unknown): RunCommandOptions {
  return RunCommandOptionsSchema.parse(raw);
}

export function validateSpecifyArgs(raw: unknown): SpecifyCommandOptions {
  return SpecifyCommandOptionsSchema.parse(raw);
}

export function validateAnalyzeArgs(raw: unknown): AnalyzeCommandOptions {
  return AnalyzeCommandOptionsSchema.parse(raw);
}

export function validateStackArgs(raw: unknown): StackArgs {
  return StackCommandOptionsSchema.parse(raw);
}
