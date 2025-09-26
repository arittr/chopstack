/**
 * Run command using the new command architecture
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { AgentService } from '@/core/agents/interfaces';
import type { ExecutionEngine } from '@/services/execution';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { RunCommandOptions } from '@/types/cli';
import type { Plan } from '@/types/decomposer';

import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { ServiceIdentifiers } from '@/core/di';
import { YamlPlanParser } from '@/io/yaml-parser';
import { bootstrapApplication, getContainer } from '@/providers';
import { initializeFileLogWriter } from '@/services/logging/file-log-writer';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { isTuiSupported, startTui } from '@/ui';
import { GlobalLogger } from '@/utils/global-logger';
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

      // Initialize file logging if requested
      const fileLogWriter = initializeFileLogWriter(cwd, options.writeLog);
      if (options.writeLog) {
        this.logger.info(chalk.cyan(`📝 Logging enabled: ${fileLogWriter.getLogDirectory()}`));
      }
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

      // Check if TUI should be used
      const isTtyEnvironment = isTuiSupported();
      const shouldUseTui = options.tui && options.silent === false && options.mode === 'execute';

      // Check for headless environment when TUI is requested
      if (shouldUseTui && !isTtyEnvironment) {
        this.logger.error(
          chalk.yellow('⚠️  TUI requires TTY environment. Use --no-tui for headless mode.'),
        );
        return 1;
      }

      const useTui = shouldUseTui && isTtyEnvironment;

      this.logger.info(chalk.green('✅ Plan validated successfully'));
      this.logger.info(chalk.dim(`📊 Tasks: ${plan.tasks.length}`));

      // If logging is enabled, write plan summary
      if (options.writeLog) {
        fileLogWriter.writeSeparator('EXECUTION PLAN');
        fileLogWriter.write(`Mode: ${options.mode}`);
        fileLogWriter.write(`Strategy: ${options.strategy}`);
        fileLogWriter.write(`Tasks: ${plan.tasks.length}`);
        fileLogWriter.write(`Agent: ${options.agent ?? 'claude'}`);
        fileLogWriter.writeSeparator();
      }

      const engine = await resolveExecutionEngine();

      let result;
      let failureCount: number;

      if (useTui) {
        // Get the orchestrator for TUI event handling
        const container = await resolveContainer();
        const orchestrator = container.get<ExecutionOrchestrator>(
          ServiceIdentifiers.ExecutionOrchestrator,
        );

        // Enable TUI mode in global logger with file logging
        GlobalLogger.enableTuiMode(orchestrator, fileLogWriter);

        try {
          // Start TUI and execute in parallel
          [result] = await Promise.all([
            engine.execute(plan, {
              mode: options.mode,
              verbose: options.verbose,
              dryRun: options.dryRun,
              strategy: options.strategy,
              parallel: options.parallel,
              continueOnError: options.continueOnError,
              agent: options.agent,
            }),
            startTui({
              orchestrator,
              plan,
              options: {
                mode: options.mode,
                verbose: options.verbose,
                dryRun: options.dryRun,
                strategy: options.strategy,
                parallel: options.parallel,
                continueOnError: options.continueOnError,
                agent: options.agent,
              },
            }),
          ]);
        } finally {
          // Disable TUI mode in global logger
          GlobalLogger.disableTuiMode();
        }

        failureCount = result.tasks.filter((task) => task.status === 'failure').length;
      } else {
        // Use regular logging output with optional file logging
        if (options.writeLog) {
          // Enable file logging for console mode
          GlobalLogger.enableFileLogging(fileLogWriter);
        }

        this.logger.info(chalk.blue('🚀 Starting plan execution...'));
        result = await engine.execute(plan, {
          mode: options.mode,
          verbose: options.verbose,
          dryRun: options.dryRun,
          strategy: options.strategy,
          parallel: options.parallel,
          continueOnError: options.continueOnError,
          agent: options.agent,
        });

        failureCount = result.tasks.filter((task) => task.status === 'failure').length;

        if (options.writeLog) {
          // Disable file logging for console mode
          GlobalLogger.disableFileLogging();
        }
      }

      // Write final results to log
      if (options.writeLog) {
        fileLogWriter.writeSeparator('EXECUTION RESULTS');
        fileLogWriter.write(`Total tasks: ${result.tasks.length}`);
        fileLogWriter.write(
          `Successful: ${result.tasks.filter((t) => t.status === 'success').length}`,
        );
        fileLogWriter.write(`Failed: ${failureCount}`);
        fileLogWriter.write(`Execution time: ${result.totalDuration}ms`);
        fileLogWriter.closeAllStreams();
      }

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
