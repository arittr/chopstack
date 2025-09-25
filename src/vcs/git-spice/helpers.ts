/**
 * Git-spice helper utilities
 */

import { execaSync } from 'execa';

/**
 * Helper function to initialize git-spice repo (for backwards compatibility)
 */
export function initGitSpiceRepo(
  cwd?: string,
  trunk?: string,
): { error?: string; success: boolean } {
  try {
    const args = ['repo', 'init'];
    if (trunk !== undefined && trunk.length > 0) {
      args.push('--trunk', trunk);
    }
    const options = cwd !== undefined && cwd.length > 0 ? { cwd } : {};
    execaSync('gs', args, options);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate a branch name from commit message
 */
export function generateBranchNameFromMessage(commitMessage: string): string {
  // Take first line of commit message
  const firstLine = commitMessage.split('\n')[0] ?? commitMessage;

  // Remove conventional commit prefix if present
  const withoutPrefix = firstLine.replace(
    /^(feat|fix|docs|test|chore|refactor|style)(\([^)]+\))?:\s*/,
    '',
  );

  // Convert to branch name format
  const branchName = withoutPrefix
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 50);

  // Add timestamp to ensure uniqueness
  const timestamp = Date.now();
  return `stack-${branchName}-${timestamp}`;
}

/**
 * Extract PR URLs from git-spice output
 */
export function extractPrUrls(output: string): string[] {
  const prUrlRegex = /https:\/\/github\.com\/\S+\/pull\/\d+/g;
  return output.match(prUrlRegex) ?? [];
}
