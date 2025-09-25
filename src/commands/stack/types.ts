/**
 * Type definitions for stack command
 */

/**
 * Options for git-spice operations
 */
export type GitSpiceOptions = {
  autoAdd?: boolean;
  branchName?: string;
  createStack?: boolean;
  description?: string;
  dryRun?: boolean;
  message?: string;
  submit?: boolean;
  title?: string;
};

/**
 * Result from git-spice operations
 */
export type GitSpiceResult = {
  branchName?: string;
  error?: string;
  prUrls?: string[];
  success: boolean;
};

/**
 * Options for commit message generation
 */
export type CommitMessageOptions = {
  autoAdd?: boolean;
  branchName?: string;
  createStack?: boolean;
  description?: string;
  dryRun?: boolean;
  files?: string[];
  message?: string;
  title?: string;
};

/**
 * Git status information
 */
export type GitStatus = {
  hasChanges: boolean;
  statusLines: string[];
};

/**
 * Stack command configuration
 */
export type StackConfig = {
  aiCommand?: string;
  aiTimeout?: number;
  enableAI?: boolean;
  gitSpicePath?: string;
  signature?: string;
};
