import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { VcsEngineOptions } from '../engine/vcs-engine';

import { logger } from '../utils/logger';

import { GitWrapper } from './git-wrapper';

export type WorktreeCreateOptions = {
  baseRef: string;
  branchName: string;
  taskId: string;
  workdir: string;
  worktreePath: string;
};

export type WorktreeContext = {
  absolutePath: string;
  baseRef: string;
  branchName: string;
  created: Date;
  taskId: string;
  worktreePath: string;
};

export type WorktreeEvent = {
  error?: string;
  taskId: string;
  timestamp: Date;
  type: 'created' | 'removed' | 'error';
  worktreePath: string;
};

/**
 * WorktreeManager handles creation, tracking, and cleanup of git worktrees
 * for parallel task execution in isolated environments
 */
export class WorktreeManager extends EventEmitter {
  private readonly activeWorktrees: Map<string, WorktreeContext> = new Map();
  private readonly options: VcsEngineOptions;

  constructor(options: VcsEngineOptions) {
    super();
    this.options = options;
  }

  /**
   * Create a new worktree for a task
   */
  async createWorktree(options: WorktreeCreateOptions): Promise<WorktreeContext> {
    const { taskId, branchName, worktreePath, baseRef, workdir } = options;

    try {
      // Ensure shadow directory exists
      const shadowDirectory = path.join(workdir, this.options.shadowPath);
      await fs.mkdir(shadowDirectory, { recursive: true });

      const absoluteWorktreePath = path.join(workdir, worktreePath);

      // Check if worktree already exists
      if (this.activeWorktrees.has(taskId)) {
        const existing = this.activeWorktrees.get(taskId);
        logger.info(`🔄 Reusing existing worktree for task ${taskId}: ${existing?.worktreePath}`);
        if (existing === undefined) {
          throw new Error(`Worktree context unexpectedly undefined for task ${taskId}`);
        }
        return existing;
      }

      logger.info(`🌿 Creating worktree for task ${taskId}...`);
      logger.info(`   Branch: ${branchName}`);
      logger.info(`   Path: ${worktreePath}`);
      logger.info(`   Base: ${baseRef}`);

      // Create the worktree with a new branch using GitWrapper
      const git = new GitWrapper(workdir);

      // Check if branch already exists
      let finalBranchName = branchName;
      let branchExists = false;

      try {
        await git.git.raw(['rev-parse', '--verify', branchName]);
        branchExists = true;
      } catch {
        // Branch doesn't exist, which is what we want
      }

      if (branchExists) {
        // Add timestamp to make branch name unique
        const timestamp = Date.now();
        finalBranchName = `${branchName}-${timestamp}`;
        logger.warn(`⚠️ Branch ${branchName} already exists, using ${finalBranchName} instead`);
      }

      try {
        // Use relative path since GitWrapper is already in workdir context
        await git.createWorktree(worktreePath, baseRef, finalBranchName);
      } catch (error) {
        throw new Error(
          `Failed to create worktree for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Verify worktree was created successfully
      const worktreeExists = await fs
        .access(absoluteWorktreePath)
        .then(() => true)
        .catch(() => false);
      if (!worktreeExists) {
        throw new Error(
          `Worktree creation appeared to succeed but directory does not exist: ${absoluteWorktreePath}`,
        );
      }

      const context: WorktreeContext = {
        taskId,
        worktreePath,
        branchName: finalBranchName,
        baseRef,
        absolutePath: absoluteWorktreePath,
        created: new Date(),
      };

      this.activeWorktrees.set(taskId, context);

      this.emit('worktree_created', {
        type: 'created',
        taskId,
        worktreePath: absoluteWorktreePath,
        timestamp: new Date(),
      } as WorktreeEvent);

      logger.info(`✅ Created worktree for task ${taskId}`);
      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to create worktree for task ${taskId}: ${errorMessage}`);

      this.emit('worktree_created', {
        type: 'error',
        taskId,
        worktreePath: path.join(workdir, worktreePath),
        timestamp: new Date(),
        error: errorMessage,
      } as WorktreeEvent);

      throw error;
    }
  }

  /**
   * Get worktree context for a task
   */
  getWorktreeContext(taskId: string): WorktreeContext | undefined {
    return this.activeWorktrees.get(taskId);
  }

  /**
   * List all active worktrees
   */
  getActiveWorktrees(): WorktreeContext[] {
    return [...this.activeWorktrees.values()];
  }

  /**
   * Check if a task has an active worktree
   */
  hasWorktree(taskId: string): boolean {
    return this.activeWorktrees.has(taskId);
  }

  /**
   * Remove a specific worktree
   */
  async removeWorktree(taskId: string, force = false): Promise<boolean> {
    const context = this.activeWorktrees.get(taskId);
    if (context === undefined) {
      logger.warn(`⚠️ No worktree found for task ${taskId}`);
      return false;
    }

    try {
      logger.info(`🧹 Removing worktree for task ${taskId}: ${context.worktreePath}`);

      // Extract workdir from absolute path
      const workdir = context.absolutePath.replace(`/${context.worktreePath}`, '');

      // Remove the worktree using GitWrapper
      const git = new GitWrapper(workdir);
      await git.removeWorktree(context.absolutePath, force);

      // Clean up empty shadow directory if this was the last worktree
      try {
        const shadowDirectory = path.dirname(context.absolutePath);
        const remaining = await fs.readdir(shadowDirectory);
        if (remaining.length === 0) {
          await fs.rmdir(shadowDirectory);
        }
      } catch {
        // Ignore cleanup errors for shadow directory
      }

      this.activeWorktrees.delete(taskId);

      this.emit('worktree_cleanup', {
        type: 'removed',
        taskId,
        worktreePath: context.absolutePath,
        timestamp: new Date(),
      } as WorktreeEvent);

      logger.info(`✅ Removed worktree for task ${taskId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to remove worktree for task ${taskId}: ${errorMessage}`);

      this.emit('worktree_cleanup', {
        type: 'error',
        taskId,
        worktreePath: context.absolutePath,
        timestamp: new Date(),
        error: errorMessage,
      } as WorktreeEvent);

      if (!force) {
        // Try once more with force
        return this.removeWorktree(taskId, true);
      }

      return false;
    }
  }

  /**
   * Clean up multiple worktrees
   */
  async cleanupWorktrees(taskIds: string[]): Promise<{ failed: string[]; removed: string[] }> {
    const results = {
      removed: [] as string[],
      failed: [] as string[],
    };

    logger.info(`🧹 Cleaning up ${taskIds.length} worktrees...`);

    const cleanupPromises = taskIds.map(async (taskId) => {
      try {
        const success = await this.removeWorktree(taskId);
        return { taskId, success };
      } catch {
        return { taskId, success: false };
      }
    });

    const cleanupResults = await Promise.all(cleanupPromises);

    for (const result of cleanupResults) {
      if (result.success) {
        results.removed.push(result.taskId);
      } else {
        results.failed.push(result.taskId);
      }
    }

    logger.info(
      `✅ Cleanup complete: ${results.removed.length} removed, ${results.failed.length} failed`,
    );

    return results;
  }

  /**
   * Clean up all active worktrees
   */
  async cleanupAllWorktrees(): Promise<{ failed: string[]; removed: string[] }> {
    const taskIds = [...this.activeWorktrees.keys()];
    return this.cleanupWorktrees(taskIds);
  }

  /**
   * Verify worktree integrity and git status
   */
  async verifyWorktree(taskId: string): Promise<{
    branchName?: string;
    error?: string;
    exists: boolean;
    hasChanges: boolean;
    isGitRepo: boolean;
  }> {
    const context = this.activeWorktrees.get(taskId);
    if (context === undefined) {
      return {
        exists: false,
        isGitRepo: false,
        hasChanges: false,
        error: 'Worktree context not found',
      };
    }

    try {
      // Check if directory exists
      const exists = await fs
        .access(context.absolutePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        return {
          exists: false,
          isGitRepo: false,
          hasChanges: false,
          error: 'Worktree directory does not exist',
        };
      }

      // Check if it's a git repository and get status using GitWrapper
      const git = new GitWrapper(context.absolutePath);
      const branchName = await git.git.revparse(['--abbrev-ref', 'HEAD']);
      const status = await git.status();
      const hasChanges =
        status.added.length > 0 ||
        status.modified.length > 0 ||
        status.deleted.length > 0 ||
        status.untracked.length > 0;

      return {
        exists: true,
        isGitRepo: true,
        branchName: branchName.trim(),
        hasChanges,
      };
    } catch (error) {
      return {
        exists: false,
        isGitRepo: false,
        hasChanges: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get disk usage statistics for worktrees
   */
  async getWorktreeStats(): Promise<{
    averageSize: number; // in KB
    newestWorktree?: Date;
    oldestWorktree?: Date;
    totalDiskUsage: number; // in KB
    totalWorktrees: number;
  }> {
    const worktrees = this.getActiveWorktrees();

    if (worktrees.length === 0) {
      return {
        totalWorktrees: 0,
        totalDiskUsage: 0,
        averageSize: 0,
      };
    }

    // Calculate disk usage
    const sizePromises = worktrees.map(async (worktree) => {
      try {
        // Use node fs to calculate size instead of system du command
        const stats = await fs.stat(worktree.absolutePath);
        // Rough approximation for directory size in KB
        return Math.round(stats.size / 1024) > 0 ? Math.round(stats.size / 1024) : 100; // Default to 100KB if calculation fails
      } catch {
        // Ignore errors for individual worktrees
        return 100; // Default size estimate
      }
    });

    const sizes = await Promise.all(sizePromises);
    const totalSize = sizes.reduce((sum, size) => sum + size, 0);

    // Find oldest and newest
    const sortedByDate = worktrees.sort((a, b) => a.created.getTime() - b.created.getTime());

    const firstWorktree = sortedByDate[0];
    const lastWorktree = sortedByDate.at(-1);

    return {
      totalWorktrees: worktrees.length,
      totalDiskUsage: totalSize,
      averageSize: Math.round(totalSize / worktrees.length),
      ...(firstWorktree !== undefined ? { oldestWorktree: firstWorktree.created } : {}),
      ...(lastWorktree !== undefined ? { newestWorktree: lastWorktree.created } : {}),
    };
  }
}
