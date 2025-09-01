import { DagValidator } from '../utils/dag-validator';

import type { Plan, PlanMetrics, ValidationResult } from './decomposer';

/**
 * Legacy PlanValidator wrapper around the new DagValidator
 * @deprecated Use DagValidator directly for better functionality
 */
export class PlanValidator {
  validatePlan(plan: Plan): ValidationResult {
    return DagValidator.validatePlan(plan);
  }

  calculateMetrics(plan: Plan): PlanMetrics {
    return DagValidator.calculateMetrics(plan);
  }
}
