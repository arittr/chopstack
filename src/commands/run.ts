import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { RunCommandOptions } from '@/types/cli';
import type { Plan } from '@/types/decomposer';

import { createDecomposerAgent } from '@/agents';
import { createExecutionEngine } from '@/engine';
import { YamlPlanParser } from '@/io/yaml-parser';
import { generatePlanWithRetry } from '@/planning/plan-generator';
import { logger } from '@/utils/logger';
import { DagValidator } from '@/validation/dag-validator';
import { isNonEmptyString } from '@/validation/guards';

export async function runCommand(options: RunCommandOptions): Promise<number> {
  try {
    const cwd = options.workdir ?? process.cwd();
    let plan: Plan;

    // Determine if we need to decompose a spec or load an existing plan
    if (isNonEmptyString(options.spec)) {
      logger.info(`📄 Reading spec from: ${resolve(options.spec)}`);

      // Read and decompose the specification
      const specContent = await readFile(resolve(options.spec), 'utf8');
      logger.info(`📄 Spec content length: ${specContent.length} characters`);

      const agent = await createDecomposerAgent(options.agent ?? 'claude');
      logger.info(`🤖 Using agent: ${options.agent ?? 'claude'}`);

      // Generate plan with retry logic
      const result = await generatePlanWithRetry(agent, specContent, cwd, {
        maxRetries: 3,
        verbose: options.verbose ?? false,
      });

      if (!result.success) {
        logger.error('❌ Failed to generate a valid plan after retries');
        return 1;
      }

      ({ plan } = result);
    } else if (isNonEmptyString(options.plan)) {
      logger.info(`📋 Loading plan from: ${resolve(options.plan)}`);

      // Load existing plan file
      const planContent = await readFile(resolve(options.plan), 'utf8');

      // Determine format and parse
      const isYaml = options.plan.endsWith('.yaml') || options.plan.endsWith('.yml');
      if (isYaml) {
        plan = YamlPlanParser.parseAndValidatePlan({
          content: planContent,
          source: 'yaml',
        });
      } else {
        // Assume JSON
        const planData: unknown = JSON.parse(planContent);
        plan = YamlPlanParser.parseAndValidatePlan({
          content: JSON.stringify(planData),
          source: 'json',
        });
      }
      logger.info(`📋 Loaded plan with ${plan.tasks.length} tasks`);
    } else {
      throw new Error('Either --spec or --plan must be provided');
    }

    // Validate the plan
    const validation = DagValidator.validatePlan(plan);

    if (!validation.valid) {
      logger.error('❌ Plan validation failed:');
      for (const error of validation.errors) {
        logger.error(`  Error: ${error}`);
      }
      return 1;
    }

    // Execute the plan using the execution engine
    const engine = createExecutionEngine();
    logger.info(`🚀 Starting execution in ${options.mode} mode with ${options.strategy} strategy`);

    const result = await engine.execute(plan, {
      mode: options.mode,
      strategy: options.strategy,
      workdir: cwd,
      gitSpice: options.gitSpice,
      continueOnError: options.continueOnError,
      timeout: options.timeout,
      retryAttempts: options.retryAttempts,
      verbose: options.verbose,
    });

    if (result.success) {
      logger.info(`✅ Execution completed successfully`);
      logger.info(
        `📊 Tasks: ${result.tasksCompleted}/${result.tasksTotal} completed, ${result.tasksFailed} failed, ${result.tasksSkipped} skipped`,
      );

      if (
        options.gitSpice === true &&
        result.gitBranches !== undefined &&
        result.gitBranches.length > 0
      ) {
        logger.info('🌿 Git-spice stack created:');
        for (const branch of result.gitBranches) {
          logger.info(`  └─ ${branch}`);
        }
        if (result.stackUrl !== undefined) {
          logger.info(`🔗 Stack URL: ${result.stackUrl}`);
        }
        logger.info("💡 Run 'gs stack submit' to create PRs");
      }

      return 0;
    }

    logger.error(`❌ Execution failed: ${result.error ?? 'Unknown error'}`);
    logger.error(
      `📊 Tasks: ${result.tasksCompleted}/${result.tasksTotal} completed, ${result.tasksFailed} failed`,
    );
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Run command failed: ${message}`);
    return 1;
  }
}
