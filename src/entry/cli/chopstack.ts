#!/usr/bin/env node
import { Command } from 'commander';
import { ZodError } from 'zod';

import {
  AnalyzeCommand,
  createDefaultDependencies,
  DecomposeCommand,
  RunCommand,
  SpecifyCommand,
  StackCommand,
} from '@/commands';
import { initializeEventConsumer } from '@/services/orchestration/adapters/task-execution-adapter-factory';
import {
  validateAnalyzeArgs,
  validateDecomposeArgs,
  validateRunArgs,
  validateSpecifyArgs,
  validateStackArgs,
} from '@/types/cli';
import { logger } from '@/utils/global-logger';

/**
 * Add common options to a command (shared across all commands)
 */
function addCommonOptions(command: Command): Command {
  return command
    .option(
      '--target-dir <dir>',
      'Target directory for execution (default: current directory)',
      '.',
    )
    .option('--verbose, -v', 'Verbose output', false)
    .option('--silent, -s', 'Silent mode - suppress all output', false);
}

const program = new Command();

program
  .name('chopstack')
  .description('Chop massive AI changes into clean, reviewable PR stacks')
  .version('0.1.0');

// Specify command
addCommonOptions(
  program
    .command('specify')
    .description('Generate comprehensive specification from brief prompt')
    .option('--prompt <text>', 'Brief feature description prompt')
    .option('--input <file>', 'Read prompt from file instead of --prompt')
    .option('--cwd <dir>', 'Working directory to analyze (default: current directory)'),
).action(async (options: unknown) => {
  try {
    const validatedOptions = validateSpecifyArgs(options);
    const cliOptions = options as { silent?: boolean };
    logger.configure({
      verbose: Boolean(validatedOptions.verbose),
      silent: cliOptions.silent ?? false,
    });
    initializeEventConsumer({ verbose: Boolean(validatedOptions.verbose) });
    const deps = createDefaultDependencies({ logger });
    const command = new SpecifyCommand(deps);
    const exitCode = await command.execute(validatedOptions);
    if (exitCode !== 0) {
      throw new Error(`Specify command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(`Invalid specify options: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown validation error');
  }
});

// Analyze command
addCommonOptions(
  program
    .command('analyze')
    .description('Analyze specification completeness and quality')
    .requiredOption('--spec <file>', 'Path to specification file')
    .option('--output <file>', 'Output file for JSON report (optional)'),
).action(async (options: unknown) => {
  try {
    const validatedOptions = validateAnalyzeArgs(options);
    const cliOptions = options as { silent?: boolean };
    logger.configure({
      verbose: Boolean(validatedOptions.verbose),
      silent: cliOptions.silent ?? false,
    });
    initializeEventConsumer({ verbose: Boolean(validatedOptions.verbose) });
    const deps = createDefaultDependencies({ logger });
    const command = new AnalyzeCommand(deps);
    const exitCode = await command.execute(validatedOptions);
    if (exitCode !== 0) {
      throw new Error(`Analyze command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(`Invalid analyze options: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown validation error');
  }
});

// Decompose command
addCommonOptions(
  program
    .command('decompose')
    .description('Decompose a spec into parallelizable tasks')
    .requiredOption('--spec <file>', 'Path to specification file')
    .option('--agent <type>', 'Agent to use: claude|aider|mock', 'claude')
    .option('--output <file>', 'Output file for plan (optional, defaults to stdout)')
    .option('--skip-gates', 'Skip quality gate checks (pre and post generation)', false),
).action(async (options: unknown) => {
  try {
    const validatedOptions = validateDecomposeArgs(options);
    // Configure logger based on CLI options
    const cliOptions = options as { silent?: boolean };
    logger.configure({
      verbose: Boolean(validatedOptions.verbose),
      silent: cliOptions.silent ?? false,
    });
    // Initialize event consumer
    initializeEventConsumer({ verbose: Boolean(validatedOptions.verbose) });
    const deps = createDefaultDependencies({ logger });
    const command = new DecomposeCommand(deps);
    const exitCode = await command.execute(validatedOptions);
    if (exitCode !== 0) {
      throw new Error(`Decompose command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(`Invalid decompose options: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown validation error');
  }
});

// Run command - matches SNU-46 specification
addCommonOptions(
  program
    .command('run')
    .description('Execute a task plan from spec or plan file')
    .option('--spec <file>', 'Path to specification file (.md)')
    .option('--plan <file>', 'Path to plan file (JSON/YAML) - if not provided, will decompose spec')
    .option('--mode <mode>', 'Execution mode: plan|dry-run|execute|validate', 'dry-run')
    .option('--workdir <path>', '[DEPRECATED] Use --target-dir instead')
    .option('--vcs-mode <mode>', 'VCS mode: simple|worktree|stacked', 'simple')
    .option('--agent <type>', 'Agent for decomposition: claude|aider|mock', 'claude')
    .option(
      '--permissive-validation',
      'Warn on file violations instead of failing (default: strict)',
      false,
    )
    .option('--continue-on-error', 'Continue execution even if tasks fail', false)
    .option('--timeout <ms>', 'Task timeout in milliseconds', (value) => Number.parseInt(value, 10))
    .option(
      '--retry-attempts <count>',
      'Number of retry attempts for failed tasks',
      (value) => Number.parseInt(value, 10),
      0,
    )
    .option(
      '--retry-delay <ms>',
      'Delay between retry attempts in milliseconds',
      (value) => Number.parseInt(value, 10),
      5000,
    )
    .option('--no-tui', 'Disable the interactive TUI (use plain output)', true)
    .option('--write-log', 'Write execution logs to files in .chopstack/logs/', false),
).action(async (options: unknown) => {
  try {
    const validatedOptions = validateRunArgs(options);
    // Configure logger based on CLI options
    const cliOptions = options as { silent?: boolean };
    logger.configure({
      verbose: Boolean(validatedOptions.verbose),
      silent: cliOptions.silent ?? false,
    });
    // Initialize event consumer
    initializeEventConsumer({ verbose: Boolean(validatedOptions.verbose) });
    const deps = createDefaultDependencies({ logger });
    const command = new RunCommand(deps);
    const exitCode = await command.execute(validatedOptions);
    if (exitCode !== 0) {
      throw new Error(`Run command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(`Invalid run options: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown validation error');
  }
});

// Stack command
addCommonOptions(
  program
    .command('stack')
    .description('Create git stack with automatic commit message')
    .option('--no-auto-add', 'Do not automatically add all changes to staging', true)
    .option('--no-create-stack', 'Do not create git-spice stack, just commit', true)
    .option('--message <msg>', 'Custom commit message (optional)')
    .option('--no-tui', 'Disable the interactive TUI (use plain output)', true),
).action(async (options: unknown) => {
  try {
    const validatedOptions = validateStackArgs(options);
    // Configure logger based on CLI options
    const cliOptions = options as { silent?: boolean };
    logger.configure({
      verbose: validatedOptions.verbose,
      silent: cliOptions.silent ?? false,
    });
    // Initialize event consumer
    initializeEventConsumer({ verbose: validatedOptions.verbose });
    const deps = createDefaultDependencies({ logger });
    const command = new StackCommand(deps);
    const exitCode = await command.execute(validatedOptions);
    if (exitCode !== 0) {
      throw new Error(`Stack command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(`Invalid stack options: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown validation error');
  }
});

export async function run(argv: readonly string[]): Promise<number> {
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    return 1;
  }
}

// Entry point
// Slice off `node` and script path
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
