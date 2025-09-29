/**
 * Git-spice VCS backend implementation
 */

import { execa } from 'execa';

import type { ExecutionTask, GitSpiceStackInfo } from '@/core/execution/types';
import type { VcsBackend } from '@/core/vcs/interfaces';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';
import { hasContent, isNonEmptyString } from '@/validation/guards';

import { GitSpiceError } from './errors';
import { extractPrUrls, generateBranchNameFromMessage } from './helpers';
import { fetchWorktreeCommits } from './worktree-sync';

/**
 * Git-spice VCS backend implementation
 */
const GIT_SPICE_BRANCH_TIMEOUT_MS = 120_000;

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
        timeout: GIT_SPICE_BRANCH_TIMEOUT_MS,
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
   * DEPRECATED: Use createStackBranch for new workflows.
   * Creates a branch from an existing commit using the old cherry-pick approach.
   *
   * This method is kept for backward compatibility but should not be used
   * for new git-spice "Spice-first" workflows.
   *
   * @param branchName - The name of the branch to create
   * @param commitHash - The commit hash to base the branch on
   * @param parentBranch - The parent branch to stack on top of
   * @param workdir - The working directory
   * @returns The actual branch name created (may have suffix if collision occurred)
   * @deprecated Use createStackBranch and commitInStack instead
   */
  async createBranchFromCommit(
    branchName: string,
    commitHash: string,
    parentBranch: string,
    workdir: string,
  ): Promise<string> {
    logger.info(`🆕 [GitSpiceBackend.createBranchFromCommit]`);
    logger.info(`  🎯 Branch name: ${branchName}`);
    logger.info(`  📝 Commit hash: ${commitHash.slice(0, 7)}`);
    logger.info(`  🌳 Parent branch: ${parentBranch}`);
    logger.info(`  📂 Working dir: ${workdir}`);

    try {
      const git = new GitWrapper(workdir);

      // Check if this is a worktree
      const gitDir = await git.git.revparse(['.git']);
      const isWorktree = !gitDir.endsWith('.git');
      logger.info(`  📊 Is worktree: ${isWorktree} (git dir: ${gitDir})`);

      // Debug: Check what's in the commit before checkout
      try {
        const commitFiles = await git.git.raw(['ls-tree', '-r', '--name-only', commitHash]);
        logger.info(`  🔍 Commit ${commitHash.slice(0, 7)} contains files: ${commitFiles.trim()}`);
      } catch (debugError) {
        logger.warn(`  ⚠️ Failed to list commit files: ${String(debugError)}`);
      }

      // Create branch directly from the commit
      logger.info(`  🌿 Creating git branch ${branchName} from commit ${commitHash.slice(0, 7)}`);

      // Check if branch already exists and make it unique if needed
      let finalBranchName = branchName;
      const branches = await git.git.branch();
      if (branches.all.includes(branchName)) {
        const timestamp = Date.now().toString(36);
        finalBranchName = `${branchName}-${timestamp}`;
        logger.warn(`  ⚠️ Branch ${branchName} already exists, using ${finalBranchName} instead`);
      }

      // For non-worktree operations (main repo), we need to be more careful
      // to avoid disrupting the user's current branch
      if (!isWorktree) {
        // Save current branch to restore later
        const originalBranch = await git.git.revparse(['--abbrev-ref', 'HEAD']);

        // Create the branch from the parent branch + commit (cumulative stacking)
        logger.info(`  🔗 Creating branch ${finalBranchName} from parent: ${parentBranch}`);

        // Create new branch from parent without checking it out
        await git.git.raw(['branch', finalBranchName, parentBranch]);

        // Cherry-pick the commit onto the new branch
        logger.info(`  🍒 Applying commit ${commitHash.slice(0, 7)} to ${finalBranchName}`);

        // We need to temporarily switch to apply the commit
        await git.git.checkout([finalBranchName]);

        try {
          await git.git.raw(['cherry-pick', commitHash]);
          logger.info(`  ✅ Successfully cherry-picked commit onto ${finalBranchName}`);
        } catch (cherryPickError) {
          logger.warn(
            `  ⚠️ Cherry-pick failed, using reset as fallback: ${String(cherryPickError)}`,
          );
          // Alternative: reset to the commit directly
          await git.git.reset(['--hard', commitHash]);
          logger.info(`  🔄 Used hard reset to commit as fallback`);
        }

        // Switch back to original branch to avoid disrupting user's workflow
        logger.info(`  🔄 Restoring original branch: ${originalBranch}`);
        await git.git.checkout([originalBranch]);
      } else {
        // In a worktree, we can switch branches freely
        logger.info(`  🔗 Checking out parent branch: ${parentBranch}`);
        await git.git.checkout([parentBranch]);

        // Create new branch from the parent
        await git.git.checkoutBranch(finalBranchName, parentBranch);

        // Apply the specific commit on top of the parent branch
        logger.info(`  🍒 Cherry-picking commit ${commitHash.slice(0, 7)} onto ${parentBranch}`);
        try {
          await git.git.raw(['cherry-pick', commitHash]);
          logger.info(`  ✅ Successfully cherry-picked commit onto ${finalBranchName}`);
        } catch (cherryPickError) {
          logger.warn(
            `  ⚠️ Cherry-pick failed, trying alternative approach: ${String(cherryPickError)}`,
          );
          // Alternative: reset to the commit directly (fallback to original behavior)
          await git.git.reset(['--hard', commitHash]);
          logger.info(`  🔄 Used hard reset to commit as fallback`);
        }
      }

      // Log branch creation success
      if (!isWorktree) {
        // In main repo, we restored original branch
        const currentBranch = await git.git.revparse(['--abbrev-ref', 'HEAD']);
        logger.info(`  ✅ Created branch ${finalBranchName} (currently on: ${currentBranch})`);
      } else {
        // In worktree, we're on the new branch
        logger.info(`  ✅ Created and checked out branch: ${finalBranchName}`);
      }

      // If we're in a worktree, we need to set up git-spice tracking in the main repo
      let branchTracked = false;

      if (isWorktree) {
        // Get the main repository path
        const mainRepoPath = workdir.replace(/\/\.chopstack(?:\/[^/]+){2}$/, '');
        logger.info(`  🏠 Main repo path: ${mainRepoPath}`);

        // Fetch the branch from the worktree to the main repo
        const mainGit = new GitWrapper(mainRepoPath);

        // Check if branch already exists in main repo and make it unique if needed
        const mainBranches = await mainGit.git.branch();
        if (mainBranches.all.includes(finalBranchName)) {
          const timestamp = Date.now().toString(36);
          finalBranchName = `${finalBranchName}-${timestamp}`;
          logger.warn(`  ⚠️ Branch ${finalBranchName} exists in main repo, using unique name`);
        }

        logger.info(`  📥 Fetching branch from worktree to main repo`);
        await mainGit.git.fetch([workdir, `${finalBranchName}:${finalBranchName}`]);

        // Now track it with git-spice in the main repo
        const trackCommand = ['branch', 'track', finalBranchName, '--base', parentBranch];
        logger.info(`  🔗 Running in main repo: gs ${trackCommand.join(' ')}`);

        try {
          const trackResult = await execa('gs', trackCommand, {
            cwd: mainRepoPath,
            timeout: GIT_SPICE_BRANCH_TIMEOUT_MS,
          });
          const trackOutput = typeof trackResult.stdout === 'string' ? trackResult.stdout : '';
          if (trackOutput !== '') {
            logger.info(`  📤 Track result: ${trackOutput}`);
          }

          // Note: We don't checkout the branch in main repo to avoid disrupting user's workflow
          logger.info(`  ✅ Branch ${finalBranchName} tracked in main repo (without switching)`);

          branchTracked = true;

          // Note: Don't remove the worktree here - it may still be needed for other operations
        } catch (trackError) {
          logger.warn(`  ⚠️ Failed to track branch with git-spice: ${String(trackError)}`);
          // Branch still exists as regular git branch even if git-spice tracking fails
        }
      }

      if (!branchTracked) {
        const trackCommand = ['branch', 'track', finalBranchName, '--base', parentBranch];
        logger.info(
          `  🔗 Tracking branch with git-spice from ${workdir}: gs ${trackCommand.join(' ')}`,
        );

        try {
          const trackResult = await execa('gs', trackCommand, {
            cwd: workdir,
            timeout: GIT_SPICE_BRANCH_TIMEOUT_MS,
          });
          const trackOutput = typeof trackResult.stdout === 'string' ? trackResult.stdout : '';
          if (trackOutput !== '') {
            logger.info(`  📤 Track result: ${trackOutput}`);
          }
        } catch (trackError) {
          const errorMessage =
            trackError instanceof Error ? trackError.message : String(trackError);
          logger.warn(
            `  ⚠️ Failed to track branch with git-spice from ${workdir}: ${errorMessage}`,
          );
          throw new GitSpiceError(
            `Failed to track branch ${finalBranchName} with git-spice`,
            'gs branch track',
            errorMessage,
          );
        }
      }

      // Verify the branch was created
      const finalBranches = await git.git.branch();
      const branchExists = finalBranches.all.includes(finalBranchName);
      logger.info(`  🔍 Branch ${finalBranchName} exists: ${branchExists}`);

      // Debug: Check what files are in the final branch without switching to it
      try {
        const branchFiles = await git.git.raw(['ls-tree', '-r', '--name-only', finalBranchName]);
        logger.info(`  🔍 Final branch ${finalBranchName} contains files: ${branchFiles.trim()}`);
      } catch (debugError) {
        logger.warn(`  ⚠️ Failed to check final branch files: ${String(debugError)}`);
      }

      logger.info(`  ✅ git-spice branch ${finalBranchName} created and tracked successfully`);
      return finalBranchName;
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      const stdout = error instanceof Error && 'stdout' in error ? String(error.stdout) : '';
      logger.error(
        `  ❌ Failed to create branch: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(`  📤 stdout: ${stdout}`);
      logger.error(`  📥 stderr: ${stderr}`);
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

    // After all branches are tracked, run upstack restack to properly stack them
    if (branches.length > 0) {
      logger.info(`🔄 Running git-spice restack to properly stack ${branches.length} branches...`);
      try {
        await execa('gs', ['upstack', 'restack'], {
          cwd: workdir,
          timeout: 30_000, // Give more time for restacking
        });
        logger.info(`✅ Successfully restacked ${branches.length} branches`);
      } catch (restackError) {
        logger.warn(`⚠️ Failed to restack branches: ${String(restackError)}`);
        // Continue anyway - branches are still created and tracked
      }
    }

    return {
      branches,
      stackRoot,
      prUrls: [],
    };
  }

  /**
   * Restack all tracked branches using git-spice upstack restack
   */
  async restack(workdir: string): Promise<void> {
    logger.info(`🔄 Running git-spice upstack restack...`);

    try {
      await execa('gs', ['upstack', 'restack'], {
        cwd: workdir,
        timeout: 30_000, // Give more time for restacking
      });
      logger.info(`✅ Successfully restacked stack branches`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ Failed to restack branches: ${errorMessage}`);
      throw new GitSpiceError('Failed to restack branches', 'gs upstack restack', errorMessage);
    }
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
      timedOut?: boolean;
    };

    // Extract all available error information
    const errorDetails: string[] = [];

    if (execaError.shortMessage != null && execaError.shortMessage.length > 0) {
      errorDetails.push(`Command: ${execaError.shortMessage}`);
    }

    if (execaError.exitCode !== undefined) {
      errorDetails.push(`Exit code: ${execaError.exitCode}`);
    }

    if (execaError.timedOut === true) {
      errorDetails.push(
        `Timed out after ${GIT_SPICE_BRANCH_TIMEOUT_MS / 1000} seconds while waiting for ${command} to finish`,
      );
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

  /**
   * Create a branch in the stack with proper parent tracking
   * Uses `gs branch create` to create the branch and track parent relationships
   */
  async createStackBranch(
    branchName: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    logger.info(`🌿 Creating stack branch ${branchName} with parent ${parentBranch}`);

    try {
      // Create branch with git-spice, tracking the parent
      await execa(
        'gs',
        [
          'branch',
          'create',
          branchName,
          '--from',
          parentBranch,
          '--message',
          `Create ${branchName}`,
        ],
        {
          cwd: workdir,
          timeout: GIT_SPICE_BRANCH_TIMEOUT_MS,
        },
      );

      logger.info(`✅ Created and tracked branch ${branchName} with parent ${parentBranch}`);
    } catch (error) {
      const gitSpiceError = this._extractDetailedError(error, `gs branch create ${branchName}`);
      throw gitSpiceError;
    }
  }

  /**
   * Commit changes in a stack-aware way using `gs commit`
   * This automatically handles restacking unless explicitly disabled
   */
  async commitInStack(
    message: string,
    workdir: string,
    options?: {
      files?: string[];
      noRestack?: boolean;
    },
  ): Promise<string> {
    const git = new GitWrapper(workdir);

    // Stage files if specified
    if (options?.files !== undefined && options.files.length > 0) {
      await git.git.add(options.files);
    }

    try {
      // Use gs commit which handles restacking automatically
      const args = ['commit', '--message', message];

      if (options?.noRestack === true) {
        args.push('--no-restack');
      }

      const { stdout } = await execa('gs', args, {
        cwd: workdir,
        timeout: 30_000,
      });

      // Extract commit hash from output
      const commitMatch = stdout.match(/\[[\w/]+\s+([\da-f]{7,40})]/);
      const commitHash = commitMatch?.[1] ?? '';

      logger.info(`✅ Committed with git-spice: ${commitHash}`);
      return commitHash;
    } catch (error) {
      const gitSpiceError = this._extractDetailedError(error, 'gs commit');
      throw gitSpiceError;
    }
  }

  /**
   * Track an existing branch with the VCS backend
   * Used to integrate branches created outside of git-spice
   */
  async trackBranch(branchName: string, parentBranch: string, workdir: string): Promise<void> {
    logger.info(`🔗 Tracking existing branch ${branchName} with parent ${parentBranch}`);

    try {
      await execa('gs', ['branch', 'track', branchName, '--parent', parentBranch], {
        cwd: workdir,
        timeout: 10_000,
      });

      logger.info(`✅ Tracked branch ${branchName} with parent ${parentBranch}`);
    } catch (error) {
      const gitSpiceError = this._extractDetailedError(error, `gs branch track ${branchName}`);
      throw gitSpiceError;
    }
  }
}
