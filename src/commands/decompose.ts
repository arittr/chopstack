import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DecomposeOptions } from '../types/decomposer';

import { createDecomposerAgent } from '../agents';
import { generatePlanWithRetry } from '../planning/plan-generator';
import { PlanOutputter } from '../planning/plan-outputter';
import { logger } from '../utils/logger';
import { DagValidator } from '../validation/dag-validator';
import { isValidArray } from '../validation/guards';

export async function decomposeCommand(options: DecomposeOptions): Promise<number> {
  try {
    // Read the specification file
    const specPath = resolve(options.spec);
    logger.info(`📄 Reading spec from: ${specPath}`);

    const specContent = await readFile(specPath, 'utf8');
    logger.info(`📄 Spec content length: ${specContent.length} characters`);

    logger.info(`🤖 Using agent: ${options.agent}`);

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
      logger.error('💡 The plan above was generated but has validation issues');
      return 1;
    }

    logger.debug('✅ Plan validation passed');

    // Log metrics when verbose
    if (options.verbose === true) {
      PlanOutputter.logMetrics(metrics);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Decompose command failed: ${message}`);
    return 1;
  }
}
