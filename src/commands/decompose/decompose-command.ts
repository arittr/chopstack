/**
 * Decompose command using the new command architecture
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { DecomposeCommandOptions } from '@/types/cli';

import { createDecomposerAgent } from '@/adapters/agents';
import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { PlanOutputter } from '@/services/planning/plan-outputter';
import { ProcessGateService } from '@/services/planning/process-gate-service';
import { DagValidator } from '@/validation/dag-validator';
import { isValidArray } from '@/validation/guards';

/**
 * Decompose markdown specs into parallel task DAGs
 */
@RegisterCommand('decompose')
export class DecomposeCommand extends BaseCommand {
  constructor(dependencies: CommandDependencies) {
    super('decompose', 'Decompose markdown specs into parallel task DAGs', dependencies);
  }

  async execute(options: DecomposeCommandOptions): Promise<number> {
    try {
      // Read the specification file
      const specPath = resolve(options.spec);
      this.logger.info(chalk.blue('📋 Building plan from specification'));
      this.logger.info(chalk.dim(`📄 Spec: ${specPath}`));
      this.logger.info('');

      const specContent = await readFile(specPath, 'utf8');

      // STEP 1: GATE 1 - Analyze specification for completeness
      this.logger.info(chalk.cyan('GATE 1: Analyzing specification...'));

      // Create the appropriate agent (includes capability validation)
      const agent = await createDecomposerAgent(options.agent);

      // Initialize gate service with agent for intelligent gap analysis
      const gateService = new ProcessGateService(agent);
      const preGateResult = await gateService.checkPreGeneration(specContent, {
        skipGates: options.skipGates,
      });

      if (preGateResult.blocking) {
        this.logger.error(chalk.red('GATE 1: ❌ FAILED'));
        this.logger.error('');
        this.logger.error(chalk.red(preGateResult.message));
        return 1;
      }

      this.logger.info(chalk.green('GATE 1: ✅ PASSED'));
      this.logger.info('');

      // STEP 2: Generate plan
      this.logger.info(chalk.cyan('Generating plan...'));
      this.logger.info(chalk.dim(`🤖 Using agent: ${options.agent}`));

      // Get working directory (from targetDir or context)
      const cwd = options.targetDir ?? this.dependencies.context.cwd;

      // Calculate plan output path: spec directory + /plan.yaml
      const specDir = specPath.slice(0, Math.max(0, specPath.lastIndexOf('/')));
      const planPath = `${specDir}/plan.yaml`;

      // Generate plan with retry logic
      const result = await generatePlanWithRetry(agent, specContent, cwd, {
        maxRetries: 3,
        verbose: options.verbose,
        planOutputPath: planPath,
      });

      if (!result.success) {
        // Final validation failed
        const validation = DagValidator.validatePlan(result.plan);
        this.logger.error(chalk.red('❌ Plan generation failed after all retry attempts:'));
        if (isValidArray(validation.conflicts)) {
          this.logger.error(chalk.yellow(`  File conflicts: ${validation.conflicts.join(', ')}`));
        }
        if (isValidArray(validation.circularDependencies)) {
          this.logger.error(
            chalk.yellow(
              `  Circular dependencies: ${validation.circularDependencies.join(' -> ')}`,
            ),
          );
        }
        if (isValidArray(validation.errors)) {
          for (const error of validation.errors) {
            this.logger.error(chalk.yellow(`  ${error}`));
          }
        }
        return 1;
      }

      // Output the plan
      await PlanOutputter.outputPlan(result.plan, options.output);
      this.logger.info(chalk.green('✅ Plan generated'));
      this.logger.info('');

      // STEP 3: GATE 2 - Validate task quality
      this.logger.info(chalk.cyan('GATE 2: Validating task quality...'));
      const postGateResult = gateService.checkPostGeneration(result.plan, {
        skipGates: options.skipGates,
      });

      // Display quality report details
      if (isValidArray(postGateResult.issues) && postGateResult.issues.length > 0) {
        this.logger.warn(chalk.yellow('📊 Quality issues detected:'));
        for (const issue of postGateResult.issues) {
          this.logger.warn(chalk.yellow(`  • ${issue}`));
        }
        this.logger.warn('');
      }

      if (postGateResult.blocking) {
        this.logger.error(chalk.red('GATE 2: ❌ FAILED'));
        this.logger.error('');
        this.logger.error(chalk.red(postGateResult.message));
        return 1;
      }

      this.logger.info(chalk.green('GATE 2: ✅ PASSED'));
      this.logger.info('');

      // Final summary
      const metrics = DagValidator.calculateMetrics(result.plan);
      this.logger.info(chalk.green('✅ Plan Generation Complete'));
      this.logger.info('');
      this.logger.info(chalk.cyan('Plan Details:'));
      this.logger.info(chalk.dim(`  Location: ${options.output ?? 'stdout'}`));
      this.logger.info(chalk.dim(`  Tasks: ${result.plan.tasks.length}`));
      this.logger.info(chalk.dim(`  Max parallel: ${metrics.maxParallelization}`));
      this.logger.info(chalk.dim(`  Critical path: ${metrics.criticalPathLength} steps`));
      this.logger.info('');

      if (options.output !== undefined) {
        this.logger.info(chalk.cyan('Next Steps:'));
        this.logger.info(chalk.dim('  To review plan:'));
        this.logger.info(chalk.dim(`    cat ${options.output}`));
        this.logger.info(chalk.dim('  To validate plan:'));
        this.logger.info(chalk.dim(`    chopstack run --plan ${options.output} --mode validate`));
        this.logger.info(chalk.dim('  To execute plan:'));
        this.logger.info(chalk.dim(`    chopstack run --plan ${options.output} --mode execute`));
      }

      return 0;
    } catch (error) {
      this.logger.error(chalk.red('❌ Decompose command failed'));
      this.logger.error('');

      if (error instanceof Error) {
        // Show the error name and message
        this.logger.error(chalk.red(`Error: ${error.name}: ${error.message}`));

        // Show the cause chain if available
        let currentCause: unknown = error.cause;
        let depth = 0;
        while (currentCause instanceof Error && depth < 5) {
          depth++;
          this.logger.error(
            chalk.yellow(`  Caused by: ${currentCause.name}: ${currentCause.message}`),
          );
          currentCause = currentCause.cause;
        }

        // Show stack trace in verbose mode
        if (options.verbose && error.stack !== undefined) {
          this.logger.error('');
          this.logger.error(chalk.dim('Stack trace:'));
          this.logger.error(chalk.dim(error.stack));
        }
      } else {
        this.logger.error(chalk.red(`Error: ${String(error)}`));
      }

      return 1;
    }
  }
}
