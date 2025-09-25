import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { TEST_PATHS } from '@test/constants/test-paths';
import {
  TestingHarnessWorktreeManager,
  type TestWorktreeContext,
  testWorktreeManager,
  withTestWorktree,
} from '@test/utils/testing-harness-worktree-manager';

import { isNonNullish } from '@/validation/guards';

describe('TestWorktreeManager', () => {
  let manager: TestingHarnessWorktreeManager;

  beforeEach(() => {
    // Create a new manager instance for each test to avoid conflicts
    manager = new TestingHarnessWorktreeManager();
  });

  afterEach(async () => {
    // Clean up any remaining worktrees after each test
    await manager.cleanupAllWorktrees();
  });

  describe('worktree creation and cleanup', () => {
    it('should create a test worktree successfully', async () => {
      const context = await manager.createTestWorktree({
        testId: 'basic-test',
      });

      // Verify worktree exists
      expect(context.testId).toBe('basic-test');
      expect(context.absolutePath).toContain(path.join(TEST_PATHS.TEST_WORKSPACE, 'basic-test'));
      expect(context.baseRef).toBe('HEAD');

      // Verify directory exists
      await expect(fs.access(context.absolutePath)).resolves.toBeUndefined();

      // Verify it's a git repository
      const gitDir = path.join(context.absolutePath, '.git');
      await expect(fs.access(gitDir)).resolves.toBeUndefined();

      // Clean up
      await context.cleanup();

      // Verify cleanup worked
      await expect(fs.access(context.absolutePath)).rejects.toThrow();
    });

    it('should generate unique test IDs when not specified', async () => {
      const context1 = await manager.createTestWorktree();
      const context2 = await manager.createTestWorktree();

      expect(context1.testId).not.toBe(context2.testId);
      expect(context1.absolutePath).not.toBe(context2.absolutePath);

      await context1.cleanup();
      await context2.cleanup();
    });

    it('should track active worktrees correctly', async () => {
      expect(manager.getActiveWorktrees()).toHaveLength(0);

      const context1 = await manager.createTestWorktree({ testId: 'test-1' });
      expect(manager.getActiveWorktrees()).toHaveLength(1);

      const context2 = await manager.createTestWorktree({ testId: 'test-2' });
      expect(manager.getActiveWorktrees()).toHaveLength(2);

      await context1.cleanup();
      expect(manager.getActiveWorktrees()).toHaveLength(1);

      await context2.cleanup();
      expect(manager.getActiveWorktrees()).toHaveLength(0);
    });

    it('should clean up all worktrees at once', async () => {
      await manager.createTestWorktree({ testId: 'bulk-test-1' });
      await manager.createTestWorktree({ testId: 'bulk-test-2' });
      await manager.createTestWorktree({ testId: 'bulk-test-3' });

      expect(manager.getActiveWorktrees()).toHaveLength(3);

      const results = await manager.cleanupAllWorktrees();

      expect(results.removed).toHaveLength(3);
      expect(results.failed).toHaveLength(0);
      expect(manager.getActiveWorktrees()).toHaveLength(0);
    });
  });

  describe('withTestWorktree helper', () => {
    it('should automatically clean up worktree after test function', async () => {
      let capturedContext: TestWorktreeContext | undefined;

      await withTestWorktree(async (context) => {
        capturedContext = context;

        // Verify worktree exists during test
        await expect(fs.access(context.absolutePath)).resolves.toBeUndefined();

        // Return some test data
        return 'test-result';
      });

      // Verify worktree was cleaned up
      if (isNonNullish(capturedContext)) {
        await expect(fs.access(capturedContext.absolutePath)).rejects.toThrow();
      }
    });

    it('should clean up even if test function throws', async () => {
      let capturedContext: TestWorktreeContext | undefined;

      try {
        await withTestWorktree((context) => {
          capturedContext = context;
          throw new Error('Test error');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      // Verify worktree was still cleaned up
      if (isNonNullish(capturedContext)) {
        await expect(fs.access(capturedContext.absolutePath)).rejects.toThrow();
      }
    });
  });

  describe('real chopstack repo integration', () => {
    it('should create worktree with actual chopstack source files', async () => {
      const context = await manager.createTestWorktree({
        testId: 'real-repo-test',
      });

      try {
        // Verify we have the real chopstack structure
        const srcDir = path.join(context.absolutePath, 'src');
        await expect(fs.access(srcDir)).resolves.toBeUndefined();

        // Verify package.json exists
        const packageJson = path.join(context.absolutePath, 'package.json');
        const contentBuffer = await fs.readFile(packageJson);
        const pkg = JSON.parse(contentBuffer.toString('utf8'));
        expect(pkg.name).toBe('chopstack');

        // Verify we have TypeScript files
        const binDir = path.join(context.absolutePath, 'src', 'bin');
        await expect(fs.access(binDir)).resolves.toBeUndefined();

        const chopstackBin = path.join(binDir, 'chopstack.ts');
        await expect(fs.access(chopstackBin)).resolves.toBeUndefined();

        // Verify we can read actual source code
        const binContent = await fs.readFile(chopstackBin, 'utf8');
        expect(binContent).toContain('import { run } from');
      } finally {
        await context.cleanup();
      }
    });

    it('should allow modifications in test worktree without affecting main repo', async () => {
      const context = await manager.createTestWorktree({
        testId: 'modification-test',
      });

      try {
        // Create a test file in the worktree
        const testFile = path.join(context.absolutePath, 'test-modification.txt');
        await fs.writeFile(testFile, 'This is a test modification');

        // Verify it exists in worktree
        await expect(fs.access(testFile)).resolves.toBeUndefined();

        // Verify it doesn't exist in main repo
        const mainRepoTestFile = path.join(process.cwd(), 'test-modification.txt');
        await expect(fs.access(mainRepoTestFile)).rejects.toThrow();

        // Clean up the test file in worktree
        await fs.unlink(testFile);
      } finally {
        await context.cleanup();
      }
    });
  });

  describe('global instance', () => {
    it('should have a global testWorktreeManager instance', () => {
      expect(testWorktreeManager).toBeInstanceOf(TestingHarnessWorktreeManager);
      expect(typeof testWorktreeManager.createTestWorktree).toBe('function');
    });
  });
});
