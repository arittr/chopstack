/**
 * Git-spice VCS backend implementation
 */

import { execa } from 'execa';

import type { ExecutionTask, GitSpiceStackInfo } from '@/core/execution/types';
import type { VcsBackend } from '@/core/vcs/interfaces';

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
   *
   * NOTE: This method is primarily for test environments where we need to
   * set up git-spice in temporary worktrees. In production usage, users
   * should manually run `gs repo init` in their repository before using
   * git-spice features.
   *
   * The stack command intentionally does NOT call this method to avoid
   * accidentally initializing git-spice in user repositories.
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
        all: true,
        cwd: workdir,
        timeout: 10_000,
      });

      logger.info(`🌿 Created git-spice branch: ${finalBranchName}`);
      return finalBranchName;
    } catch (error) {
      // Extract detailed error information from execa error
      const gitSpiceError = this._extractDetailedError(error, 'gs branch create');
      throw gitSpiceError;
    }
  }

  /**
   * Create a branch from a specific commit
   */
  async createBranchFromCommit(
    branchName: string,
    commitHash: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    try {
      // Switch to parent branch first
      const git = new GitWrapper(workdir);
      await git.checkout(parentBranch);

      // Create branch from commit using git-spice
      await execa('gs', ['branch', 'create', branchName, '--from', commitHash], {
        cwd: workdir,
        timeout: 10_000,
      });

      logger.info(
        `🌿 Created git-spice branch ${branchName} from commit ${commitHash.slice(0, 7)}`,
      );
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError(
        `Failed to create branch ${branchName} from commit`,
        'gs branch create',
        stderr,
      );
    }
  }

  /**
   * Get current stack information
   */
  async getStackInfo(workdir: string): Promise<GitSpiceStackInfo | null> {
    try {
      const { stdout } = await execa('gs', ['stack', 'log'], {
        cwd: workdir,
        timeout: 10_000,
      });

      // Parse git-spice stack log output
      const branches = this._parseStackLog(stdout);

      return {
        branches: branches.map((branch) => ({
          name: branch.name,
          taskId: branch.taskId,
          commitHash: branch.commitHash,
          parent: '', // Will be determined when building stack
        })),
        stackRoot: 'main', // Default stack root
        prUrls: [], // Will be populated when stack is submitted
      };
    } catch (error) {
      logger.warn(
        `Could not get git-spice stack info: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Submit the stack to GitHub as pull requests
   */
  async submitStack(
    workdir: string,
    options: {
      autoMerge?: boolean;
      draft?: boolean;
      extraArgs?: string[];
    } = {},
  ): Promise<string[]> {
    try {
      const args = ['stack', 'submit'];

      if (options.draft !== false) {
        args.push('--draft');
      }

      if (options.autoMerge === true) {
        args.push('--auto-merge');
      }

      if (Array.isArray(options.extraArgs)) {
        args.push(...options.extraArgs);
      }

      const { stdout } = await execa('gs', args, {
        cwd: workdir,
        timeout: 60_000, // Allow more time for GitHub API calls
        all: true,
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
      // Extract detailed error information from execa error
      const gitSpiceError = this._extractDetailedError(error, 'gs stack submit');
      throw gitSpiceError;
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
      prUrls: [],
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

    // If no existing branches, use base ref
    if (existingBranches === undefined || existingBranches.length === 0) {
      return baseRef;
    }

    // Find the most recent dependency that has a branch
    for (const depId of task.requires.reverse()) {
      const depBranch = existingBranches.find((b: { taskId: string }) => b.taskId === depId);
      if (depBranch !== undefined) {
        return depBranch.name;
      }
    }

    // Fallback to base ref if no dependencies have branches
    return baseRef;
  }

  /**
   * Extract detailed error information from execa errors
   */
  private _extractDetailedError(error: unknown, command: string): GitSpiceError {
    if (!(error instanceof Error)) {
      return new GitSpiceError(`Unknown error during ${command}`, command, String(error));
    }

    // Handle execa errors with detailed information
    const execaError = error as Error & {
      all?: string;
      command?: string;
      escapedCommand?: string;
      exitCode?: number;
      shortMessage?: string;
      stderr?: string;
      stdout?: string;
    };

    // Extract all available error information
    const errorDetails: string[] = [];

    if (execaError.shortMessage != null && execaError.shortMessage.length > 0) {
      errorDetails.push(`Command: ${execaError.shortMessage}`);
    }

    if (execaError.exitCode !== undefined) {
      errorDetails.push(`Exit code: ${execaError.exitCode}`);
    }

    // Capture stderr (where most git/pre-commit hook errors appear)
    let errorOutput = '';
    if (execaError.stderr != null && hasContent(execaError.stderr)) {
      errorOutput = execaError.stderr;
      errorDetails.push(`STDERR:\n${execaError.stderr}`);
    }

    // Capture combined output if stderr is empty
    if (!hasContent(errorOutput) && execaError.all != null && hasContent(execaError.all)) {
      errorOutput = execaError.all;
      errorDetails.push(`OUTPUT:\n${execaError.all}`);
    }

    // Capture stdout as fallback
    if (!hasContent(errorOutput) && execaError.stdout != null && hasContent(execaError.stdout)) {
      errorOutput = execaError.stdout;
      errorDetails.push(`STDOUT:\n${execaError.stdout}`);
    }

    // Create detailed error message
    const detailedMessage =
      errorDetails.length > 0
        ? `${command} failed:\n${errorDetails.join('\n')}`
        : `${command} failed: ${error.message}`;

    return new GitSpiceError(
      detailedMessage,
      command,
      errorOutput.length > 0 ? errorOutput : error.message,
    );
  }

  /**
   * Parse git-spice stack log output
   */
  private _parseStackLog(output: string): Array<{
    commitHash: string;
    name: string;
    taskId: string;
  }> {
    const branches: Array<{ commitHash: string; name: string; taskId: string }> = [];

    // Parse git-spice stack log output - this is a simplified parser
    // Real implementation would need to handle the actual git-spice output format
    const lines = output.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      // Look for branch names that match our pattern
      const branchMatch = line.match(/chopstack\/([^\\s]+)/);
      if (branchMatch?.[1] !== undefined) {
        const taskId = branchMatch[1];
        const branchName = branchMatch[0];

        // Extract commit hash if present in the line
        const commitMatch = line.match(/([\da-f]{7,40})/);
        const commitHash = commitMatch?.[1] ?? '';

        branches.push({
          name: branchName,
          taskId,
          commitHash,
        });
      }
    }

    return branches;
  }
}
