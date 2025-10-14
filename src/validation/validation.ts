/**
 * Comprehensive type validation utilities using Zod schemas
 * Provides runtime validation for all core chopstack types
 */

import { z } from 'zod';

import { PlanSchema, TaskSchema } from '@/types/decomposer';
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
 * Validates task dependencies are properly structured (supports both v1 and v2)
 */
export function validateTaskDependencies(tasks: unknown[]): SafeValidationResult<string[]> {
  const taskIds = new Set<string>();
  const errors: string[] = [];

  // Collect all task IDs and validate basic structure
  for (const [index, task] of tasks.entries()) {
    // Try v2 first, then fall back to v1
    let taskValidation = safeValidate(taskV2Schema, task);
    if (!taskValidation.success) {
      taskValidation = safeValidate(TaskSchema, task);
    }

    if (!taskValidation.success) {
      errors.push(`Task ${index}: ${taskValidation.errors?.join(', ')}`);
      continue;
    }

    if (!isNonNullish(taskValidation.data)) {
      errors.push(`Task ${index}: Invalid task data`);
      continue;
    }

    const validTask = taskValidation.data;
    if (taskIds.has(validTask.id)) {
      errors.push(`Duplicate task ID: ${validTask.id}`);
    }
    taskIds.add(validTask.id);
  }

  // Validate dependencies reference existing tasks
  for (const task of tasks) {
    // Try v2 first, then fall back to v1
    let taskValidation = safeValidate(taskV2Schema, task);
    if (!taskValidation.success) {
      taskValidation = safeValidate(TaskSchema, task);
    }

    if (!taskValidation.success) {
      continue;
    }

    if (!isNonNullish(taskValidation.data)) {
      continue;
    }

    const validTask = taskValidation.data;
    // v2 uses 'dependencies', v1 uses 'requires'
    const dependencies = 'dependencies' in validTask ? validTask.dependencies : validTask.requires;
    for (const dependencyId of dependencies) {
      if (!taskIds.has(dependencyId)) {
        errors.push(`Task ${validTask.id}: Unknown dependency '${dependencyId}'`);
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
 * Validates file paths in task definitions (supports both v1 and v2)
 */
export function validateTaskFilePaths(tasks: unknown[]): SafeValidationResult<string[]> {
  const allFiles = new Set<string>();
  const errors: string[] = [];

  for (const task of tasks) {
    // Try v2 first, then fall back to v1
    let taskValidation = safeValidate(taskV2Schema, task);
    if (!taskValidation.success) {
      taskValidation = safeValidate(TaskSchema, task);
    }

    if (!taskValidation.success) {
      continue;
    }

    if (!isNonNullish(taskValidation.data)) {
      continue;
    }

    const validTask = taskValidation.data;

    // v2 uses 'files', v1 uses 'touches' + 'produces'
    const taskFiles = 'files' in validTask ? validTask.files : [...validTask.touches, ...validTask.produces];

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

  return {
    data: [...allFiles],
    ...(errors.length > 0 && { errors }),
    success: errors.length === 0,
  };
}

/**
 * Validates execution plan coherence (supports both v1 and v2)
 */
export function validateExecutionPlan(plan: unknown): SafeValidationResult<boolean> {
  // Try v2 first, then fall back to v1
  let planValidation = safeValidate(planSchemaV2, plan);
  if (!planValidation.success) {
    planValidation = safeValidate(PlanSchema, plan);
  }

  if (!planValidation.success) {
    return {
      ...(planValidation.errors !== undefined && { errors: planValidation.errors }),
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
