import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { ExecutionTask, GitSpiceStackInfo } from '../types/execution';

import { hasContent, isNonEmptyString } from './guards';

const execAsync = promisify(exec);

export class GitSpiceError extends Error {
  constructor(
    message: string,
    public readonly command?: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'GitSpiceError';
  }
}

/**
 * Git-spice integration utilities for creating PR stacks from task execution
 */
export class GitSpiceIntegration {
  /**
   * Check if git-spice is available in the system
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync('gs --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize git-spice in the repository if not already initialized
   */
  static async initialize(workdir: string): Promise<void> {
    try {
      const { stdout } = await execAsync('git config --get spice.root', {
        cwd: workdir,
        timeout: 5000,
      });

      if (hasContent(stdout.trim())) {
        // Already initialized
        return;
      }
    } catch {
      // Not initialized, proceed with initialization
    }

    try {
      await execAsync('gs auth setup --skip-auth', {
        cwd: workdir,
        timeout: 10_000,
      });
      console.log('🌿 Initialized git-spice in repository');
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError('Failed to initialize git-spice', 'gs auth setup', stderr);
    }
  }

  /**
   * Create a git-spice stack from executed tasks
   */
  static async createStack(
    tasks: ExecutionTask[],
    workdir: string,
    baseRef = 'main',
  ): Promise<GitSpiceStackInfo> {
    // Ensure git-spice is available and initialized
    if (!(await this.isAvailable())) {
      throw new GitSpiceError('git-spice is not installed or not available in PATH');
    }

    await this.initialize(workdir);

    const branches: GitSpiceStackInfo['branches'] = [];
    const stackRoot = baseRef;

    // Create branches for each task in dependency order
    // Note: Using sequential processing (for...of) because git operations must be ordered
    for (const task of tasks) {
      if (task.state !== 'completed') {
        continue; // Skip non-completed tasks
      }

      const branchName = this._generateBranchName(task);

      try {
        // Create branch from the appropriate parent
        const parentBranch = this._findParentBranch(task, branches, baseRef);

        // Switch to parent branch
        // eslint-disable-next-line no-await-in-loop -- git operations must be sequential
        await execAsync(`git checkout ${parentBranch}`, {
          cwd: workdir,
          timeout: 10_000,
        });

        // Create new branch
        // eslint-disable-next-line no-await-in-loop -- git operations must be sequential
        await execAsync(`gs branch create ${branchName}`, {
          cwd: workdir,
          timeout: 10_000,
        });

        // If task has a commit hash, cherry-pick it
        if (isNonEmptyString(task.commitHash)) {
          // eslint-disable-next-line no-await-in-loop -- git operations must be sequential
          await execAsync(`git cherry-pick ${task.commitHash}`, {
            cwd: workdir,
            timeout: 30_000,
          });
        }

        branches.push({
          name: branchName,
          parent: parentBranch,
          taskId: task.id,
          commitHash: task.commitHash ?? '',
        });

        console.log(`🌿 Created branch: ${branchName} (parent: ${parentBranch})`);
      } catch (error) {
        const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
        throw new GitSpiceError(
          `Failed to create branch for task ${task.id}`,
          `gs branch create ${branchName}`,
          stderr,
        );
      }
    }

    return {
      branches,
      stackRoot,
    };
  }

  /**
   * Submit the stack to GitHub as pull requests
   */
  static async submitStack(workdir: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('gs stack submit --draft', {
        cwd: workdir,
        timeout: 60_000, // Allow more time for GitHub API calls
      });

      // Parse PR URLs from output
      const prUrls = this._extractPrUrls(stdout);

      if (prUrls.length > 0) {
        console.log('🚀 Pull requests created:');
        for (const url of prUrls) {
          console.log(`  └─ ${url}`);
        }
      }

      return prUrls;
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError('Failed to submit stack to GitHub', 'gs stack submit', stderr);
    }
  }

  /**
   * Generate a consistent branch name from a task
   */
  private static _generateBranchName(task: ExecutionTask): string {
    // Use task ID as base, ensure it's git-branch safe
    const safeName = task.id.toLowerCase().replaceAll(/[^\w-]/g, '-');
    return `feature/${safeName}`;
  }

  /**
   * Find the appropriate parent branch for a task based on dependencies
   */
  private static _findParentBranch(
    task: ExecutionTask,
    existingBranches: GitSpiceStackInfo['branches'],
    baseRef: string,
  ): string {
    // If task has no dependencies, use base ref
    if (task.requires.length === 0) {
      return baseRef;
    }

    // Find the most recent dependency that has a branch
    for (const depId of task.requires.reverse()) {
      const depBranch = existingBranches.find((b) => b.taskId === depId);
      if (depBranch !== undefined) {
        return depBranch.name;
      }
    }

    // Fallback to base ref if no dependencies have branches
    return baseRef;
  }

  /**
   * Extract PR URLs from git-spice output
   */
  private static _extractPrUrls(output: string): string[] {
    const prUrlRegex = /https:\/\/github\.com\/\S+\/pull\/\d+/g;
    return output.match(prUrlRegex) ?? [];
  }
}
