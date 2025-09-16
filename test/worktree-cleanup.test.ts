import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { TaskOrchestrator } from '../src/mcp/orchestrator';

describe('Worktree Cleanup Tests', () => {
  const testTaskId = 'test-cleanup-task';
  const worktreePath = path.join('.chopstack-shadows', testTaskId);
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    orchestrator = new TaskOrchestrator();

    // Clean up any existing test artifacts
    const testTaskIds = ['test-cleanup-task', 'test-task-1', 'test-task-2', 'non-existent-task'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack-shadows', taskId);
      const branchName = `chopstack/${taskId}`;

      try {
        // Remove worktree first
        if (existsSync(testPath)) {
          execSync(`git worktree remove ${testPath} --force`, { stdio: 'ignore' });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        // Remove branch
        execSync(`git branch -D ${branchName}`, { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors if branch doesn't exist
      }
    }
  });

  afterEach(() => {
    // Clean up test artifacts
    const testTaskIds = ['test-cleanup-task', 'test-task-1', 'test-task-2', 'non-existent-task'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack-shadows', taskId);
      const branchName = `chopstack/${taskId}`;

      try {
        // Remove worktree first
        if (existsSync(testPath)) {
          execSync(`git worktree remove ${testPath} --force`, { stdio: 'ignore' });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        // Remove branch
        execSync(`git branch -D ${branchName}`, { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors if branch doesn't exist
      }
    }
  });

  test('creates worktree successfully', async () => {
    const baseRef = 'HEAD';
    const actualWorktreePath = await orchestrator.createWorktreeForTask(testTaskId, baseRef);

    // Verify worktree was created
    expect(existsSync(actualWorktreePath)).toBe(true);
    expect(actualWorktreePath).toBe(worktreePath);

    // Verify git recognizes the worktree
    const worktreeList = execSync('git worktree list --porcelain', { encoding: 'utf8' });
    expect(worktreeList).toContain(worktreePath);
    expect(worktreeList).toContain(`chopstack/${testTaskId}`);
  });

  test('cleans up worktree completely', async () => {
    // Create worktree
    const baseRef = 'HEAD';
    await orchestrator.createWorktreeForTask(testTaskId, baseRef);
    expect(existsSync(worktreePath)).toBe(true);

    // Clean up worktree
    await orchestrator.cleanupWorktree(testTaskId);

    // Verify worktree was removed from filesystem
    expect(existsSync(worktreePath)).toBe(false);

    // Verify git no longer tracks the worktree
    const worktreeList = execSync('git worktree list --porcelain', { encoding: 'utf8' });
    expect(worktreeList).not.toContain(worktreePath);
    expect(worktreeList).not.toContain(`chopstack/${testTaskId}`);
  });

  test('handles cleanup of non-existent worktree gracefully', async () => {
    // Try to clean up a worktree that doesn't exist
    await expect(orchestrator.cleanupWorktree('non-existent-task')).resolves.not.toThrow();
  });

  test('cleans up multiple worktrees', async () => {
    const taskIds = ['test-task-1', 'test-task-2'];
    const baseRef = 'HEAD';

    // Create multiple worktrees
    await Promise.all(
      taskIds.map(async (taskId) => orchestrator.createWorktreeForTask(taskId, baseRef)),
    );

    // Verify both were created
    for (const taskId of taskIds) {
      const taskWorktreePath = path.join('.chopstack-shadows', taskId);
      expect(existsSync(taskWorktreePath)).toBe(true);
    }

    // Clean up all worktrees
    await Promise.all(taskIds.map(async (taskId) => orchestrator.cleanupWorktree(taskId)));

    // Verify all were removed
    for (const taskId of taskIds) {
      const taskWorktreePath = path.join('.chopstack-shadows', taskId);
      expect(existsSync(taskWorktreePath)).toBe(false);
    }

    // Verify git doesn't track any of them
    const worktreeList = execSync('git worktree list --porcelain', { encoding: 'utf8' });
    for (const taskId of taskIds) {
      expect(worktreeList).not.toContain(taskId);
    }
  });

  test('handles cleanup failure gracefully', async () => {
    // Test that cleanup handles non-existent worktree gracefully (this is a real failure case)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    // Attempt cleanup of non-existent worktree - should handle the error gracefully
    await expect(orchestrator.cleanupWorktree('definitely-non-existent')).resolves.not.toThrow();

    // Verify error was logged - the main requirement is that it doesn't crash
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]![0]).toBe(
      'Failed to cleanup worktree for definitely-non-existent:',
    );
    // Just verify there's a second argument (the error) - type checking is less important
    expect(consoleSpy.mock.calls[0]!).toHaveLength(2);

    consoleSpy.mockRestore();
  });
});
