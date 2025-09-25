/**
 * Git-spice worktree synchronization utilities
 */

import type { ExecutionTask } from '@/types/execution';

import { logger } from '@/utils/logger';
import { isNonEmptyString } from '@/validation/guards';
import { GitWrapper, type WorktreeInfo } from '@/vcs/git-wrapper';

/**
 * Fetch all commits from worktrees to make them accessible in the main repository
 */
export async function fetchWorktreeCommits(tasks: ExecutionTask[], workdir: string): Promise<void> {
  logger.info('🔄 Fetching commits from worktrees...');

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
      const taskWorktree = findWorktreeForTask(task, worktrees);

      if (taskWorktree !== undefined) {
        try {
          // First, try to see if the commit is already accessible
          try {
            await git.git.raw(['cat-file', '-e', task.commitHash]);
            logger.debug(
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

          logger.info(`✅ Fetched commits from worktree for task ${task.id}`);
        } catch (error) {
          // Try alternative approach: fetch the specific commit directly if we know its branch
          if (taskWorktree.branch !== undefined) {
            try {
              await git.git.raw([
                'fetch',
                taskWorktree.path,
                `+refs/heads/${taskWorktree.branch}:refs/remotes/worktree-${task.id}/${taskWorktree.branch}`,
              ]);
              logger.info(
                `✅ Fetched branch ${taskWorktree.branch} from worktree for task ${task.id}`,
              );
            } catch (fetchError) {
              logger.warn(
                `⚠️ Could not fetch from worktree for task ${task.id}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
              );
            }
          } else {
            logger.warn(
              `⚠️ Could not fetch from worktree for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      } else {
        logger.warn(`⚠️ Could not find worktree for task ${task.id}`);
      }
    }
  } catch (error) {
    logger.warn(
      `⚠️ Could not list worktrees: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Find the worktree associated with a specific task
 */
export function findWorktreeForTask(
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
      wt.branch !== undefined && wt.branch.startsWith('chopstack/') && wt.branch.includes(task.id),
  );
  if (matchingWorktree !== undefined) {
    return matchingWorktree;
  }

  return undefined;
}
