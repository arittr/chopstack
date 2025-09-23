import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GitWrapper } from '@/utils/git-wrapper';
import { GitSpiceBackend } from '@/vcs/git-spice';

const execAsync = promisify(exec);

describe('GitSpice GitWrapper Integration', () => {
  let testRepo: string;
  let gitSpice: GitSpiceBackend;
  let git: GitWrapper;

  beforeEach(async () => {
    // Create temporary test repository
    testRepo = path.join(__dirname, '../tmp', `git-spice-integration-${Date.now()}`);
    await fs.mkdir(testRepo, { recursive: true });

    // Initialize git repo
    await execAsync('git init', { cwd: testRepo });
    await execAsync('git config user.name "Test User"', { cwd: testRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepo });

    // Create initial commit
    await fs.writeFile(path.join(testRepo, 'README.md'), '# Test Repo\n');
    await execAsync('git add README.md', { cwd: testRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepo });

    gitSpice = new GitSpiceBackend();
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

  describe('git operations integration', () => {
    it('should use GitWrapper for checkout operations', async () => {
      // Create a test branch
      await git.createBranch('test-branch');

      // Verify we're on the test branch
      const currentBranch = await git.git.revparse(['--abbrev-ref', 'HEAD']);
      expect(currentBranch).toBe('test-branch');

      // Switch back to main
      await git.checkout('main');
      const backToMain = await git.git.revparse(['--abbrev-ref', 'HEAD']);
      expect(backToMain).toBe('main');
    });

    it('should use GitWrapper for cherry-pick operations', async () => {
      // Create a commit on a branch
      await git.createBranch('feature-branch');
      await fs.writeFile(path.join(testRepo, 'feature.txt'), 'Feature content');
      await git.add(['feature.txt']);
      const commitHash = await git.commit('Add feature');

      // Switch back to main
      await git.checkout('main');

      // Cherry-pick using GitWrapper
      await git.cherryPick(commitHash);

      // Verify the file exists on main
      const featureFile = path.join(testRepo, 'feature.txt');
      const content = await fs.readFile(featureFile, 'utf8');
      expect(content).toBe('Feature content');
    });

    it('should use GitWrapper for worktree operations', async () => {
      // Create a worktree using GitWrapper
      const worktreePath = path.join(testRepo, '../test-worktree');
      await git.createWorktree(worktreePath, 'HEAD', 'worktree-branch');

      try {
        // List worktrees
        const worktrees = await git.listWorktrees();

        // Should have main repo + test worktree
        expect(worktrees.length).toBeGreaterThanOrEqual(2);

        // Find our test worktree
        const testWorktree = worktrees.find((wt) => wt.path.includes('test-worktree'));
        expect(testWorktree).toBeDefined();
        expect(testWorktree?.branch).toBe('worktree-branch');

        // Verify worktree directory exists
        await expect(fs.access(worktreePath)).resolves.toBeUndefined();
      } finally {
        // Cleanup worktree
        try {
          await git.removeWorktree(worktreePath, true);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should use GitWrapper for branch detection', async () => {
      // Create a commit
      await fs.writeFile(path.join(testRepo, 'test.txt'), 'Test content');
      await git.add(['test.txt']);
      const commitHash = await git.commit('Test commit');

      // Get branches containing the commit
      const branches = await git.getBranchesContaining(commitHash);

      // Should contain main branch
      expect(branches).toContain('main');
    });
  });

  describe('git-spice backend integration', () => {
    it('should check git-spice availability', async () => {
      const isAvailable = await gitSpice.isAvailable();
      // This might be true or false depending on environment
      expect(typeof isAvailable).toBe('boolean');
    });

    it.skip('should initialize git-spice using GitWrapper (requires git-spice)', async () => {
      // Skip if git-spice not available
      const isAvailable = await gitSpice.isAvailable();
      if (!isAvailable) {
        return;
      }

      // This should not throw an error
      await expect(gitSpice.initialize(testRepo)).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle GitWrapper errors gracefully', async () => {
      // Try to checkout non-existent branch
      await expect(git.checkout('non-existent-branch')).rejects.toThrow();
    });

    it('should handle cherry-pick conflicts', async () => {
      // Create conflicting changes
      await fs.writeFile(path.join(testRepo, 'conflict.txt'), 'Original content');
      await git.add(['conflict.txt']);
      await git.commit('Add conflict file');

      // Create a branch and modify the same file
      await git.createBranch('conflict-branch');
      await fs.writeFile(path.join(testRepo, 'conflict.txt'), 'Branch content');
      await git.add(['conflict.txt']);
      const branchCommit = await git.commit('Modify conflict file in branch');

      // Switch back to main and modify the same file differently
      await git.checkout('main');
      await fs.writeFile(path.join(testRepo, 'conflict.txt'), 'Main content');
      await git.add(['conflict.txt']);
      await git.commit('Modify conflict file in main');

      // Try to cherry-pick - should fail with conflict
      await expect(git.cherryPick(branchCommit)).rejects.toThrow();
    });
  });
});
