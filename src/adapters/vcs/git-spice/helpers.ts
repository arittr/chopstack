/**
 * Git-spice helper utilities
 */

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
