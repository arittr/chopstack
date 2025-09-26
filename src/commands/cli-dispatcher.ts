/**
 * CLI dispatcher using the command registry
 * Makes it trivial to add new commands - just create a class with @RegisterCommand
 */

import chalk from 'chalk';

import { logger } from '@/utils/global-logger';

import { commandRegistry, executeCommand } from './command-factory';

export type CliOptions = {
  args: unknown;
  command: string;
  help?: boolean;
  verbose?: boolean;
};

/**
 * Main CLI dispatcher that uses the command registry
 * No need to manually wire up commands - they self-register via decorators
 */
export async function dispatchCommand(options: CliOptions): Promise<number> {
  const { command, args, help } = options;

  // Handle help
  if (help === true || command === 'help') {
    return showHelp();
  }

  // Check if command exists
  if (!commandRegistry.has(command)) {
    logger.error(chalk.red(`Unknown command: ${command}`));
    logger.info(chalk.dim(`Available commands: ${commandRegistry.getNames().join(', ')}`));
    return 1;
  }

  try {
    // Execute command through the registry
    return await executeCommand(command, args);
  } catch (error) {
    logger.error(
      chalk.red(
        `Command '${command}' failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return 1;
  }
}

/**
 * Show help for all registered commands
 */
function showHelp(): number {
  logger.info(chalk.bold.cyan('\n🚀 ChopStack CLI\n'));
  logger.info('Available commands:\n');

  const commands = commandRegistry.getNames().sort();

  for (const name of commands) {
    const command = commandRegistry.get(name);
    if (command !== undefined) {
      logger.info(`${chalk.green(`  ${name.padEnd(15)}`)} ${chalk.dim(command.description)}`);
    }
  }

  logger.info('\nUsage:');
  logger.info('  chopstack <command> [options]\n');
  logger.info('Examples:');
  logger.info('  chopstack stack --auto-add');
  logger.info('  chopstack decompose spec.md');
  logger.info('  chopstack run plan.yaml\n');

  return 0;
}

/**
 * Auto-import all command files to trigger decorator registration
 * This ensures commands are available without manual imports
 */
export async function loadCommands(): Promise<void> {
  // Import actual commands - these will self-register via decorators
  await import('./stack/stack-command');
  await import('./decompose/decompose-command');
  await import('./run/run-command');
}
