import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import simpleGit, { type SimpleGit } from 'simple-git';

/**
 * Manages test directories with proper cleanup and isolation
 */
export class TestDirectoryManager {
  private static readonly activeDirectories = new Set<string>();
  private static readonly TEST_DIR_PREFIX = 'chopstack-test-';

  /**
   * Create a unique test directory
   */
  static createTestDirectory(prefix = 'test'): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const dirName = `${this.TEST_DIR_PREFIX}${prefix}-${timestamp}-${random}`;
    const testDir = path.join(os.tmpdir(), dirName);

    // Ensure directory doesn't exist
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Create the directory
    fs.mkdirSync(testDir, { recursive: true });

    // Track it for cleanup
    this.activeDirectories.add(testDir);

    return testDir;
  }

  /**
   * Clean up a specific test directory
   */
  static async cleanupTestDirectory(testDir: string): Promise<void> {
    if (testDir === '' || !fs.existsSync(testDir)) {
      this.activeDirectories.delete(testDir);
      return;
    }

    try {
      // If it's a git repository, clean up worktrees first
      if (fs.existsSync(path.join(testDir, '.git'))) {
        await this.cleanupGitWorktrees(testDir);
      }

      // Remove the directory
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test directory ${testDir}:`, error);
    } finally {
      this.activeDirectories.delete(testDir);
    }
  }

  /**
   * Clean up git worktrees in a repository
   */
  private static async cleanupGitWorktrees(repoPath: string): Promise<void> {
    try {
      const git: SimpleGit = simpleGit(repoPath);

      // Get list of worktrees
      const worktrees = await git.raw(['worktree', 'list', '--porcelain']);
      const worktreePaths = worktrees
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length))
        .filter((path) => path !== repoPath); // Don't remove main worktree

      // Remove each worktree
      for (const worktreePath of worktreePaths) {
        try {
          await git.raw(['worktree', 'remove', worktreePath, '--force']);
        } catch {
          // Ignore individual worktree removal failures
        }
      }

      // Clean up test branches
      try {
        const branches = await git.branch();
        const testBranches = branches.all.filter(
          (b) => b.startsWith('chopstack/') || b.startsWith('tmp-chopstack/'),
        );
        for (const branch of testBranches) {
          try {
            await git.deleteLocalBranch(branch, true);
          } catch {
            // Ignore branch deletion errors
          }
        }
      } catch {
        // Ignore branch listing errors
      }
    } catch {
      // Silently ignore git errors - repo might be corrupted
    }
  }

  /**
   * Clean up all active test directories (for global cleanup)
   */
  static async cleanupAllTestDirectories(): Promise<void> {
    const directories = [...this.activeDirectories];
    await Promise.all(directories.map(async (dir) => this.cleanupTestDirectory(dir)));
  }

  /**
   * Clean up old test directories from previous runs
   */
  static async cleanupOrphanedTestDirectories(): Promise<void> {
    try {
      const tmpDir = os.tmpdir();
      const entries = fs.readdirSync(tmpDir);
      const testDirs = entries.filter((e) => e.startsWith(this.TEST_DIR_PREFIX));

      // Only clean up directories older than 1 hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const dir of testDirs) {
        const fullPath = path.join(tmpDir, dir);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.mtimeMs < oneHourAgo) {
            await this.cleanupTestDirectory(fullPath);
          }
        } catch {
          // Ignore stat errors
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Initialize a git repository in a test directory
   */
  static async initializeGitRepo(testDir: string): Promise<SimpleGit> {
    const git = simpleGit(testDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('init.defaultBranch', 'main');

    // Create initial commit
    const readmePath = path.join(testDir, 'README.md');
    fs.writeFileSync(readmePath, '# Test Project\n');
    await git.add('.');
    await git.commit('Initial commit');

    return git;
  }
}
