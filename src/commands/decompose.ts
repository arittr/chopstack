import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DecomposeOptions } from '../types/decomposer';

import { createDecomposerAgent } from '../agents';
import { DagValidator } from '../utils/dag-validator';
import { isValidArray } from '../utils/guards';
import { generatePlanWithRetry } from '../utils/plan-generator';
import { PlanOutputter } from '../utils/plan-outputter';

export async function decomposeCommand(options: DecomposeOptions): Promise<number> {
  try {
    // Read the specification file
    const specPath = resolve(options.spec);
    console.log(`📄 Reading spec from: ${specPath}`);

    const specContent = await readFile(specPath, 'utf8');
    console.log(`📄 Spec content length: ${specContent.length} characters`);

    console.log(`🤖 Using agent: ${options.agent}`);

    // Create the appropriate agent (includes capability validation)
    const agent = await createDecomposerAgent(options.agent);

    // Get current working directory
    const cwd = process.cwd();

    // Generate plan with retry logic
    const result = await generatePlanWithRetry(agent, specContent, cwd, {
      maxRetries: 3,
      verbose: options.verbose ?? false,
    });

    // Calculate metrics and output the plan
    const metrics = DagValidator.calculateMetrics(result.plan);
    await PlanOutputter.outputPlan(result.plan, metrics, options.output);

    if (!result.success) {
      // Final validation failed
      const validation = DagValidator.validatePlan(result.plan);
      console.error('❌ Plan validation failed after all retry attempts:');
      if (isValidArray(validation.conflicts)) {
        console.error('  File conflicts:', validation.conflicts.join(', '));
      }
      if (isValidArray(validation.circularDependencies)) {
        console.error('  Circular dependencies:', validation.circularDependencies.join(' -> '));
      }
      if (isValidArray(validation.errors)) {
        for (const error of validation.errors) {
          console.error(`  Error: ${error}`);
        }
      }
      console.error('💡 The plan above was generated but has validation issues');
      return 1;
    }

    if (options.verbose === true) {
      console.log('✅ Plan validation passed');
    }

    // Log metrics to stderr so they don't interfere with YAML output
    if (options.verbose === true) {
      PlanOutputter.logMetrics(metrics);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Decompose command failed: ${message}`);
    return 1;
  }
}
