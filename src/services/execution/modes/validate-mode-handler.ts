import type { ValidateModeHandler } from '@/core/execution/interfaces';
import type { Plan, ValidationResult } from '@/types/decomposer';

import { logger } from '@/utils/logger';
import { DagValidator } from '@/validation/dag-validator';
import { isValidArray } from '@/validation/guards';

export class ValidateModeHandlerImpl implements ValidateModeHandler {
  async handle(plan: Plan): Promise<ValidationResult> {
    logger.info('[chopstack] Validating execution plan...');

    const result = await Promise.resolve(DagValidator.validatePlan(plan));

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
}
