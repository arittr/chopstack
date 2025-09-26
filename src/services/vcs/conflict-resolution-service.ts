import type {
  ConflictInfo,
  ConflictResolutionService,
  ConflictResolutionStrategy,
} from '@/core/vcs/domain-services';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';

/**
 * Implementation of ConflictResolutionService domain interface
 * Handles detection and resolution of merge conflicts during stack building
 */
export class ConflictResolutionServiceImpl implements ConflictResolutionService {
  async detectConflicts(
    sourceBranch: string,
    targetBranch: string,
    workdir: string,
  ): Promise<ConflictInfo | null> {
    const git = new GitWrapper(workdir);

    try {
      // Save current branch
      const currentBranch = await git.getCurrentBranch();

      // Switch to target branch
      await git.checkout(targetBranch);

      // Attempt a dry-run merge to detect conflicts
      try {
        await git.mergeFromTo(sourceBranch, targetBranch, { noCommit: null, noFf: null });

        // If merge succeeded without conflicts, reset and return null
        await git.reset(['--hard', 'HEAD']);
        await git.checkout(currentBranch);
        return null;
      } catch (mergeError) {
        // Reset the attempted merge
        await git.reset(['--hard', 'HEAD']);
        await git.checkout(currentBranch);

        // Check if it was a conflict error
        if (
          mergeError instanceof Error &&
          (mergeError.message.includes('conflict') || mergeError.message.includes('Merge conflict'))
        ) {
          // Get conflicted files
          const status = await git.status();
          const conflictedFiles = status.conflicted ?? [];

          if (conflictedFiles.length > 0) {
            return {
              taskId: sourceBranch.replace(/^chopstack\//, ''), // Extract task ID from branch name
              conflictedFiles,
              resolution: 'auto', // Default strategy
              timestamp: new Date(),
            };
          }
        }

        // Re-throw if not a conflict error
        throw mergeError;
      }
    } catch (error) {
      logger.error(
        `Failed to detect conflicts between ${sourceBranch} and ${targetBranch}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async resolveConflicts(conflictInfo: ConflictInfo, workdir: string): Promise<boolean> {
    const { resolution, conflictedFiles, taskId } = conflictInfo;

    logger.info(`🔄 Resolving conflicts for task ${taskId} using strategy: ${resolution}`);

    const git = new GitWrapper(workdir);

    switch (resolution) {
      case 'auto': {
        return this._autoResolveConflicts(git, conflictedFiles);
      }
      case 'manual': {
        // Manual resolution requires human intervention
        logger.warn(
          `⚠️ Manual conflict resolution required for files: ${conflictedFiles.join(', ')}`,
        );
        return false;
      }
      case 'fail': {
        logger.error(`❌ Failing due to conflicts in files: ${conflictedFiles.join(', ')}`);
        return false;
      }
      default: {
        const strategyName = resolution as string;
        logger.error(`❌ Unknown conflict resolution strategy: ${strategyName}`);
        return false;
      }
    }
  }

  getAvailableStrategies(): ConflictResolutionStrategy[] {
    return ['auto', 'manual', 'fail'];
  }

  private async _autoResolveConflicts(
    git: GitWrapper,
    conflictedFiles: string[],
  ): Promise<boolean> {
    try {
      for (const file of conflictedFiles) {
        // Try to auto-resolve using git's built-in strategies
        try {
          // Attempt to use 'ours' strategy for automatic resolution
          await git.raw(['checkout', '--ours', file]);
          await git.add([file]);
          logger.info(`✅ Auto-resolved conflict in ${file} using 'ours' strategy`);
        } catch {
          // If 'ours' fails, try 'theirs'
          try {
            await git.raw(['checkout', '--theirs', file]);
            await git.add([file]);
            logger.info(`✅ Auto-resolved conflict in ${file} using 'theirs' strategy`);
          } catch {
            // If both fail, this conflict requires manual resolution
            logger.warn(`⚠️ Could not auto-resolve conflict in ${file}`);
            return false;
          }
        }
      }

      logger.info(`✅ Successfully auto-resolved all conflicts`);
      return true;
    } catch (error) {
      logger.error(
        `❌ Failed to auto-resolve conflicts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
