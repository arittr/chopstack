/**
 * Command exports and initialization
 */

// Export individual command classes
export { AnalyzeCommand } from './analyze';
// Export CLI dispatcher
export { dispatchCommand, loadCommands, type CliOptions } from './cli-dispatcher';

// Export factory utilities
export {
  commandRegistry,
  createDefaultDependencies,
  executeCommand,
  RegisterCommand,
} from './command-factory';

export { DecomposeCommand } from './decompose';

export { RunCommand } from './run';

export { SpecifyCommand } from './specify';

export { StackCommand } from './stack';
// Export types
export type { Command, CommandContext, CommandDependencies } from './types';
export { BaseCommand } from './types';
