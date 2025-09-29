import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  WorktreeContext,
  WorktreeCreateOptions,
  WorktreeService,
} from '@/core/vcs/domain-services';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';

export type WorktreeEvent = {
  error?: string;
  taskId: string;
  timestamp: Date;
  type: 'created' | 'removed' | 'error';
  worktreePath: string;
};

export type WorktreeServiceConfig = {
  branchPrefix: string;
  cleanupOnFailure: boolean;
  cleanupOnSuccess: boolean;
  shadowPath: string;
};

/**
 * Implementation of WorktreeService domain interface
 * Handles creation, tracking, and cleanup of git worktrees for parallel task execution
 */
export class WorktreeServiceImpl extends EventEmitter implements WorktreeService {
  private readonly activeWorktrees: Map<string, WorktreeContext> = new Map();
  private readonly config: WorktreeServiceConfig;

  constructor(config: WorktreeServiceConfig) {
    super();
    this.config = config;
  }

  async createWorktree(options: WorktreeCreateOptions): Promise<WorktreeContext> {
    const { taskId, branchName, worktreePath, baseRef, workdir } = options;

    logger.info(`🏗️ Creating worktree for task ${taskId}: ${branchName}`);

    // Ensure shadow directory exists
    const shadowDir = path.dirname(path.resolve(workdir, worktreePath));
    await fs.mkdir(shadowDir, { recursive: true });

    const absolutePath = path.resolve(workdir, worktreePath);
    const git = new GitWrapper(workdir);

    // Check if worktree already exists at this path and remove it
    try {
      const existingWorktrees = await git.listWorktrees();
      const existingWorktree = existingWorktrees.find((w) => w.path === absolutePath);
      if (existingWorktree !== undefined) {
        logger.info(`🧹 Removing existing worktree at ${absolutePath}`);
        await git.removeWorktree(absolutePath, true);
      }
    } catch (error) {
      // Ignore errors when checking/removing existing worktrees
      logger.debug(
        `Could not check/remove existing worktree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Check if the baseRef is already the branch we want to checkout
      const baseRefIsBranch = await git.branchExists(baseRef);
      let finalBranchName: string;

      if (baseRefIsBranch && baseRef.startsWith('chopstack/')) {
        // The baseRef is already a chopstack branch, checkout it directly
        // Don't create a new branch
        await git.createWorktree(absolutePath, baseRef);
        finalBranchName = baseRef;
      } else {
        // Need to create a new branch for this worktree
        finalBranchName = await this._generateUniqueBranchName(git, branchName);
        await git.createWorktree(absolutePath, baseRef, finalBranchName);
      }

      const context: WorktreeContext = {
        taskId,
        branchName: finalBranchName,
        worktreePath,
        baseRef,
        absolutePath,
        created: new Date(),
      };

      this.activeWorktrees.set(taskId, context);

      this.emit('worktree_created', {
        type: 'created',
        taskId,
        worktreePath: absolutePath,
        timestamp: new Date(),
      } as WorktreeEvent);

      logger.info(`✅ Created worktree for task ${taskId} at ${absolutePath}`);
      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to create worktree for task ${taskId}: ${errorMessage}`);

      this.emit('worktree_error', {
        type: 'error',
        taskId,
        worktreePath: absolutePath,
        timestamp: new Date(),
        error: errorMessage,
      } as WorktreeEvent);

      throw new Error(`Failed to create worktree for task ${taskId}: ${errorMessage}`);
    }
  }

  async removeWorktree(taskId: string): Promise<void> {
    const context = this.activeWorktrees.get(taskId);
    if (context === undefined) {
      logger.warn(`⚠️ No active worktree found for task ${taskId}`);
      return;
    }

    logger.info(`🧹 Removing worktree for task ${taskId}`);

    try {
      const git = new GitWrapper(path.dirname(context.absolutePath));
      await git.removeWorktree(context.absolutePath);

      this.activeWorktrees.delete(taskId);

      this.emit('worktree_cleanup', {
        type: 'removed',
        taskId,
        worktreePath: context.absolutePath,
        timestamp: new Date(),
      } as WorktreeEvent);

      logger.info(`✅ Removed worktree for task ${taskId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to remove worktree for task ${taskId}: ${errorMessage}`);

      // Try force removal as fallback
      try {
        const git = new GitWrapper(path.dirname(context.absolutePath));
        await git.removeWorktree(context.absolutePath, true);
        this.activeWorktrees.delete(taskId);
        logger.info(`✅ Force removed worktree for task ${taskId}`);
      } catch (forceError) {
        logger.error(
          `❌ Failed to force remove worktree for task ${taskId}: ${forceError instanceof Error ? forceError.message : String(forceError)}`,
        );
        throw new Error(`Failed to remove worktree for task ${taskId}: ${errorMessage}`);
      }
    }
  }

  async cleanupWorktrees(taskIds: string[]): Promise<void> {
    logger.info(`🧹 Cleaning up ${taskIds.length} worktrees...`);

    // Capture working directory before removing worktrees
    let workingDir: string | undefined;
    if (taskIds.length > 0) {
      const firstTaskId = taskIds[0];
      if (firstTaskId !== undefined) {
        const firstTaskContext = this.activeWorktrees.get(firstTaskId);
        if (firstTaskContext !== undefined) {
          // Extract working directory from absolute path
          workingDir = firstTaskContext.absolutePath.replace(/\/\.chopstack\/.*$/, '');
        }
      }
    }

    const cleanupPromises = taskIds.map(async (taskId) => {
      try {
        await this.removeWorktree(taskId);
        return { taskId, success: true };
      } catch (error) {
        logger.error(
          `Failed to cleanup worktree for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { taskId, success: false, error };
      }
    });

    const results = await Promise.allSettled(cleanupPromises);
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      logger.warn(`⚠️ Cleanup completed: ${successful} successful, ${failed} failed`);
    } else {
      logger.info(`✅ Cleanup complete: ${successful} worktrees removed`);
    }

    // Clean up empty shadows directory if all worktrees removed successfully
    // Keep the .chopstack directory itself as it contains logs
    if (
      successful === taskIds.length &&
      this.activeWorktrees.size === 0 &&
      workingDir !== undefined
    ) {
      try {
        // Only remove the shadows subdirectory, not the entire .chopstack directory
        const { execSync } = await import('node:child_process');
        const shadowsPath = path.join(workingDir, '.chopstack', 'shadows');
        execSync(`rm -rf "${shadowsPath}"`, { cwd: workingDir });
        logger.info(`🧹 Cleaned up shadows directory`);
      } catch (error) {
        logger.warn(`⚠️ Failed to clean up shadows directory: ${String(error)}`);
      }
    }
  }

  getActiveWorktrees(): WorktreeContext[] {
    return [...this.activeWorktrees.values()];
  }

  hasWorktree(taskId: string): boolean {
    return this.activeWorktrees.has(taskId);
  }

  private async _generateUniqueBranchName(git: GitWrapper, baseName: string): Promise<string> {
    const branchExists = await git.branchExists(baseName);
    if (!branchExists) {
      return baseName;
    }

    // Generate unique branch name with timestamp suffix
    const timestamp = Date.now().toString(36);
    const uniqueName = `${baseName}-${timestamp}`;

    logger.warn(`⚠️ Branch ${baseName} already exists, using ${uniqueName} instead`);
    return uniqueName;
  }
}
