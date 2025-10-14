import type { ValidateModeHandler } from '@/core/execution/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { DagValidator } from '@/validation/dag-validator';
import { isValidArray } from '@/validation/guards';

// Temporary validation result type for v1 compatibility
// TODO: This should be replaced with v2 validation types in task-2-10-validation-and-cleanup
type ValidationResult = {
  valid: boolean;
  errors?: string[];
  conflicts?: string[];
  circularDependencies?: string[];
};

export class ValidateModeHandlerImpl implements ValidateModeHandler {
  async handle(plan: PlanV2): Promise<ValidationResult> {
    logger.info('[chopstack] Validating execution plan...');

    // Convert PlanV2 to v1 Plan format for validation
    // TODO: Update DagValidator to support PlanV2 in task-2-2-migrate-parsers-and-validators
    const v1Plan = this._convertToV1Plan(plan);
    const result = await Promise.resolve(DagValidator.validatePlan(v1Plan));

    logger.info(`[chopstack] Validation: ${result.valid ? 'PASSED' : 'FAILED'}`);

    if (isValidArray(result.errors)) {
      logger.error('[chopstack] Errors:');
      for (const error of result.errors) {
        logger.error(`[chopstack]   - ${error}`);
      }
    }

    if (isValidArray(result.conflicts)) {
      logger.warn('[chopstack] File conflicts detected:');
      for (const conflict of result.conflicts) {
        logger.warn(`[chopstack]   - ${conflict}`);
      }
    }

    if (isValidArray(result.circularDependencies)) {
      logger.error('[chopstack] Circular dependencies detected:');
      for (const circular of result.circularDependencies) {
        logger.error(`[chopstack]   - ${circular}`);
      }
    }

    return result;
  }

  /**
   * Temporary converter from PlanV2 to v1 Plan format
   * TODO: Remove this when DagValidator is updated to support PlanV2
   */
  private _convertToV1Plan(planV2: PlanV2): {
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      touches: string[];
      produces: string[];
      requires: string[];
      estimatedLines: number;
      agentPrompt: string;
    }>;
  } {
    return {
      tasks: planV2.tasks.map((task) => ({
        id: task.id,
        title: task.name,
        description: task.description,
        touches: task.files,
        produces: [],
        requires: task.dependencies,
        estimatedLines: this._complexityToEstimatedLines(task.complexity),
        agentPrompt: this._generateAgentPrompt(task),
      })),
    };
  }

  /**
   * Convert T-shirt size complexity to estimated lines (temporary)
   */
  private _complexityToEstimatedLines(complexity: string): number {
    const mapping: Record<string, number> = {
      XS: 50,
      S: 100,
      M: 200,
      L: 400,
      XL: 800,
    };
    return mapping[complexity] ?? 200;
  }

  /**
   * Generate agent prompt for v2 task with acceptance criteria
   */
  private _generateAgentPrompt(task: {
    description: string;
    acceptanceCriteria?: string[];
    complexity?: string;
  }): string {
    let prompt = task.description;

    // Add acceptance criteria if present
    if (isValidArray(task.acceptanceCriteria)) {
      prompt += '\n\n## Acceptance Criteria\n';
      for (const criterion of task.acceptanceCriteria) {
        prompt += `- ${criterion}\n`;
      }
    }

    // Add complexity information
    if (task.complexity !== undefined) {
      prompt += `\n\n## Task Complexity: ${task.complexity}`;
    }

    return prompt;
  }
}
