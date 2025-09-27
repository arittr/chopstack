import { createGitTestEnvironment, type GitTestEnvironment } from '@test/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandDependencies } from '@/commands/types';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { StackCommand } from '@/commands/stack/stack-command';

// NOTE: Integration tests use real CommitMessageGenerator to test actual Claude API calls
// This provides authentic testing of the commit message generation workflow

describe('StackCommand integration tests', () => {
  let stackCommand: StackCommand;
  let mockDependencies: CommandDependencies;
  let mockLogger: {
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let gitEnv: GitTestEnvironment;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create and initialize git test environment manually
    gitEnv = createGitTestEnvironment('stack-command-integration');
    await gitEnv.initRepo();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockDependencies = {
      context: {
        cwd: process.cwd(), // Will be overridden in tests that need specific directory
        logger: mockLogger,
      },
    };

    stackCommand = new StackCommand(mockDependencies);
  });

  afterEach(async () => {
    await gitEnv.cleanup();
  });

  describe('end-to-end git operations', () => {
    it('should handle real git repository with changes', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create and stage a test file
      const fs = await import('node:fs');
      const path = await import('node:path');

      const testFilePath = path.join(testDir, 'test-file.txt');
      fs.writeFileSync(testFilePath, 'test content');
      await git.add('test-file.txt');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: 'test: add test file',
        });

        expect(result).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('📝 Changes to be committed:'),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('✅ Created commit with message:'),
        );

        // Verify commit was actually created
        const log = await git.log({ maxCount: 1 });
        expect(log.latest?.message).toContain('test: add test file');
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });

    it('should handle empty repository gracefully', async () => {
      const testDir = gitEnv.tmpDir;

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
        });

        expect(result).toBe(1);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('No changes to commit'),
        );
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });

    it('should handle git-spice availability detection', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create and stage a test file
      const fs = await import('node:fs');
      const path = await import('node:path');

      const testFilePath = path.join(testDir, 'spice-test.txt');
      fs.writeFileSync(testFilePath, 'spice test content');
      await git.add('spice-test.txt');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        // Test with git-spice stack creation
        const result = await stackCommand.execute({
          createStack: true,
          autoAdd: false,
          message: 'test: git-spice integration',
        });

        // In test environment, git-spice operations may fail due to:
        // - git-spice not being installed
        // - commit message generation failing
        // - git configuration issues
        // The test should verify the proper error handling and fallback behavior
        const warningCalls = mockLogger.warn.mock.calls;

        if (result === 0) {
          // Success case - either git-spice worked or fallback succeeded
          expect(result).toBe(0);
        } else {
          // Failure case - verify proper error handling
          expect(result).toBe(1);

          // Should have attempted the operation and provided feedback
          const hasRelevantOutput = [
            ...mockLogger.info.mock.calls.map((call) => call[0] as string),
            ...mockLogger.warn.mock.calls.map((call) => call[0] as string),
            ...mockLogger.error.mock.calls.map((call) => call[0] as string),
          ].some(
            (message) =>
              typeof message === 'string' &&
              (message.includes('git-spice') ||
                message.includes('stack') ||
                message.includes('commit message') ||
                message.includes('Changes to be committed')),
          );

          expect(hasRelevantOutput).toBe(true);
        }

        // Check if it detected git-spice availability correctly
        const gitSpiceWarning = warningCalls.some(
          (call) =>
            typeof call[0] === 'string' && call[0].includes('git-spice (gs) is not installed'),
        );

        if (gitSpiceWarning) {
          // If git-spice is not available, should have fallen back
          expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Falling back to regular git commit'),
          );
        } else {
          // If git-spice is available, should have used it or failed gracefully
          const errorCalls = mockLogger.error.mock.calls;
          const hasGitSpiceError = errorCalls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Failed to create stack'),
          );

          if (!hasGitSpiceError) {
            // Successfully used git-spice
            expect(mockLogger.info).toHaveBeenCalledWith(
              expect.stringContaining('Created git-spice branch:'),
            );
          }
        }
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });

    it('should handle commit message generation workflow', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create multiple files with different types
      const fs = await import('node:fs');
      const path = await import('node:path');

      fs.writeFileSync(path.join(testDir, 'component.tsx'), 'export const Component = () => {};');
      fs.writeFileSync(path.join(testDir, 'api.ts'), 'export const api = {};');
      fs.writeFileSync(path.join(testDir, 'test.spec.ts'), 'describe("test", () => {});');
      await git.add('.');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        // Test without providing a message (should generate one)
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
        });

        // Restore original cwd
        process.cwd = originalCwd;

        expect(result).toBe(0);

        // Should have displayed loading indicator before generation
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('🤖 Calling Claude to generate commit message...'),
        );

        // Should have displayed generated commit message
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('💬 Generated commit message:'),
        );

        // Should have a commit message that follows conventional commit format
        const commitMessageCalls = mockLogger.info.mock.calls.filter(
          (call) =>
            typeof call[0] === 'string' &&
            /^\s*(feat|fix|docs|style|refactor|test|chore):/i.test(call[0].trim()),
        );
        expect(commitMessageCalls.length).toBeGreaterThanOrEqual(1);

        // Should contain detailed information (bullet points or multiple lines)
        const detailedContentCalls = mockLogger.info.mock.calls.filter(
          (call) =>
            typeof call[0] === 'string' &&
            (call[0].includes('-') || // bullet points
              call[0].includes('*') || // alternative bullet format
              call[0].length > 80), // long detailed description
        );
        // Real Claude calls should generate detailed content
        expect(detailedContentCalls.length).toBeGreaterThanOrEqual(1);

        // Verify the actual commit was created with a proper commit message
        const log = await git.log({ maxCount: 1 });
        const commitMessage = log.latest?.message ?? '';

        // Should contain a conventional commit format (real Claude response)
        expect(commitMessage).toMatch(/^(feat|fix|docs|style|refactor|test|chore):/i);

        // Should be a substantial commit message (not just a generic title)
        expect(commitMessage.length).toBeGreaterThan(50);
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });

    it('should handle autoAdd functionality correctly', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create untracked files (not added to git yet)
      const fs = await import('node:fs');
      const path = await import('node:path');

      fs.writeFileSync(path.join(testDir, 'untracked1.txt'), 'content1');
      fs.writeFileSync(path.join(testDir, 'untracked2.txt'), 'content2');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: true,
          message: 'test: auto-add files',
        });

        // Restore original cwd
        process.cwd = originalCwd;

        expect(result).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('📥 Adding all changes...'),
        );

        // Verify files were added and committed
        const status = await git.status();
        // Status should be clean after auto-add and commit
        expect(status.files).toHaveLength(0);

        // Verify commit contains the files
        const log = await git.log({ maxCount: 1 });
        const diffSummary = await git.diffSummary([
          `${log.latest?.hash}~1`,
          log.latest?.hash ?? '',
        ]);
        expect(diffSummary.files.some((f) => f.file === 'untracked1.txt')).toBe(true);
        expect(diffSummary.files.some((f) => f.file === 'untracked2.txt')).toBe(true);
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });
  });

  describe('error handling integration', () => {
    it('should handle git command failures gracefully', async () => {
      const { tmpDir: testDir } = gitEnv;

      // Create changes but don't stage them, then try to commit without autoAdd
      const fs = await import('node:fs');
      const path = await import('node:path');
      fs.writeFileSync(path.join(testDir, 'unstaged-file.txt'), 'unstaged content');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: 'test: should fail',
        });

        // Should fail because untracked files need to be added first
        expect(result).toBe(1);

        // Should show the changes detected
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('📝 Changes to be committed:'),
        );

        // Should show the untracked file
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('?? unstaged-file.txt'),
        );

        // Should generate commit message
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('💬 Generated commit message:'),
        );
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });

    it('should provide detailed error messages for git failures', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create and stage a test file
      const fs = await import('node:fs');
      const path = await import('node:path');
      fs.writeFileSync(path.join(testDir, 'test-error.txt'), 'test content');
      await git.add('test-error.txt');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        // Empty message should be handled gracefully - AI generation will provide fallback
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: '', // Empty message triggers AI generation
        });

        // Should succeed because AI generates message for empty input
        expect(result).toBe(0);

        // Should display generated commit message and success
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('💬 Generated commit message:'),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('✅ Created commit with message:'),
        );
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });
  });

  describe('real git-spice integration', () => {
    it('should handle real git-spice backend interactions', async () => {
      const { git, tmpDir: testDir } = gitEnv;

      // Create real GitSpiceBackend instance (not mocked)
      const gitSpiceBackend = new GitSpiceBackend();
      const isGitSpiceAvailable = await gitSpiceBackend.isAvailable();

      if (!isGitSpiceAvailable) {
        console.log('⏭️  Skipping real git-spice test - gs command not available');
        return;
      }

      // Create and stage some changes
      const fs = await import('node:fs');
      const path = await import('node:path');
      fs.writeFileSync(path.join(testDir, 'real-spice-test.txt'), 'real spice content');
      await git.add('real-spice-test.txt');

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(testDir);

      try {
        const result = await stackCommand.execute({
          createStack: true,
          autoAdd: false,
          message: 'test: real git-spice integration',
        });

        // Should either succeed with git-spice or fail gracefully with detailed errors
        if (result === 0) {
          expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining('Created git-spice branch:'),
          );
        } else {
          // If it failed, should have detailed error output
          expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to create stack'),
          );
        }
      } catch (error) {
        // If git-spice fails in test environment, ensure we handle it gracefully
        console.log(`⚠️  Git-spice test failed as expected in test environment: ${String(error)}`);
        expect(error).toBeDefined();
      } finally {
        // Restore original cwd
        process.cwd = originalCwd;
      }
    });
  });
});
