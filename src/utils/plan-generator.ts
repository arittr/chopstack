import type { DecomposerAgent, Plan } from '../types/decomposer';

import { DagValidator } from './dag-validator';
import { isValidArray } from './guards';
import { logger } from './logger';

export type PlanGenerationOptions = {
  maxRetries?: number;
  verbose?: boolean;
};

export type PlanGenerationResult = {
  attempts: number;
  conflicts: string[];
  plan: Plan;
  success: boolean;
};

/**
 * Generate a plan with automatic retry on conflicts
 */
export async function generatePlanWithRetry(
  agent: DecomposerAgent,
  specContent: string,
  cwd: string,
  options: PlanGenerationOptions = {},
): Promise<PlanGenerationResult> {
  const { maxRetries = 3, verbose = false } = options;
  let attempt = 1;
  const conflictHistory: string[] = [];

  while (attempt <= maxRetries) {
    if (attempt === 1) {
      logger.info('🔍 Analyzing codebase and generating plan...');
    } else {
      logger.info(
        `🔄 Retry attempt ${attempt}/${maxRetries}: Regenerating plan to resolve conflicts...`,
      );
    }

    // Build enhanced prompt for retries
    const enhancedContent = buildEnhancedPrompt(specContent, conflictHistory, attempt);

    // Decompose the specification into a plan
    const plan = await agent.decompose(enhancedContent, cwd, { verbose });
    logger.info(`📋 Generated plan with ${plan.tasks.length} tasks`);

    // Validate the plan
    const validation = DagValidator.validatePlan(plan);

    if (validation.valid) {
      // Success!
      if (attempt > 1) {
        logger.info(`✅ Plan regenerated successfully after ${attempt - 1} retries`);
      }
      return {
        plan,
        attempts: attempt,
        conflicts: conflictHistory,
        success: true,
      };
    }

    // Plan has validation issues
    if (attempt === maxRetries) {
      // Final attempt failed
      if (verbose) {
        logger.error('❌ Plan validation failed after all retry attempts:');
        if (isValidArray(validation.conflicts)) {
          logger.error(`  File conflicts: ${validation.conflicts.join(', ')}`);
        }
        if (isValidArray(validation.circularDependencies)) {
          logger.error(`  Circular dependencies: ${validation.circularDependencies.join(' -> ')}`);
        }
        if (isValidArray(validation.errors)) {
          for (const error of validation.errors) {
            logger.error(`  Error: ${error}`);
          }
        }
      }

      return {
        plan,
        attempts: attempt,
        conflicts: conflictHistory,
        success: false,
      };
    }

    // Record conflicts for next retry
    if (isValidArray(validation.conflicts)) {
      conflictHistory.push(...validation.conflicts);
      if (verbose) {
        logger.warn(`⚠️ Attempt ${attempt} had file conflicts: ${validation.conflicts.join(', ')}`);
      }
    }
    if (isValidArray(validation.circularDependencies) && verbose) {
      logger.warn(
        `⚠️ Attempt ${attempt} had circular dependencies: ${validation.circularDependencies.join(' -> ')}`,
      );
    }
    if (isValidArray(validation.errors) && verbose) {
      logger.warn(`⚠️ Attempt ${attempt} had errors: ${validation.errors.join(', ')}`);
    }

    attempt++;
  }

  // This should never be reached due to the maxRetries check above
  throw new Error('Unexpected end of retry loop');
}

/**
 * Build an enhanced prompt for retry attempts that includes guidance to avoid previous conflicts
 */
function buildEnhancedPrompt(
  originalContent: string,
  conflictHistory: string[],
  attempt: number,
): string {
  if (attempt === 1 || conflictHistory.length === 0) {
    return originalContent;
  }

  const conflictGuidance = buildConflictGuidance(conflictHistory);

  return `${originalContent}

IMPORTANT RETRY INSTRUCTIONS:
The previous plan generation attempt(s) had file conflicts. Please ensure this new plan avoids these issues:

${conflictGuidance}

Key requirements to prevent conflicts:
1. If multiple tasks need to modify the same file, make one task depend on the other (use the 'requires' field)
2. Or combine multiple edits to the same file into a single task
3. Ensure that tasks modifying the same file have a clear dependency chain
4. Tasks that can run in parallel (no dependency relationship) must NOT modify the same files

Please regenerate the plan with proper dependencies to eliminate all file conflicts.`;
}

/**
 * Build specific guidance based on the conflict history
 */
function buildConflictGuidance(conflictHistory: string[]): string {
  const guidance: string[] = [];

  for (const conflict of conflictHistory) {
    // Parse conflict string: "file.ts (parallel conflicts: task1, task2)"
    const match = conflict.match(/^(.+?)\s+\(parallel conflicts:\s+(.+)\)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const [, file, tasks] = match;
      const taskList = tasks.split(/,\s*/);
      guidance.push(
        `- File "${file}" was edited by tasks: ${taskList.join(', ')}
  → Solution: Make these tasks sequential by adding dependencies, or combine them into one task`,
      );
    }
  }

  return guidance.join('\n');
}
