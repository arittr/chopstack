/**
 * Git operations utilities for stack command
 */

import chalk from 'chalk';
import { execaSync } from 'execa';

import type { GitStatus } from '@/commands/stack/types';

import { hasContent } from '@/validation/guards';

/**
 * Get current git status
 */
export function getGitStatus(): GitStatus {
  const rawOutput = execaSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const statusLines = hasContent(rawOutput) ? rawOutput.trim().split('\n').filter(Boolean) : [];

  return {
    hasChanges: statusLines.length > 0,
    statusLines,
  };
}

/**
 * Get color for git status indicator
 */
export function getStatusColor(status: string): (text: string) => string {
  const firstChar = status[0];
  switch (firstChar) {
    case 'A': {
      return chalk.green;
    }
    case 'M': {
      return chalk.yellow;
    }
    case 'D': {
      return chalk.red;
    }
    case 'R': {
      return chalk.blue;
    }
    case 'C': {
      return chalk.cyan;
    }
    case '?': {
      return chalk.gray;
    }
    case undefined: {
      return chalk.white;
    }
    default: {
      return chalk.white;
    }
  }
}

/**
 * Add all changes to git staging area
 */
export function addAllChanges(): void {
  execaSync('git', ['add', '-A']);
}

/**
 * Get current git branch name
 */
export function getCurrentBranch(): string {
  return execaSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim();
}

/**
 * Check if a branch exists
 */
export function branchExists(branchName: string): boolean {
  try {
    execaSync('git', ['rev-parse', '--verify', branchName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new git commit
 */
export function createCommit(message: string): void {
  execaSync('git', ['commit', '-m', message]);
}

/**
 * Check if git-spice is available
 */
export function isGitSpiceAvailable(): boolean {
  try {
    execaSync('gs', ['--version']);
    return true;
  } catch {
    return false;
  }
}
