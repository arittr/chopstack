import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { isNonNullish } from '@/validation/guards';

import type { GitTestEnvironment } from './git-test-environment';

type TrackedResource = {
  identifier: string;
  metadata?: {
    environment?: GitTestEnvironment;
    path?: string;
    repoPath?: string;
  };
  type: 'branch' | 'worktree' | 'directory' | 'environment';
};

/**
 * TestResourceTracker is a singleton that tracks all test resources
 * created during test runs and ensures they are cleaned up.
 */
class TestResourceTracker {
  private static _instance: TestResourceTracker;
  private readonly _resources: Map<string, TrackedResource> = new Map();
  private _isCleanupRegistered = false;
  private readonly _projectRoot: string;

  private constructor() {
    // Find the project root (where .git directory is)
    this._projectRoot = this.findProjectRoot();
    this.registerGlobalCleanup();
  }

  static getInstance(): TestResourceTracker {
    // Singleton pattern - instance is created on first access
    if (!isNonNullish(TestResourceTracker._instance)) {
      TestResourceTracker._instance = new TestResourceTracker();
    }
    return TestResourceTracker._instance;
  }

  private findProjectRoot(): string {
    let currentDir = process.cwd();
    while (currentDir !== '/') {
      if (existsSync(join(currentDir, '.git'))) {
        return currentDir;
      }
      currentDir = join(currentDir, '..');
    }
    return process.cwd(); // Fallback to current directory
  }

  /**
   * Registers cleanup handlers for process exit and test runner hooks.
   */
  private registerGlobalCleanup(): void {
    if (this._isCleanupRegistered) {
      return;
    }

    // Clean up on process exit
    process.on('exit', () => {
      void this.cleanupAll();
    });

    // Clean up on uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      void this.cleanupAll();
    });

    // Clean up on unhandled rejections
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      void this.cleanupAll();
    });

    this._isCleanupRegistered = true;
  }

  /**
   * Tracks a Git branch for cleanup.
   */
  trackBranch(branchName: string, repoPath?: string): void {
    const key = `branch:${branchName}:${repoPath ?? this._projectRoot}`;
    this._resources.set(key, {
      type: 'branch',
      identifier: branchName,
      metadata: { repoPath: repoPath ?? this._projectRoot },
    });
  }

  /**
   * Tracks a Git worktree for cleanup.
   */
  trackWorktree(branchName: string, worktreePath: string, repoPath?: string): void {
    const key = `worktree:${branchName}:${worktreePath}`;
    this._resources.set(key, {
      type: 'worktree',
      identifier: branchName,
      metadata: {
        path: worktreePath,
        repoPath: repoPath ?? this._projectRoot,
      },
    });
  }

  /**
   * Tracks a directory for cleanup.
   */
  trackDirectory(dirPath: string): void {
    const key = `directory:${dirPath}`;
    this._resources.set(key, {
      type: 'directory',
      identifier: dirPath,
      metadata: { path: dirPath },
    });
  }

  /**
   * Tracks a GitTestEnvironment for cleanup.
   */
  trackEnvironment(env: GitTestEnvironment): void {
    const key = `environment:${env.tmpDir}`;
    this._resources.set(key, {
      type: 'environment',
      identifier: env.tmpDir,
      metadata: { environment: env },
    });
  }

  /**
   * Removes a resource from tracking (after successful cleanup).
   */
  untrack(key: string): void {
    this._resources.delete(key);
  }

  /**
   * Cleans up a specific resource.
   */
  private async cleanupResource(resource: TrackedResource): Promise<void> {
    try {
      switch (resource.type) {
        case 'environment': {
          if (isNonNullish(resource.metadata?.environment)) {
            await resource.metadata.environment.cleanup();
          }
          break;
        }

        case 'worktree': {
          const path = resource.metadata?.path;
          const repoPath = resource.metadata?.repoPath;
          if (isNonNullish(path) && isNonNullish(repoPath)) {
            try {
              execSync(`git worktree remove "${path}" --force`, {
                cwd: repoPath,
                encoding: 'utf8',
              });
            } catch {
              // If git command fails, try manual removal
              if (existsSync(path)) {
                rmSync(path, { recursive: true, force: true });
              }
            }
          }
          break;
        }

        case 'branch': {
          const repoPath = resource.metadata?.repoPath;
          if (isNonNullish(repoPath)) {
            try {
              // Don't delete main/master branches
              if (!['main', 'master'].includes(resource.identifier)) {
                execSync(`git branch -D "${resource.identifier}"`, {
                  cwd: repoPath,
                  encoding: 'utf8',
                });
              }
            } catch {
              // Ignore branch deletion errors
            }
          }
          break;
        }

        case 'directory': {
          const dirPath = resource.metadata?.path;
          if (isNonNullish(dirPath) && existsSync(dirPath)) {
            rmSync(dirPath, { recursive: true, force: true });
          }
          break;
        }
      }
    } catch (error) {
      // Log but don't throw - cleanup should be best effort
      console.warn(`Warning: Failed to cleanup ${resource.type} ${resource.identifier}:`, error);
    }
  }

  /**
   * Cleans up all tracked resources.
   */
  async cleanupAll(): Promise<void> {
    // Clean up in order: environments first (they handle their own worktrees/branches),
    // then worktrees, then branches, then directories
    const sortedResources = [...this._resources.values()].sort((a, b) => {
      const order = { environment: 0, worktree: 1, branch: 2, directory: 3 };
      return order[a.type] - order[b.type];
    });

    for (const resource of sortedResources) {
      await this.cleanupResource(resource);
    }

    this._resources.clear();
  }

  /**
   * Performs a scan and cleanup of orphaned test resources.
   * This is useful for cleaning up resources from previous test runs.
   */
  cleanupOrphanedResources(): void {
    console.log('🧹 Scanning for orphaned test resources...');

    // Clean up orphaned test branches
    try {
      const branches = execSync('git branch', {
        cwd: this._projectRoot,
        encoding: 'utf8',
      });

      const testBranches = branches
        .split('\n')
        .map((b) => b.trim().replace('* ', ''))
        .filter((b) => b.startsWith('test/') || b.startsWith('worktree-task-'));

      for (const branch of testBranches) {
        try {
          console.log(`  Removing orphaned branch: ${branch}`);
          execSync(`git branch -D "${branch}"`, {
            cwd: this._projectRoot,
            encoding: 'utf8',
          });
        } catch {
          // Ignore individual branch cleanup errors
        }
      }
    } catch {
      // Ignore if git branch fails
    }

    // Clean up orphaned worktrees
    try {
      const worktrees = execSync('git worktree list --porcelain', {
        cwd: this._projectRoot,
        encoding: 'utf8',
      });

      const testWorktrees = worktrees
        .split('\n\n')
        .filter((block) => block.includes('/test/tmp/') || block.includes('worktree-task-'))
        .map((block) => {
          const pathMatch = block.match(/^worktree (.+)$/m);
          return isNonNullish(pathMatch) ? pathMatch[1] : null;
        })
        .filter((p): p is string => typeof p === 'string' && p.length > 0);

      for (const worktreePath of testWorktrees) {
        // Type guard ensures worktreePath is string due to filter above
        if (worktreePath !== this._projectRoot) {
          try {
            console.log(`  Removing orphaned worktree: ${worktreePath}`);
            execSync(`git worktree remove "${worktreePath}" --force`, {
              cwd: this._projectRoot,
              encoding: 'utf8',
            });
          } catch {
            // Try manual removal if git command fails
            if (existsSync(worktreePath)) {
              rmSync(worktreePath, { recursive: true, force: true });
            }
          }
        }
      }
    } catch {
      // Ignore if git worktree list fails
    }

    // Clean up test/tmp directory
    const testTmpDir = join(this._projectRoot, 'test', 'tmp');
    if (existsSync(testTmpDir)) {
      try {
        console.log('  Cleaning test/tmp directory...');
        rmSync(testTmpDir, { recursive: true, force: true });
      } catch {
        // Ignore if cleanup fails
      }
    }

    console.log('✅ Orphaned resource cleanup complete');
  }

  /**
   * Gets statistics about tracked resources.
   */
  getStats(): { branches: number; directories: number; environments: number; worktrees: number } {
    let branches = 0;
    let worktrees = 0;
    let directories = 0;
    let environments = 0;

    for (const resource of this._resources.values()) {
      switch (resource.type) {
        case 'branch': {
          branches++;
          break;
        }
        case 'worktree': {
          worktrees++;
          break;
        }
        case 'directory': {
          directories++;
          break;
        }
        case 'environment': {
          environments++;
          break;
        }
      }
    }

    return { branches, worktrees, directories, environments };
  }
}

// Export singleton instance
export const testResourceTracker = TestResourceTracker.getInstance();

/**
 * Utility function to clean up orphaned resources before tests start.
 * Call this in global setup or at the beginning of test suites.
 */
export function cleanupOrphanedTestResources(): void {
  testResourceTracker.cleanupOrphanedResources();
}

/**
 * Utility function to ensure all resources are cleaned up.
 * Call this in global teardown or afterAll hooks.
 */
export async function ensureAllResourcesCleanedUp(): Promise<void> {
  await testResourceTracker.cleanupAll();
}
