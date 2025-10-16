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
      this.logger.info(chalk.blue(`📄 Reading spec from: ${specPath}`));

      const specContent = await readFile(specPath, 'utf8');
      this.logger.info(chalk.dim(`📄 Spec content length: ${specContent.length} characters`));

      // Pre-generation gate: Check for open questions in specification
      const gateService = new ProcessGateService();
      const preGateResult = gateService.checkPreGeneration(specContent, {
        skipGates: options.skipGates,
      });

      if (preGateResult.blocking) {
        this.logger.error(chalk.red(preGateResult.message));
        return 1;
      }

      this.logger.info(chalk.cyan(`🤖 Using agent: ${options.agent}`));

      // Create the appropriate agent (includes capability validation)
      const agent = await createDecomposerAgent(options.agent);

      // Get working directory (from targetDir or context)
      const cwd = options.targetDir ?? this.dependencies.context.cwd;

      // Generate plan with retry logic
      const result = await generatePlanWithRetry(agent, specContent, cwd, {
        maxRetries: 3,
        verbose: options.verbose,
      });

      // Post-generation gate: Check task quality
      const postGateResult = gateService.checkPostGeneration(result.plan, {
        skipGates: options.skipGates,
      });

      // Display quality report (even if gate passes with warnings)
      if (isValidArray(postGateResult.issues) && postGateResult.issues.length > 0) {
        this.logger.warn(chalk.yellow('\n📊 Quality Gate Report:'));
        for (const issue of postGateResult.issues) {
          this.logger.warn(chalk.yellow(`  • ${issue}`));
        }
        this.logger.warn(''); // Empty line for formatting
      }

      if (postGateResult.blocking) {
        this.logger.error(chalk.red(postGateResult.message));
        return 1;
      }

      // Calculate metrics and output the plan
      const metrics = DagValidator.calculateMetrics(result.plan);
      await PlanOutputter.outputPlan(result.plan, options.output);

      if (!result.success) {
        // Final validation failed
        const validation = DagValidator.validatePlan(result.plan);
        this.logger.error(chalk.red('❌ Plan validation failed after all retry attempts:'));
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

      this.logger.info(chalk.green('✅ Plan generated and validated successfully!'));
      this.logger.info(chalk.dim(`📊 Total tasks: ${result.plan.tasks.length}`));
      this.logger.info(chalk.dim(`📊 Max parallel: ${metrics.maxParallelization}`));
      this.logger.info(chalk.dim(`📊 Critical path: ${metrics.criticalPathLength} steps`));

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
