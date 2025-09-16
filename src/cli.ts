import { Command } from 'commander';
import { ZodError } from 'zod';

import { decomposeCommand } from './commands/decompose';
import { runCommand } from './commands/run';
import { stackCommand } from './commands/stack';
import { validateDecomposeArgs, validateRunArgs, validateStackArgs } from './types/cli';

const program = new Command();

program
  .name('chopstack')
  .description('Chop massive AI changes into clean, reviewable PR stacks')
  .version('0.1.0');

// Decompose command
program
  .command('decompose')
  .description('Decompose a spec into parallelizable tasks')
  .requiredOption('--spec <file>', 'Path to specification file')
  .option('--agent <type>', 'Agent to use: claude|aider|mock', 'claude')
  .option('--output <file>', 'Output file for plan (optional, defaults to stdout)')
  .option('--verbose, -v', 'Verbose output', false)
  .action(async (options: unknown) => {
    try {
      const validatedOptions = validateDecomposeArgs(options);
      const exitCode = await decomposeCommand(validatedOptions);
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
program
  .command('run')
  .description('Execute a task plan from spec or plan file')
  .option('--spec <file>', 'Path to specification file (.md)')
  .option('--plan <file>', 'Path to plan file (JSON/YAML) - if not provided, will decompose spec')
  .option('--mode <mode>', 'Execution mode: plan|dry-run|execute|validate', 'dry-run')
  .option('--workdir <path>', 'Working directory for execution', process.cwd())
  .option('--strategy <strategy>', 'Execution strategy: parallel|serial|hybrid', 'parallel')
  .option('--agent <type>', 'Agent for decomposition: claude|aider|mock', 'claude')
  .option('--git-spice', 'Create git-spice stack after execution', false)
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
  .option('--verbose, -v', 'Verbose output', false)
  .action(async (options: unknown) => {
    try {
      const validatedOptions = validateRunArgs(options);
      const exitCode = await runCommand(validatedOptions);
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
program
  .command('stack')
  .description('Create git stack with automatic commit message')
  .option('--no-auto-add', 'Do not automatically add all changes to staging', true)
  .option('--no-create-stack', 'Do not create git-spice stack, just commit', true)
  .option('--message <msg>', 'Custom commit message (optional)')
  .option('--verbose, -v', 'Verbose output', false)
  .action(async (options: unknown) => {
    try {
      const validatedOptions = validateStackArgs(options);
      const exitCode = await stackCommand(validatedOptions);
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
    console.error(`Error: ${message}`);
    return 1;
  }
}
