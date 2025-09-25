/**
 * Git-spice module exports
 */

// Main backend
export { GitSpiceBackend } from './backend';

// Errors
export { GitSpiceError } from './errors';

// Helper functions (for backwards compatibility and testing)
export { initGitSpiceRepo, generateBranchNameFromMessage, extractPrUrls } from './helpers';

// Worktree sync utilities (exported for testing)
export { fetchWorktreeCommits, findWorktreeForTask } from './worktree-sync';
