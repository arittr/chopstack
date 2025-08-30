import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DecomposeOptions } from '../types/decomposer';

import { createDecomposerAgent } from '../agents';
import { PlanOutputter } from '../types/output';
import { PlanValidator } from '../types/validator';
import { isValidArray } from '../utils/guards';

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

    console.log('🔍 Analyzing codebase and generating plan...');

    // Decompose the specification into a plan
    const plan = await agent.decompose(specContent, cwd);
    console.log(`📋 Generated plan with ${plan.tasks.length} tasks`);

    // Validate the plan
    const validator = new PlanValidator();
    const validation = validator.validatePlan(plan);

    if (!validation.valid) {
      console.error('❌ Plan validation failed:');

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

      return 1;
    }

    if (options.verbose === true) {
      console.log('✅ Plan validation passed');
    }

    // Calculate metrics
    const metrics = validator.calculateMetrics(plan);

    // Output the plan
    await PlanOutputter.outputPlan(plan, metrics, options.output);

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
