import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GitWrapper } from '../git-wrapper';

const execAsync = promisify(exec);

describe('GitWrapper', () => {
  let testRepo: string;
  let git: GitWrapper;

  beforeEach(async () => {
    // Create temporary test repository
    testRepo = path.join(__dirname, '../../tmp', `git-wrapper-test-${Date.now()}`);
    await fs.mkdir(testRepo, { recursive: true });

    // Initialize git repo
    await execAsync('git init', { cwd: testRepo });
    await execAsync('git config user.name "Test User"', { cwd: testRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepo });

    // Create initial commit to have a proper git repo
    await fs.writeFile(path.join(testRepo, 'README.md'), '# Test Repo\n');
    await execAsync('git add README.md', { cwd: testRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepo });

    git = new GitWrapper(testRepo);
  });

  afterEach(async () => {
    // Cleanup test repo
    try {
      await fs.rm(testRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('basic git operations', () => {
    it('should add and commit files', async () => {
      // Create a test file
      const testFile = path.join(testRepo, 'test.txt');
      await fs.writeFile(testFile, 'Test content');

      // Add file using GitWrapper
      await git.add(['test.txt']);

      // Check that file is staged
      const status = await git.status();
      expect(status.added).toContain('test.txt');

      // Commit using GitWrapper
      const commitHash = await git.commit('Add test file');

      // Verify commit hash format
      expect(commitHash).toMatch(/^[\da-f]{40}$/);

      // Verify no more changes to commit
      const hasChanges = await git.hasChangesToCommit();
      expect(hasChanges).toBe(false);
    });

    it('should get current commit hash', async () => {
      const commitHash = await git.getCurrentCommit();
      expect(commitHash).toMatch(/^[\da-f]{40}$/);
    });

    it('should detect when there are no changes to commit', async () => {
      const hasChanges = await git.hasChangesToCommit();
      expect(hasChanges).toBe(false);
    });

    it('should detect when there are changes to commit', async () => {
      // Create and stage a file
      const testFile = path.join(testRepo, 'new-file.txt');
      await fs.writeFile(testFile, 'New content');
      await git.add(['new-file.txt']);

      const hasChanges = await git.hasChangesToCommit();
      expect(hasChanges).toBe(true);
    });

    it('should handle adding multiple files', async () => {
      // Create multiple test files
      await fs.writeFile(path.join(testRepo, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(testRepo, 'file2.txt'), 'Content 2');

      // Add all files
      await git.add(['file1.txt', 'file2.txt']);

      const status = await git.status();
      expect(status.added).toContain('file1.txt');
      expect(status.added).toContain('file2.txt');
    });

    it('should add all changes with dot notation', async () => {
      // Create test files
      await fs.writeFile(path.join(testRepo, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(testRepo, 'file2.txt'), 'Content 2');

      // Add all files using dot
      await git.add('.');

      const status = await git.status();
      expect(status.added.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('worktree operations', () => {
    it('should parse worktree list output correctly', async () => {
      // Create a worktree
      const worktreePath = path.join(testRepo, '../test-worktree');
      await git.createWorktree(worktreePath, 'HEAD', 'test-branch');

      try {
        // List worktrees
        const worktrees = await git.listWorktrees();

        // Should have at least 2 worktrees (main + test-worktree)
        expect(worktrees.length).toBeGreaterThanOrEqual(2);

        // Find our test worktree
        const testWorktree = worktrees.find((wt) => wt.path.includes('test-worktree'));
        expect(testWorktree).toBeDefined();
        expect(testWorktree?.branch).toBe('test-branch');
      } finally {
        // Cleanup worktree
        try {
          await git.removeWorktree(worktreePath, true);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('error handling', () => {
    it('should throw error when committing with no changes', async () => {
      await expect(git.commit('Empty commit')).rejects.toThrow();
    });

    it('should handle invalid worktree operations gracefully', async () => {
      // Try to remove non-existent worktree
      await expect(git.removeWorktree('/non/existent/path')).rejects.toThrow();
    });
  });
});
