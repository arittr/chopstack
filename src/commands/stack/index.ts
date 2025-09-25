/**
 * Stack command module exports
 */

// Export main command class
export { StackCommand } from './stack-command';

// Export types
export type {
  CommitMessageOptions,
  GitSpiceOptions,
  GitSpiceResult,
  GitStatus,
  StackConfig,
} from './types';

// Export utilities (for testing or extension)
export * as gitOperations from './utils/git-operations';
