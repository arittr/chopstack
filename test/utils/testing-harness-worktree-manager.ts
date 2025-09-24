import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { GitWrapper } from '@/utils/git-wrapper';

import { TEST_PATHS } from '../constants/test-paths';

export type TestWorktreeOptions = {
  baseRef?: string;
  preserveOnFailure?: boolean;
  testId?: string;
};

export type TestWorktreeContext = {
  absolutePath: string;
  baseRef: string;
  cleanup: () => Promise<void>;
  testId: string;
  workspaceRoot: string;
};

/**
 * TestWorktreeManager creates isolated worktrees of the chopstack repo for testing
 * This ensures tests run against real code while maintaining isolation
 */
export class TestingHarnessWorktreeManager {
  private readonly workspaceRoot: string;
  private readonly activeWorktrees: Set<string> = new Set();

  constructor(projectRoot?: string) {
    this.workspaceRoot = path.join(projectRoot ?? process.cwd(), TEST_PATHS.TEST_WORKSPACE);
  }

  /**
   * Create an isolated test worktree from the current chopstack repo
   */
  async createTestWorktree(options: TestWorktreeOptions = {}): Promise<TestWorktreeContext> {
    const testId = options.testId ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseRef = options.baseRef ?? 'HEAD';
    const worktreePath = path.join(this.workspaceRoot, testId);

    // Ensure workspace directory exists
    await fs.mkdir(this.workspaceRoot, { recursive: true });

    // Create worktree using GitWrapper
    const git = new GitWrapper(process.cwd());

    try {
      // Try to create worktree with new branch first
      try {
        await git.createWorktree(worktreePath, baseRef, `test/${testId}`);
      } catch (error) {
        // If branch already exists, try without creating new branch
        if (error instanceof Error && error.message.includes('already exists')) {
          await git.createWorktree(worktreePath, `test/${testId}`);
        } else {
          throw error;
        }
      }
      this.activeWorktrees.add(worktreePath);

      console.log(`🧪 Created test worktree: ${testId} at ${worktreePath}`);

      const cleanup = async (): Promise<void> => {
        await this.cleanupWorktree(worktreePath, options.preserveOnFailure);
      };

      return {
        testId,
        absolutePath: worktreePath,
        baseRef,
        workspaceRoot: this.workspaceRoot,
        cleanup,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create test worktree ${testId}: ${errorMessage}`);
    }
  }

  /**
   * Clean up a specific test worktree
   */
  async cleanupWorktree(worktreePath: string, preserveOnFailure = false): Promise<boolean> {
    if (!this.activeWorktrees.has(worktreePath)) {
      console.log(`⚠️ Test worktree not tracked: ${worktreePath}`);
      return false;
    }

    try {
      // Check if we should preserve on test failure
      if (preserveOnFailure && process.env.TEST_PRESERVE_WORKTREES === 'true') {
        console.log(`🔍 Preserving test worktree for debugging: ${worktreePath}`);
        return false;
      }

      console.log(`🧹 Cleaning up test worktree: ${path.basename(worktreePath)}`);

      const git = new GitWrapper(process.cwd());
      await git.removeWorktree(worktreePath, true);

      // Also try to clean up the test branch if it exists
      const testId = path.basename(worktreePath);
      try {
        await git.git.raw(['branch', '-D', `test/${testId}`]);
      } catch {
        // Ignore errors if branch doesn't exist or can't be deleted
      }

      this.activeWorktrees.delete(worktreePath);

      // Clean up empty workspace directory if this was the last worktree
      try {
        const remaining = await fs.readdir(this.workspaceRoot);
        if (remaining.length === 0) {
          await fs.rmdir(this.workspaceRoot);
        }
      } catch {
        // Ignore cleanup errors for workspace directory
      }

      console.log(`✅ Cleaned up test worktree: ${path.basename(worktreePath)}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to cleanup test worktree ${worktreePath}: ${errorMessage}`);

      // Remove from tracking even if cleanup failed
      this.activeWorktrees.delete(worktreePath);
      return false;
    }
  }

  /**
   * Clean up all active test worktrees
   */
  async cleanupAllWorktrees(): Promise<{ failed: string[]; removed: string[] }> {
    const results = {
      removed: [] as string[],
      failed: [] as string[],
    };

    const worktreePaths = [...this.activeWorktrees];
    console.log(`🧹 Cleaning up ${worktreePaths.length} test worktrees...`);

    const cleanupPromises = worktreePaths.map(async (worktreePath) => {
      try {
        const success = await this.cleanupWorktree(worktreePath);
        return { worktreePath, success };
      } catch {
        return { worktreePath, success: false };
      }
    });

    const cleanupResults = await Promise.all(cleanupPromises);

    for (const result of cleanupResults) {
      if (result.success) {
        results.removed.push(result.worktreePath);
      } else {
        results.failed.push(result.worktreePath);
      }
    }

    console.log(
      `✅ Test cleanup complete: ${results.removed.length} removed, ${results.failed.length} failed`,
    );

    return results;
  }

  /**
   * Get the workspace root directory
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get all active test worktree paths
   */
  getActiveWorktrees(): string[] {
    return [...this.activeWorktrees];
  }

  /**
   * Initialize git-spice in a test worktree (if available)
   */
  async initializeGitSpiceInWorktree(worktreePath: string): Promise<boolean> {
    try {
      // const git = new GitWrapper(worktreePath);

      // Check if git-spice is available
      const { GitSpiceBackend } = await import('../../src/vcs/git-spice');
      const gitSpice = new GitSpiceBackend();

      if (await gitSpice.isAvailable()) {
        await gitSpice.initialize(worktreePath);
        console.log(`🌿 Initialized git-spice in test worktree: ${path.basename(worktreePath)}`);
        return true;
      }
      console.log(
        `⚠️ git-spice not available, skipping initialization in: ${path.basename(worktreePath)}`,
      );
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ Failed to initialize git-spice in test worktree: ${errorMessage}`);
      return false;
    }
  }
}

/**
 * Global test worktree manager instance
 */
export const testWorktreeManager = new TestingHarnessWorktreeManager();

/**
 * Helper function to create a test worktree with automatic cleanup
 */
export async function withTestWorktree<T>(
  testFn: (context: TestWorktreeContext) => Promise<T>,
  options: TestWorktreeOptions = {},
): Promise<T> {
  const context = await testWorktreeManager.createTestWorktree(options);

  try {
    return await testFn(context);
  } finally {
    await context.cleanup();
  }
}
