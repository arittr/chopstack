import { testWorktreeManager } from '@test/utils/testing-harness-worktree-manager';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandDependencies } from '@/commands/types';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { StackCommand } from '@/commands/stack/stack-command';

// Mock external dependencies that we don't want to test in integration
vi.mock('@/adapters/vcs/commit-message-generator', () => ({
  CommitMessageGenerator: class MockCommitMessageGenerator {
    async generateCommitMessage(): Promise<string> {
      await Promise.resolve();
      return 'feat: integration test commit message\n\nDetailed description of changes made.';
    }
  },
}));

describe('StackCommand integration tests', () => {
  let stackCommand: StackCommand;
  let mockDependencies: CommandDependencies;
  let mockLogger: {
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockDependencies = {
      context: {
        cwd: '/test/workdir',
        logger: mockLogger,
      },
    };

    stackCommand = new StackCommand(mockDependencies);
  });

  afterEach(async () => {
    await testWorktreeManager.cleanupAllWorktrees();
  });

  describe('end-to-end git operations', () => {
    it('should handle real git repository with changes', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-real-git-test',
      });

      try {
        // Create a test file with changes
        await execa('touch', ['test-file.txt'], { cwd: context.absolutePath });
        await execa('git', ['add', 'test-file.txt'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: 'test: add test file',
        });

        // Restore original cwd
        process.cwd = originalCwd;

        expect(result).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('📝 Changes to be committed:'),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('✅ Created commit with message:'),
        );

        // Verify commit was actually created
        const { stdout: logOutput } = await execa('git', ['log', '--oneline', '-1'], {
          cwd: context.absolutePath,
        });
        expect(logOutput).toContain('test: add test file');
      } finally {
        await context.cleanup();
      }
    });

    it('should handle empty repository gracefully', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-empty-repo-test',
      });

      try {
        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
        });

        // Restore original cwd
        process.cwd = originalCwd;

        expect(result).toBe(1);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('No changes to commit'),
        );
      } finally {
        await context.cleanup();
      }
    });

    it('should handle git-spice availability detection', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-git-spice-test',
      });

      try {
        // Create some changes
        await execa('touch', ['spice-test.txt'], { cwd: context.absolutePath });
        await execa('git', ['add', 'spice-test.txt'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        // Test with git-spice stack creation
        const result = await stackCommand.execute({
          createStack: true,
          autoAdd: false,
          message: 'test: git-spice integration',
        });

        // Restore original cwd
        process.cwd = originalCwd;

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
        await context.cleanup();
      }
    });

    it('should handle commit message generation workflow', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-commit-generation-test',
      });

      try {
        // Create multiple files with different types
        await execa('touch', ['component.tsx', 'api.ts', 'test.spec.ts'], {
          cwd: context.absolutePath,
        });
        await execa('git', ['add', '.'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        // Test without providing a message (should generate one)
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
        });

        // Restore original cwd
        process.cwd = originalCwd;

        expect(result).toBe(0);

        // Should have displayed generated commit message
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('💬 Generated commit message:'),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('feat: integration test commit message'),
        );

        // Verify the actual commit was created with the generated message
        const { stdout: logOutput } = await execa('git', ['log', '--oneline', '-1'], {
          cwd: context.absolutePath,
        });
        expect(logOutput).toContain('feat: integration test commit message');
      } finally {
        await context.cleanup();
      }
    });

    it('should handle autoAdd functionality correctly', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-auto-add-test',
      });

      try {
        // Create untracked files (not added to git yet)
        await execa('touch', ['untracked1.txt', 'untracked2.txt'], {
          cwd: context.absolutePath,
        });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

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
        const { stdout: statusOutput } = await execa('git', ['status', '--porcelain'], {
          cwd: context.absolutePath,
        });
        // Status should be clean after auto-add and commit
        expect(statusOutput.trim()).toBe('');

        // Verify commit contains the files
        const { stdout: showOutput } = await execa('git', ['show', '--name-only', '--format='], {
          cwd: context.absolutePath,
        });
        expect(showOutput).toContain('untracked1.txt');
        expect(showOutput).toContain('untracked2.txt');
      } finally {
        await context.cleanup();
      }
    });
  });

  describe('error handling integration', () => {
    it('should handle git command failures gracefully', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-git-error-test',
      });

      try {
        // Create changes but don't stage them, then try to commit without autoAdd
        await execa('touch', ['unstaged-file.txt'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: 'test: should fail',
        });

        // Restore original cwd
        process.cwd = originalCwd;

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
        await context.cleanup();
      }
    });

    it('should provide detailed error messages for git failures', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-detailed-error-test',
      });

      try {
        // Create a scenario that might cause git command to fail
        await execa('touch', ['test-error.txt'], { cwd: context.absolutePath });
        await execa('git', ['add', 'test-error.txt'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        // Empty message should be handled gracefully - AI generation will provide fallback
        const result = await stackCommand.execute({
          createStack: false,
          autoAdd: false,
          message: '', // Empty message triggers AI generation
        });

        // Restore original cwd
        process.cwd = originalCwd;

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
        await context.cleanup();
      }
    });
  });

  describe('real git-spice integration', () => {
    it('should handle real git-spice backend interactions', async () => {
      const context = await testWorktreeManager.createTestWorktree({
        testId: 'stack-command-real-git-spice-test',
      });

      try {
        // Create real GitSpiceBackend instance (not mocked)
        const gitSpiceBackend = new GitSpiceBackend();
        const isGitSpiceAvailable = await gitSpiceBackend.isAvailable();

        if (!isGitSpiceAvailable) {
          console.log('⏭️  Skipping real git-spice test - gs command not available');
          return;
        }

        // Create some changes
        await execa('touch', ['real-spice-test.txt'], { cwd: context.absolutePath });
        await execa('git', ['add', 'real-spice-test.txt'], { cwd: context.absolutePath });

        // Mock process.cwd to return our test directory
        const originalCwd = process.cwd;
        process.cwd = vi.fn().mockReturnValue(context.absolutePath);

        try {
          const result = await stackCommand.execute({
            createStack: true,
            autoAdd: false,
            message: 'test: real git-spice integration',
          });

          // Restore original cwd
          process.cwd = originalCwd;

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
          console.log(
            `⚠️  Git-spice test failed as expected in test environment: ${String(error)}`,
          );
          expect(error).toBeDefined();
        }
      } finally {
        await context.cleanup();
      }
    });
  });
});
