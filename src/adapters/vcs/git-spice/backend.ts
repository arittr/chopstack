/**
 * Git-spice VCS backend implementation
 */

import { execa } from 'execa';

import type { ExecutionTask, GitSpiceStackInfo } from '@/types/execution';
import type { VcsBackend } from '@/vcs';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/logger';
import { hasContent, isNonEmptyString } from '@/validation/guards';

import { GitSpiceError } from './errors';
import { extractPrUrls, generateBranchNameFromMessage } from './helpers';
import { fetchWorktreeCommits } from './worktree-sync';

/**
 * Git-spice VCS backend implementation
 */
export class GitSpiceBackend implements VcsBackend {
  constructor(private readonly _options?: Record<string, unknown>) {}

  /**
   * Check if git-spice is available in the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execa('gs', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize git-spice in the repository if not already initialized
   */
  async initialize(workdir: string, trunk?: string): Promise<void> {
    const git = new GitWrapper(workdir);

    try {
      const trunkBranch = await git.git.raw(['config', '--get', 'spice.trunk']);

      if (hasContent(trunkBranch.trim())) {
        // Already initialized
        logger.info('🌿 git-spice already initialized');
        return;
      }
    } catch {
      // Not initialized, proceed with initialization
    }

    // Use provided trunk or detect the current branch to use as trunk
    let trunkBranch: string;
    if (hasContent(trunk)) {
      trunkBranch = trunk;
    } else {
      const currentBranch = await git.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      trunkBranch = currentBranch.trim() === 'HEAD' ? 'main' : currentBranch.trim();
    }

    try {
      // Initialize git-spice with trunk branch (no remote needed for local testing)
      await execa('gs', ['repo', 'init', `--trunk=${trunkBranch}`], {
        cwd: workdir,
        timeout: 10_000,
      });
      logger.info(`🌿 Initialized git-spice in repository with trunk=${trunkBranch}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      const command = `gs repo init --trunk=${trunkBranch}`;

      logger.error(`❌ git-spice init failed: ${command}`);
      logger.error(`❌ Error: ${errorMessage}`);
      if (hasContent(stderr)) {
        logger.error(`❌ Stderr: ${stderr}`);
      }

      throw new GitSpiceError('Failed to initialize git-spice', command, stderr);
    }
  }

  /**
   * Create a git-spice branch with commit message
   */
  async createBranchWithCommit(
    workdir: string,
    branchName: string,
    commitMessage: string,
  ): Promise<string> {
    try {
      // Generate branch name if not provided
      const finalBranchName = hasContent(branchName)
        ? branchName
        : generateBranchNameFromMessage(commitMessage);

      // Create branch and commit in one step using git-spice
      await execa('gs', ['branch', 'create', finalBranchName, '-m', commitMessage], {
        cwd: workdir,
        timeout: 10_000,
      });

      logger.info(`🌿 Created git-spice branch: ${finalBranchName}`);
      return finalBranchName;
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError(`Failed to create git-spice branch`, 'gs branch create', stderr);
    }
  }

  /**
   * Submit the stack to GitHub as pull requests
   */
  async submitStack(workdir: string): Promise<string[]> {
    try {
      const { stdout } = await execa('gs', ['stack', 'submit', '--draft'], {
        cwd: workdir,
        timeout: 60_000, // Allow more time for GitHub API calls
      });

      // Parse PR URLs from output
      const prUrls = extractPrUrls(stdout);

      if (prUrls.length > 0) {
        logger.info('🚀 Pull requests created:');
        for (const url of prUrls) {
          logger.info(`  └─ ${url}`);
        }
      }

      return prUrls;
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError('Failed to submit stack to GitHub', 'gs stack submit', stderr);
    }
  }

  /**
   * Create a git-spice stack from executed tasks
   */
  async createStack(
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

    // First, ensure all worktree commits are accessible in the main repo
    await fetchWorktreeCommits(tasks, workdir);

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

        // Switch to parent branch using GitWrapper
        const git = new GitWrapper(workdir);

        // Check if parent branch is safe to checkout (not in use by another worktree)
        try {
          await git.checkout(parentBranch);
        } catch (error) {
          // If checkout fails (likely due to branch being used by another worktree),
          // use the current branch instead
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('already used by worktree')) {
            const currentBranch = await git.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
            logger.warn(
              `⚠️ ${parentBranch} is in use, using current branch ${currentBranch.trim()} instead`,
            );
            // Don't checkout, just continue with current branch
          } else {
            throw error; // Re-throw if it's a different error
          }
        }

        // Check if branch already exists and make it unique if needed
        let finalBranchName = branchName;
        try {
          await git.git.raw(['rev-parse', '--verify', branchName]);
          // Branch exists, add timestamp to make it unique
          const timestamp = Date.now();
          finalBranchName = `${branchName}-${timestamp}`;
          logger.warn(`⚠️ Branch ${branchName} already exists, using ${finalBranchName} instead`);
        } catch {
          // Branch doesn't exist, which is what we want
        }

        // Create new branch with a message to avoid prompting
        await execa(
          'gs',
          ['branch', 'create', finalBranchName, '--message', `Create branch for task ${task.id}`],
          {
            cwd: workdir,
            timeout: 10_000,
          },
        );

        // If task has a commit hash, cherry-pick it using GitWrapper
        if (isNonEmptyString(task.commitHash)) {
          try {
            // Verify commit is accessible before attempting cherry-pick
            await git.git.raw(['cat-file', '-e', task.commitHash]);

            // The commit should now be accessible after fetching from worktrees
            await git.cherryPick(task.commitHash);
            logger.info(
              `🔀 Cherry-picked commit ${task.commitHash.slice(0, 7)} for task ${task.id}`,
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Try to find and checkout the commit from remote refs if cherry-pick failed
            if (errorMessage.includes('unknown revision') || errorMessage.includes('bad object')) {
              try {
                // Look for the commit in the remote refs we created
                const remoteReferences = await git.git.raw([
                  'branch',
                  '-r',
                  '--contains',
                  task.commitHash,
                ]);
                if (remoteReferences.trim().length > 0) {
                  logger.info(
                    `🔄 Found commit in remote refs, retrying cherry-pick for task ${task.id}`,
                  );
                  await git.cherryPick(task.commitHash);
                  logger.info(
                    `🔀 Successfully cherry-picked commit ${task.commitHash.slice(0, 7)} for task ${task.id} (retry)`,
                  );
                } else {
                  logger.error(
                    `❌ Commit ${task.commitHash.slice(0, 7)} not found for task ${task.id}`,
                  );
                  continue;
                }
              } catch (retryError) {
                logger.error(
                  `❌ Failed to cherry-pick commit for task ${task.id} (retry failed): ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                );
                continue;
              }
            } else {
              logger.error(`❌ Failed to cherry-pick commit for task ${task.id}: ${errorMessage}`);
              continue;
            }
          }
        }

        branches.push({
          name: finalBranchName,
          parent: parentBranch,
          taskId: task.id,
          commitHash: task.commitHash ?? '',
        });

        logger.info(`🌿 Created branch: ${finalBranchName} (parent: ${parentBranch})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
        const command = `gs branch create ${branchName}`;

        logger.error(`❌ git-spice command failed: ${command}`);
        logger.error(`❌ Error: ${errorMessage}`);
        if (hasContent(stderr)) {
          logger.error(`❌ Stderr: ${stderr}`);
        }

        throw new GitSpiceError(`Failed to create branch for task ${task.id}`, command, stderr);
      }
    }

    return {
      branches,
      stackRoot,
    };
  }

  /**
   * Generate a consistent branch name from a task
   */
  private _generateBranchName(task: ExecutionTask): string {
    // Use task ID as base, ensure it's git-branch safe
    const safeName = task.id.toLowerCase().replaceAll(/[^\w-]/g, '-');
    return `feature/${safeName}`;
  }

  /**
   * Find the appropriate parent branch for a task based on dependencies
   */
  private _findParentBranch(
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
}
