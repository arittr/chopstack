import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { simpleGit, type SimpleGit } from 'simple-git';

import { isNonNullish } from '@/validation/guards';

/**
 * GitTestEnvironment provides isolated test environments for Git operations.
 * Each instance creates a unique temporary directory and Git repository
 * that is automatically cleaned up.
 */
export class GitTestEnvironment {
  private _tmpDir: string | null = null;
  private _git: SimpleGit | null = null;
  private readonly _createdBranches: Set<string> = new Set();
  private readonly _createdWorktrees: Map<string, string> = new Map(); // branch -> path
  private readonly _originalCwd: string;
  private _isCleanedUp = false;

  constructor(private readonly testName: string) {
    this._originalCwd = process.cwd();
  }

  /**
   * Gets the temporary directory for this test environment.
   * Creates it if it doesn't exist yet.
   */
  get tmpDir(): string {
    if (!isNonNullish(this._tmpDir)) {
      const prefix = `chopstack-test-${this.testName}-`;
      this._tmpDir = mkdtempSync(join(tmpdir(), prefix));
    }
    return this._tmpDir;
  }

  /**
   * Gets a SimpleGit instance for the test repository.
   * Initializes the repository if needed.
   */
  get git(): SimpleGit {
    if (!isNonNullish(this._git)) {
      this._git = simpleGit(this.tmpDir);
    }
    return this._git;
  }

  /**
   * Initializes a new Git repository in the test directory.
   * Sets up initial commit and configuration.
   */
  async initRepo(options?: { bare?: boolean }): Promise<void> {
    await (options?.bare === true ? this.git.init(true) : this.git.init());
    await this.git.addConfig('user.email', 'test@example.com');
    await this.git.addConfig('user.name', 'Test User');

    if (options?.bare !== true) {
      // Create initial commit
      const readmePath = join(this.tmpDir, 'README.md');
      writeFileSync(readmePath, '# Test Repository\n');
      await this.git.add('README.md');
      await this.git.commit('Initial commit');
    }
  }

  /**
   * Creates a test branch and tracks it for cleanup.
   */
  async createBranch(branchName: string, checkout = false): Promise<void> {
    await (checkout ? this.git.checkoutBranch(branchName, 'HEAD') : this.git.branch([branchName]));
    this._createdBranches.add(branchName);
  }

  /**
   * Creates a worktree and tracks it for cleanup.
   */
  createWorktree(branchName: string, worktreePath?: string): string {
    if (!isNonNullish(this._tmpDir)) {
      throw new Error('Repository not initialized. Call initRepo() first.');
    }

    const path = worktreePath ?? join(this.tmpDir, `worktree-${branchName}`);

    // Create the worktree
    execSync(`git worktree add "${path}" -b "${branchName}"`, {
      cwd: this.tmpDir,
      encoding: 'utf8',
    });

    this._createdWorktrees.set(branchName, path);
    this._createdBranches.add(branchName);

    return path;
  }

  /**
   * Creates a test file in the repository.
   */
  createFile(relativePath: string, content: string): void {
    const fullPath = join(this.tmpDir, relativePath);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, content);
  }

  /**
   * Executes a command in the test directory.
   */
  exec(command: string): string {
    if (!isNonNullish(this._tmpDir)) {
      throw new Error('Repository not initialized. Call initRepo() first.');
    }

    try {
      const result = execSync(command, {
        cwd: this.tmpDir,
        encoding: 'utf8',
      });

      if (!isNonNullish(result)) {
        return '';
      }

      return result.trim();
    } catch (error) {
      throw new Error(`Command failed: ${command}. Error: ${String(error)}`);
    }
  }

  /**
   * Gets a unique identifier for this test environment.
   */
  getUniqueId(): string {
    return randomBytes(4).toString('hex');
  }

  /**
   * Cleans up all created resources.
   * Safe to call multiple times.
   */
  async cleanup(): Promise<void> {
    if (this._isCleanedUp) {
      return;
    }

    try {
      // First, clean up worktrees
      for (const [_branch, path] of this._createdWorktrees) {
        try {
          if (existsSync(path)) {
            // Remove the worktree properly through git
            execSync(`git worktree remove "${path}" --force`, {
              cwd: this.tmpDir,
              encoding: 'utf8',
            });
          }
        } catch {
          // If git worktree remove fails, try manual cleanup
          try {
            if (existsSync(path)) {
              rmSync(path, { recursive: true, force: true });
            }
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      // Clean up any remaining worktrees not in our tracking
      try {
        const worktrees = execSync('git worktree list --porcelain', {
          cwd: this.tmpDir,
          encoding: 'utf8',
        });

        const worktreePaths = worktrees
          .split('\n')
          .filter((line) => line.startsWith('worktree '))
          .map((line) => line.slice(9))
          .filter((path) => path !== this.tmpDir); // Don't remove main worktree

        for (const path of worktreePaths) {
          try {
            execSync(`git worktree remove "${path}" --force`, {
              cwd: this.tmpDir,
              encoding: 'utf8',
            });
          } catch {
            // Ignore individual worktree cleanup errors
          }
        }
      } catch {
        // Ignore if git worktree list fails
      }

      // Clean up branches (except main/master)
      for (const branch of this._createdBranches) {
        try {
          if (!['main', 'master'].includes(branch)) {
            await this.git.branch(['-D', branch]);
          }
        } catch {
          // Ignore branch deletion errors
        }
      }

      // Finally, remove the entire test directory
      if (isNonNullish(this._tmpDir) && existsSync(this._tmpDir)) {
        rmSync(this._tmpDir, { recursive: true, force: true });
      }

      this._isCleanedUp = true;
    } catch (error) {
      // Log but don't throw - cleanup should be best effort
      console.warn(`Warning: Cleanup failed for ${this.testName}:`, error);
    }
  }

  /**
   * Ensures cleanup happens even if not called explicitly.
   * Note: This is a safety net - tests should call cleanup() explicitly.
   */
  async ensureCleanup(): Promise<void> {
    if (!this._isCleanedUp) {
      await this.cleanup();
    }
  }
}

/**
 * Creates a new GitTestEnvironment and ensures it gets cleaned up.
 * Use this in beforeEach/afterEach hooks.
 */
export function createGitTestEnvironment(testName: string): GitTestEnvironment {
  return new GitTestEnvironment(testName);
}
