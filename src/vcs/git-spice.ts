import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { ExecutionTask, GitSpiceStackInfo } from '../types/execution';

import { GitWrapper, type WorktreeInfo } from '../utils/git-wrapper';
import { hasContent, isNonEmptyString } from '../utils/guards';

import type { VcsBackend } from './index';

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
 * Git-spice VCS backend implementation
 */
export class GitSpiceBackend implements VcsBackend {
  constructor(private readonly _options?: Record<string, unknown>) {}

  /**
   * Check if git-spice is available in the system
   */
  async isAvailable(): Promise<boolean> {
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
  async initialize(workdir: string): Promise<void> {
    const git = new GitWrapper(workdir);

    try {
      const trunkBranch = await git.git.raw(['config', '--get', 'spice.trunk']);

      if (hasContent(trunkBranch.trim())) {
        // Already initialized
        console.log('🌿 git-spice already initialized');
        return;
      }
    } catch {
      // Not initialized, proceed with initialization
    }

    try {
      // Initialize git-spice with main as trunk branch (no remote needed for local testing)
      await execAsync('gs repo init --trunk=main', {
        cwd: workdir,
        timeout: 10_000,
      });
      console.log('🌿 Initialized git-spice in repository');
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      throw new GitSpiceError('Failed to initialize git-spice', 'gs repo init', stderr);
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
    await this._fetchWorktreeCommits(tasks, workdir);

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
        await git.checkout(parentBranch);

        // Create new branch
        await execAsync(`gs branch create ${branchName}`, {
          cwd: workdir,
          timeout: 10_000,
        });

        // If task has a commit hash, cherry-pick it using GitWrapper
        if (isNonEmptyString(task.commitHash)) {
          try {
            // Verify commit is accessible before attempting cherry-pick
            await git.git.raw(['cat-file', '-e', task.commitHash]);

            // The commit should now be accessible after fetching from worktrees
            await git.cherryPick(task.commitHash);
            console.log(
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
                  console.log(
                    `🔄 Found commit in remote refs, retrying cherry-pick for task ${task.id}`,
                  );
                  await git.cherryPick(task.commitHash);
                  console.log(
                    `🔀 Successfully cherry-picked commit ${task.commitHash.slice(0, 7)} for task ${task.id} (retry)`,
                  );
                } else {
                  console.error(
                    `❌ Commit ${task.commitHash.slice(0, 7)} not found for task ${task.id}`,
                  );
                  continue;
                }
              } catch (retryError) {
                console.error(
                  `❌ Failed to cherry-pick commit for task ${task.id} (retry failed): ${retryError instanceof Error ? retryError.message : String(retryError)}`,
                );
                continue;
              }
            } else {
              console.error(`❌ Failed to cherry-pick commit for task ${task.id}: ${errorMessage}`);
              continue;
            }
          }
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
  async submitStack(workdir: string): Promise<string[]> {
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

  /**
   * Fetch all commits from worktrees to make them accessible in the main repository
   */
  private async _fetchWorktreeCommits(tasks: ExecutionTask[], workdir: string): Promise<void> {
    console.log('🔄 Fetching commits from worktrees...');

    const git = new GitWrapper(workdir);

    try {
      // Get list of worktrees
      const worktrees = await git.listWorktrees();

      // For each task with a commit, ensure the commit is accessible
      for (const task of tasks) {
        if (!isNonEmptyString(task.commitHash)) {
          continue;
        }

        // Find the worktree for this task - match by path containing task ID
        const taskWorktree = this._findWorktreeForTask(task, worktrees);

        if (taskWorktree !== undefined) {
          try {
            // First, try to see if the commit is already accessible
            try {
              await git.git.raw(['cat-file', '-e', task.commitHash]);
              console.log(
                `✅ Commit ${task.commitHash.slice(0, 7)} already accessible for task ${task.id}`,
              );
              continue;
            } catch {
              // Commit not accessible, need to fetch
            }

            // Use git fetch with the worktree's git directory directly
            const worktreeGitDir = `${taskWorktree.path}/.git`;

            // Fetch all refs from the worktree's git directory
            await git.git.raw([
              'fetch',
              worktreeGitDir,
              `+refs/heads/*:refs/remotes/worktree-${task.id}/*`,
            ]);

            console.log(`✅ Fetched commits from worktree for task ${task.id}`);
          } catch (error) {
            // Try alternative approach: fetch the specific commit directly if we know its branch
            if (taskWorktree.branch !== undefined) {
              try {
                await git.git.raw([
                  'fetch',
                  taskWorktree.path,
                  `+refs/heads/${taskWorktree.branch}:refs/remotes/worktree-${task.id}/${taskWorktree.branch}`,
                ]);
                console.log(
                  `✅ Fetched branch ${taskWorktree.branch} from worktree for task ${task.id}`,
                );
              } catch (fetchError) {
                console.warn(
                  `⚠️ Could not fetch from worktree for task ${task.id}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
                );
              }
            } else {
              console.warn(
                `⚠️ Could not fetch from worktree for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        } else {
          console.warn(`⚠️ Could not find worktree for task ${task.id}`);
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not list worktrees: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find the worktree associated with a specific task
   */
  private _findWorktreeForTask(
    task: ExecutionTask,
    worktrees: WorktreeInfo[],
  ): WorktreeInfo | undefined {
    // Try multiple strategies to find the right worktree

    // Strategy 1: Path contains task ID
    let matchingWorktree = worktrees.find((wt) => wt.path.includes(task.id));
    if (matchingWorktree !== undefined) {
      return matchingWorktree;
    }

    // Strategy 2: Branch name contains task ID (if branch exists)
    matchingWorktree = worktrees.find((wt) => Boolean(wt.branch?.includes(task.id)));
    if (matchingWorktree !== undefined) {
      return matchingWorktree;
    }

    // Strategy 3: Look for chopstack shadow directory pattern
    matchingWorktree = worktrees.find(
      (wt) => wt.path.includes('.chopstack/shadows') && wt.path.includes(task.id),
    );
    if (matchingWorktree !== undefined) {
      return matchingWorktree;
    }

    // Strategy 4: Branch name matches chopstack pattern
    matchingWorktree = worktrees.find(
      (wt) =>
        wt.branch !== undefined &&
        wt.branch.startsWith('chopstack/') &&
        wt.branch.includes(task.id),
    );
    if (matchingWorktree !== undefined) {
      return matchingWorktree;
    }

    return undefined;
  }

  /**
   * Extract PR URLs from git-spice output
   */
  private _extractPrUrls(output: string): string[] {
    const prUrlRegex = /https:\/\/github\.com\/\S+\/pull\/\d+/g;
    return output.match(prUrlRegex) ?? [];
  }
}
