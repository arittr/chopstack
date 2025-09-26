import { writeFile } from 'node:fs/promises';

import { stringify as stringifyYaml } from 'yaml';

import type { Plan, PlanMetrics } from '@/types/decomposer';

import { logger } from '@/utils/global-logger';
import { isNonEmptyString } from '@/validation/guards';

export class PlanOutputter {
  static async outputPlan(plan: Plan, metrics: PlanMetrics, outputPath?: string): Promise<void> {
    const output = this.formatPlanOutput(plan, metrics);

    if (isNonEmptyString(outputPath)) {
      await writeFile(outputPath, output, 'utf8');
      logger.info(`Plan written to ${outputPath}`);
    } else {
      logger.raw(output);
    }
  }

  static formatPlanOutput(plan: Plan, metrics: PlanMetrics): string {
    const yamlPlan = stringifyYaml(plan, {
      indent: 2,
      lineWidth: 200, // Increase to avoid line breaks
      defaultStringType: 'QUOTE_DOUBLE', // Force quotes on strings
      defaultKeyType: 'PLAIN',
    });

    const metricsOutput = this._formatMetrics(metrics);

    return `${yamlPlan}\n${metricsOutput}`;
  }

  private static _formatMetrics(metrics: PlanMetrics): string {
    return `# Plan Metrics
# Task Count: ${metrics.taskCount}
# Execution Layers: ${metrics.executionLayers}
# Max Parallelization: ${metrics.maxParallelization}
# Critical Path Length: ${metrics.criticalPathLength} lines
# Estimated Speedup: ${metrics.estimatedSpeedup.toFixed(2)}x
# Total Estimated Lines: ${metrics.totalEstimatedLines}`;
  }

  static logMetrics(metrics: PlanMetrics): void {
    logger.info('\n📊 Enhanced Plan Metrics:');
    logger.info(`  Tasks: ${metrics.taskCount}`);
    logger.info(`  Execution Layers: ${metrics.executionLayers}`);
    logger.info(`  Max Parallel: ${metrics.maxParallelization}`);
    logger.info(`  Critical Path: ${metrics.criticalPathLength} lines`);
    logger.info(`  Est. Speedup: ${metrics.estimatedSpeedup.toFixed(2)}x`);
    logger.info(`  Est. Lines: ${metrics.totalEstimatedLines}`);
  }
}
