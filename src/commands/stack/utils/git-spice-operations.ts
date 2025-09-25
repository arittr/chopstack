/**
 * Git-spice operations utilities
 */

import { execaSync } from 'execa';

import type { GitSpiceResult } from '@/commands/stack/types';

import { hasContent, isValidArray } from '@/validation/guards';

/**
 * Create a git-spice branch with commit
 */
export function createGitSpiceBranch(branchName: string, commitMessage: string): GitSpiceResult {
  try {
    // Generate branch name if not provided
    const finalBranchName = hasContent(branchName) ? branchName : generateBranchName(commitMessage);

    // Create branch and commit in one step using git-spice
    execaSync('gs', ['branch', 'create', finalBranchName, '-m', commitMessage]);

    return {
      success: true,
      branchName: finalBranchName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Submit git-spice stack to GitHub
 */
export function submitGitSpiceStack(): GitSpiceResult {
  try {
    const output = execaSync('gs', ['stack', 'submit'], { encoding: 'utf8' });

    // Parse PR URLs from output
    const prUrls = parseGitSpiceOutput(output.stdout);

    return {
      success: true,
      prUrls,
    };
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
function generateBranchName(commitMessage: string): string {
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
 * Parse git-spice output for PR URLs
 */
function parseGitSpiceOutput(output: string): string[] {
  const urls: string[] = [];

  // Look for GitHub PR URLs in the output
  const urlRegex = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/g;
  const matches = output.match(urlRegex);

  if (isValidArray(matches)) {
    urls.push(...matches);
  }

  // Also look for lines that explicitly mention PR URLs
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.includes('Pull Request:') || line.includes('PR:')) {
      const urlMatch = line.match(/https?:\/\/\S+/);
      if (isValidArray(urlMatch)) {
        urls.push(urlMatch[0]);
      }
    }
  }

  // Deduplicate URLs
  return [...new Set(urls)];
}
