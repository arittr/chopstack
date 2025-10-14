import { writeFile } from 'node:fs/promises';

import { stringify as stringifyYaml } from 'yaml';

import type { PlanV2 } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { isNonEmptyString } from '@/validation/guards';

/**
 * PlanOutputter - Outputs PlanV2 in YAML format
 *
 * @remarks
 * Migrated to v2 types with support for:
 * - Phase-based plans
 * - New field names (name, files, complexity, acceptanceCriteria)
 * - Success metrics
 *
 * @example
 * ```typescript
 * const plan: PlanV2 = {
 *   name: 'Dark Mode Implementation',
 *   strategy: 'phased-parallel',
 *   phases: [...],
 *   tasks: [...],
 * };
 *
 * await PlanOutputter.outputPlan(plan, 'dark-mode.plan.yaml');
 * ```
 */
export class PlanOutputter {
  /**
   * Output plan to file or stdout
   *
   * @param plan - The v2 plan to output
   * @param outputPath - Optional file path. If omitted, outputs to stdout
   */
  static async outputPlan(plan: PlanV2, outputPath?: string): Promise<void> {
    const output = this.formatPlanOutput(plan);

    if (isNonEmptyString(outputPath)) {
      await writeFile(outputPath, output, 'utf8');
      logger.info(`Plan written to ${outputPath}`);
    } else {
      logger.raw(output);
    }
  }

  /**
   * Format plan as YAML string
   *
   * @param plan - The v2 plan to format
   * @returns YAML string representation
   */
  static formatPlanOutput(plan: PlanV2): string {
    // Convert plan to YAML-friendly format
    // Note: Zod types have camelCase fields, but YAML output uses snake_case per spec
    const yamlData = this._convertToYamlFormat(plan);

    const yamlPlan = stringifyYaml(yamlData, {
      indent: 2,
      lineWidth: 200, // Increase to avoid line breaks
      defaultStringType: 'QUOTE_DOUBLE', // Force quotes on strings
      defaultKeyType: 'PLAIN',
    });

    return yamlPlan;
  }

  /**
   * Log plan summary to console
   *
   * @param plan - The v2 plan to summarize
   */
  static logPlanSummary(plan: PlanV2): void {
    logger.info('\n📋 Plan Summary:');
    logger.info(`  Name: ${plan.name}`);
    logger.info(`  Strategy: ${plan.strategy}`);

    if (plan.phases !== undefined && plan.phases.length > 0) {
      logger.info(`  Phases: ${plan.phases.length}`);
      for (const phase of plan.phases) {
        logger.info(`    - ${phase.name} (${phase.strategy}, ${phase.tasks.length} tasks)`);
      }
    }

    logger.info(`  Tasks: ${plan.tasks.length}`);

    // Count complexity distribution
    const complexityCounts = new Map<string, number>();
    for (const task of plan.tasks) {
      const count = complexityCounts.get(task.complexity) ?? 0;
      complexityCounts.set(task.complexity, count + 1);
    }

    logger.info('  Complexity:');
    for (const [complexity, count] of Array.from(complexityCounts.entries())) {
      logger.info(`    ${complexity}: ${count} tasks`);
    }

    if (plan.successMetrics !== undefined) {
      logger.info('  Success Metrics:');
      if (plan.successMetrics.quantitative.length > 0) {
        logger.info(`    Quantitative: ${plan.successMetrics.quantitative.length}`);
      }
      if (plan.successMetrics.qualitative.length > 0) {
        logger.info(`    Qualitative: ${plan.successMetrics.qualitative.length}`);
      }
    }
  }

  /**
   * Convert PlanV2 to YAML-friendly format with snake_case field names
   *
   * @private
   */
  private static _convertToYamlFormat(plan: PlanV2): Record<string, unknown> {
    const yamlData: Record<string, unknown> = {
      name: plan.name,
    };

    // Optional fields
    if (plan.description !== undefined) {
      yamlData.description = plan.description;
    }

    if (plan.specification !== undefined) {
      yamlData.specification = plan.specification;
    }

    if (plan.codebase !== undefined) {
      yamlData.codebase = plan.codebase;
    }

    if (plan.mode !== undefined) {
      yamlData.mode = plan.mode;
    }

    yamlData.strategy = plan.strategy;

    // Phases (if present)
    if (plan.phases !== undefined && plan.phases.length > 0) {
      yamlData.phases = plan.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        strategy: phase.strategy,
        tasks: phase.tasks,
        ...(phase.requires.length > 0 && { requires: phase.requires }),
      }));
    }

    // Tasks with v2 field names (snake_case for YAML output)
    yamlData.tasks = plan.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      complexity: task.complexity,
      description: task.description,
      files: task.files,
      ...(task.acceptanceCriteria.length > 0 && { acceptance_criteria: task.acceptanceCriteria }),
      ...(task.dependencies.length > 0 && { dependencies: task.dependencies }),
      ...(task.phase !== undefined && { phase: task.phase }),
    }));

    // Success metrics (if present)
    if (plan.successMetrics !== undefined) {
      yamlData.success_metrics = {
        ...(plan.successMetrics.quantitative.length > 0 && {
          quantitative: plan.successMetrics.quantitative,
        }),
        ...(plan.successMetrics.qualitative.length > 0 && {
          qualitative: plan.successMetrics.qualitative,
        }),
      };
    }

    return yamlData;
  }
}
