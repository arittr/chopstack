/**
 * Decompose command using the new command architecture
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { PlanV2 } from '@/types/schemas-v2';

import { createDecomposerAgent } from '@/adapters/agents';
import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { PlanOutputter } from '@/services/planning/plan-outputter';
import { z } from 'zod';

import { DagValidator } from '@/validation/dag-validator';
import { isValidArray } from '@/validation/guards';

// DecomposeOptions schema - using v2 types internally
const DecomposeOptionsSchema = z.object({
  agent: z.enum(['claude', 'codex', 'mock']),
  output: z.string().optional(),
  spec: z.string().min(1),
  targetDir: z.string().optional(),
  verbose: z.boolean().optional(),
});

type DecomposeOptions = z.infer<typeof DecomposeOptionsSchema>;

/**
 * Decompose markdown specs into parallel task DAGs
 */
@RegisterCommand('decompose')
export class DecomposeCommand extends BaseCommand {
  constructor(dependencies: CommandDependencies) {
    super('decompose', 'Decompose markdown specs into parallel task DAGs', dependencies);
  }

  async execute(options: DecomposeOptions): Promise<number> {
    try {
      // Read the specification file
      const specPath = resolve(options.spec);
      this.logger.info(chalk.blue(`📄 Reading spec from: ${specPath}`));

      const specContent = await readFile(specPath, 'utf8');
      this.logger.info(chalk.dim(`📄 Spec content length: ${specContent.length} characters`));

      this.logger.info(chalk.cyan(`🤖 Using agent: ${options.agent}`));

      // Create the appropriate agent (includes capability validation)
      const agent = await createDecomposerAgent(options.agent);

      // Get working directory (from targetDir or context)
      const cwd = options.targetDir ?? this.dependencies.context.cwd;

      // Generate plan with retry logic
      const result = await generatePlanWithRetry(agent, specContent, cwd, {
        maxRetries: 3,
        verbose: options.verbose ?? false,
      });

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
      this.logger.error(
        chalk.red(
          `❌ Decompose command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }
}
