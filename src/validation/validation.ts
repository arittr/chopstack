/**
 * Comprehensive type validation utilities using Zod schemas
 * Provides runtime validation for all core chopstack types
 */

import { z } from 'zod';

import { planSchemaV2, taskV2Schema } from '@/types/schemas-v2';

import { isNonNullish } from './guards';

/**
 * Validation result type for standardized error handling
 */
export type SafeValidationResult<T> = {
  data?: T;
  errors?: string[];
  success: boolean;
};

/**
 * Safe validation wrapper that catches ZodErrors and returns standardized results
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): SafeValidationResult<T> {
  try {
    const result = schema.parse(data);
    return {
      data: result,
      success: true,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        errors: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        success: false,
      };
    }

    return {
      errors: [`Validation error: ${String(error)}`],
      success: false,
    };
  }
}

/**
 * Strict validation that throws on error - use for internal validation
 */
export function strictValidate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Validates task dependencies are properly structured (v2 only)
 */
export function validateTaskDependencies(tasks: unknown[]): SafeValidationResult<string[]> {
  const taskIds = new Set<string>();
  const errors: string[] = [];

  // Collect all task IDs and validate basic structure
  for (const [index, task] of tasks.entries()) {
    const taskValidation = safeValidate(taskV2Schema, task);
    if (taskValidation.success && isNonNullish(taskValidation.data)) {
      const validTask = taskValidation.data;
      if (taskIds.has(validTask.id)) {
        errors.push(`Duplicate task ID: ${validTask.id}`);
      }
      taskIds.add(validTask.id);
    } else {
      errors.push(
        `Task ${index}: ${taskValidation.errors?.join(', ') ?? 'Invalid task'}`,
      );
    }
  }

  // Validate dependencies reference existing tasks
  for (const task of tasks) {
    const taskValidation = safeValidate(taskV2Schema, task);
    if (taskValidation.success && isNonNullish(taskValidation.data)) {
      const validTask = taskValidation.data;
      for (const dependencyId of validTask.dependencies) {
        if (!taskIds.has(dependencyId)) {
          errors.push(`Task ${validTask.id}: Unknown dependency '${dependencyId}'`);
        }
      }
    }
  }

  return {
    data: [...taskIds],
    ...(errors.length > 0 && { errors }),
    success: errors.length === 0,
  };
}

/**
 * Validates file paths in task definitions (v2 only)
 */
export function validateTaskFilePaths(tasks: unknown[]): SafeValidationResult<string[]> {
  const allFiles = new Set<string>();
  const errors: string[] = [];

  for (const task of tasks) {
    const taskValidation = safeValidate(taskV2Schema, task);
    if (taskValidation.success && isNonNullish(taskValidation.data)) {
      const validTask = taskValidation.data;
      const taskFiles = validTask.files;

      // Check for file path conflicts (parallel tasks shouldn't touch same files)
      for (const file of taskFiles) {
        if (allFiles.has(file)) {
          errors.push(`File conflict: '${file}' is used by multiple tasks`);
        }
        allFiles.add(file);
      }

      // Validate file path format (basic checks)
      for (const file of taskFiles) {
        if (file.includes('..')) {
          errors.push(`Task ${validTask.id}: Invalid file path '${file}' (contains '..')`);
        }
        if (file.startsWith('/') && !file.startsWith(process.cwd())) {
          errors.push(`Task ${validTask.id}: Absolute path '${file}' outside project`);
        }
      }
    }
  }

  return {
    data: [...allFiles],
    ...(errors.length > 0 && { errors }),
    success: errors.length === 0,
  };
}

/**
 * Validates execution plan coherence (v2 only)
 */
export function validateExecutionPlan(plan: unknown): SafeValidationResult<boolean> {
  const planValidation = safeValidate(planSchemaV2, plan);
  if (!planValidation.success) {
    return {
      errors: planValidation.errors ?? ['Invalid plan data'],
      success: false,
    };
  }

  if (!isNonNullish(planValidation.data)) {
    return {
      errors: ['Invalid plan data'],
      success: false,
    };
  }

  const validPlan = planValidation.data;
  const errors: string[] = [];

  // Validate task dependencies
  const depsValidation = validateTaskDependencies(validPlan.tasks);
  if (!depsValidation.success) {
    errors.push(...(depsValidation.errors ?? []));
  }

  // Validate file paths
  const filesValidation = validateTaskFilePaths(validPlan.tasks);
  if (!filesValidation.success) {
    errors.push(...(filesValidation.errors ?? []));
  }

  return {
    data: errors.length === 0,
    ...(errors.length > 0 && { errors }),
    success: errors.length === 0,
  };
}
