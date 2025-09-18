import { exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { VcsEngineOptions } from '../engine/vcs-engine';

import { hasContent } from '../utils/guards';

const execAsync = promisify(exec);

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
        console.log(`🔄 Reusing existing worktree for task ${taskId}: ${existing?.worktreePath}`);
        if (existing === undefined) {
          throw new Error(`Worktree context unexpectedly undefined for task ${taskId}`);
        }
        return existing;
      }

      console.log(`🌿 Creating worktree for task ${taskId}...`);
      console.log(`   Branch: ${branchName}`);
      console.log(`   Path: ${worktreePath}`);
      console.log(`   Base: ${baseRef}`);

      // Create the worktree with a new branch
      try {
        await execAsync(
          `git worktree add -b "${branchName}" "${absoluteWorktreePath}" "${baseRef}"`,
          {
            cwd: workdir,
            timeout: 30_000,
          },
        );
      } catch (error) {
        // If branch already exists, try to create worktree without -b
        try {
          await execAsync(`git worktree add "${absoluteWorktreePath}" "${branchName}"`, {
            cwd: workdir,
            timeout: 30_000,
          });
        } catch {
          throw new Error(
            `Failed to create worktree for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
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
        branchName,
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

      console.log(`✅ Created worktree for task ${taskId}`);
      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to create worktree for task ${taskId}: ${errorMessage}`);

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
      console.log(`⚠️ No worktree found for task ${taskId}`);
      return false;
    }

    try {
      console.log(`🧹 Removing worktree for task ${taskId}: ${context.worktreePath}`);

      // Extract workdir from absolute path
      const workdir = context.absolutePath.replace(`/${context.worktreePath}`, '');

      // Remove the worktree
      const forceFlag = force ? '--force' : '';
      await execAsync(`git worktree remove ${forceFlag} "${context.absolutePath}"`, {
        cwd: workdir,
        timeout: 15_000,
      });

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

      console.log(`✅ Removed worktree for task ${taskId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to remove worktree for task ${taskId}: ${errorMessage}`);

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

    console.log(`🧹 Cleaning up ${taskIds.length} worktrees...`);

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

    console.log(
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

      // Check if it's a git repository
      const { stdout: branchName } = await execAsync('git branch --show-current', {
        cwd: context.absolutePath,
        timeout: 5000,
      });

      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: context.absolutePath,
        timeout: 5000,
      });

      return {
        exists: true,
        isGitRepo: true,
        branchName: branchName.trim(),
        hasChanges: hasContent(status),
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
        const { stdout } = await execAsync(`du -sk "${worktree.absolutePath}"`, {
          timeout: 10_000,
        });
        const sizeKb = Number.parseInt(stdout.split('\t')[0] ?? '0', 10);
        return sizeKb;
      } catch {
        // Ignore errors for individual worktrees
        return 0;
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
