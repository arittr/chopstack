import { writeFile } from 'node:fs/promises';

import { stringify as stringifyYaml } from 'yaml';

import { isNonEmptyString } from '../utils/guards';

import type { Plan, PlanMetrics } from './decomposer';

export class PlanOutputter {
  static async outputPlan(plan: Plan, metrics: PlanMetrics, outputPath?: string): Promise<void> {
    const output = this.formatPlanOutput(plan, metrics);

    if (isNonEmptyString(outputPath)) {
      await writeFile(outputPath, output, 'utf8');
      console.log(`Plan written to ${outputPath}`);
    } else {
      console.log(output);
    }
  }

  static formatPlanOutput(plan: Plan, metrics: PlanMetrics): string {
    const yamlPlan = stringifyYaml(plan, {
      indent: 2,
      lineWidth: 100,
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
    console.log('\n📊 Enhanced Plan Metrics:');
    console.log(`  Tasks: ${metrics.taskCount}`);
    console.log(`  Execution Layers: ${metrics.executionLayers}`);
    console.log(`  Max Parallel: ${metrics.maxParallelization}`);
    console.log(`  Critical Path: ${metrics.criticalPathLength} lines`);
    console.log(`  Est. Speedup: ${metrics.estimatedSpeedup.toFixed(2)}x`);
    console.log(`  Est. Lines: ${metrics.totalEstimatedLines}`);
  }
}
