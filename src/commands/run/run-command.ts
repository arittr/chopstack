/**
 * Run command using the new command architecture
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { AgentService } from '@/core/agents/interfaces';
import type { ExecutionEngine } from '@/services/execution';
import type { RunCommandOptions } from '@/types/cli';
import type { Plan } from '@/types/decomposer';

import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { ServiceIdentifiers } from '@/core/di';
import { YamlPlanParser } from '@/io/yaml-parser';
import { bootstrapApplication, getContainer } from '@/providers';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { DagValidator } from '@/validation/dag-validator';
import { isNonEmptyString } from '@/validation/guards';

/**
 * Execute plans or specs with parallel task execution
 */
@RegisterCommand('run')
export class RunCommand extends BaseCommand {
  constructor(dependencies: CommandDependencies) {
    super('run', 'Execute a plan or spec with parallel task execution', dependencies);
  }

  async execute(options: RunCommandOptions): Promise<number> {
    try {
      const cwd = options.workdir ?? this.context.cwd;
      const serviceOverrides = this.dependencies.services ?? {};
      type AppContainer = ReturnType<typeof getContainer>;

      let containerCache: AppContainer | null = null;

      const resolveContainer = async (): Promise<AppContainer> => {
        if (containerCache === null) {
          await bootstrapApplication();
          containerCache = getContainer();
        }
        return containerCache;
      };

      const resolveAgentService = async (): Promise<AgentService> => {
        if (serviceOverrides.agentService !== undefined) {
          return serviceOverrides.agentService;
        }
        const container = await resolveContainer();
        return container.get<AgentService>(ServiceIdentifiers.AgentService);
      };

      const resolveExecutionEngine = async (): Promise<ExecutionEngine> => {
        if (serviceOverrides.executionEngine !== undefined) {
          return serviceOverrides.executionEngine;
        }
        const container = await resolveContainer();
        return container.get<ExecutionEngine>(ServiceIdentifiers.ExecutionEngine);
      };

      let plan: Plan;

      if (isNonEmptyString(options.spec)) {
        this.logger.info(chalk.blue(`📄 Reading spec from: ${resolve(options.spec)}`));

        const specContent = await readFile(resolve(options.spec), 'utf8');
        this.logger.info(chalk.dim(`📄 Spec content length: ${specContent.length} characters`));

        const agentService = await resolveAgentService();
        const agent = await agentService.createAgent(options.agent ?? 'claude');
        this.logger.info(chalk.cyan(`🤖 Using agent: ${options.agent ?? 'claude'}`));

        const result = await generatePlanWithRetry(agent, specContent, cwd, {
          maxRetries: 3,
          verbose: options.verbose ?? false,
        });

        if (!result.success) {
          this.logger.error(chalk.red('❌ Failed to generate a valid plan after retries'));
          return 1;
        }

        ({ plan } = result);
      } else if (isNonEmptyString(options.plan)) {
        this.logger.info(chalk.blue(`📋 Loading plan from: ${resolve(options.plan)}`));

        const planContent = await readFile(resolve(options.plan), 'utf8');
        const isYaml = options.plan.endsWith('.yaml') || options.plan.endsWith('.yml');

        plan = isYaml ? YamlPlanParser.parse(planContent) : (JSON.parse(planContent) as Plan);
      } else {
        this.logger.error(chalk.red('❌ Either --spec or --plan must be provided'));
        return 1;
      }

      const validation = DagValidator.validatePlan(plan);
      if (!validation.valid) {
        this.logger.error(chalk.red('❌ Plan validation failed:'));
        for (const error of validation.errors) {
          this.logger.error(chalk.yellow(`  ${error}`));
        }
        return 1;
      }

      this.logger.info(chalk.green('✅ Plan validated successfully'));
      this.logger.info(chalk.dim(`📊 Tasks: ${plan.tasks.length}`));

      const engine = await resolveExecutionEngine();

      this.logger.info(chalk.blue('🚀 Starting plan execution...'));
      const result = await engine.execute(plan, {
        mode: options.mode,
        verbose: options.verbose,
        dryRun: options.dryRun,
        strategy: options.strategy,
        parallel: options.parallel,
        continueOnError: options.continueOnError,
        agent: options.agent,
      });

      const failureCount = result.tasks.filter((task) => task.status === 'failure').length;

      if (failureCount === 0) {
        this.logger.info(chalk.green('✅ Plan executed successfully!'));
        return 0;
      }

      this.logger.error(chalk.red('❌ Plan execution failed'));
      return 1;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Run command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }
}
