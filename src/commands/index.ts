/**
 * Command exports and initialization
 */

// Export CLI dispatcher
export { dispatchCommand, loadCommands, type CliOptions } from './cli-dispatcher';
// Export factory utilities
export {
  commandRegistry,
  createDefaultDependencies,
  executeCommand,
  RegisterCommand,
} from './command-factory';

// Export individual command classes
export { DecomposeCommand } from './decompose';

export { RunCommand } from './run';

export { StackCommand } from './stack';
// Export types
export type { Command, CommandContext, CommandDependencies } from './types';
export { BaseCommand } from './types';
