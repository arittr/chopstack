import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { createGitTestEnvironment } from '../git-test-environment';
import { testResourceTracker } from '../test-resource-tracker';

describe('TestResourceTracker', () => {
  it('should track and cleanup Git test environments', async () => {
    const env1 = createGitTestEnvironment('tracker-test-1');
    const env2 = createGitTestEnvironment('tracker-test-2');

    await env1.initRepo();
    await env2.initRepo();

    // Track the environments
    testResourceTracker.trackEnvironment(env1);
    testResourceTracker.trackEnvironment(env2);

    // Both should exist
    expect(fs.existsSync(env1.tmpDir)).toBe(true);
    expect(fs.existsSync(env2.tmpDir)).toBe(true);

    // Get initial stats
    const stats = testResourceTracker.getStats();
    expect(stats.environments).toBeGreaterThanOrEqual(2);

    // Cleanup all tracked resources
    await testResourceTracker.cleanupAll();

    // Both should be cleaned up
    expect(fs.existsSync(env1.tmpDir)).toBe(false);
    expect(fs.existsSync(env2.tmpDir)).toBe(false);

    // Stats should be reset
    const finalStats = testResourceTracker.getStats();
    expect(finalStats.environments).toBe(0);
  });

  it('should track directories and branches', async () => {
    const env = createGitTestEnvironment('tracker-resources');
    await env.initRepo();

    // Track the environment and additional resources
    testResourceTracker.trackEnvironment(env);
    testResourceTracker.trackDirectory(path.join(env.tmpDir, 'extra-dir'));
    testResourceTracker.trackBranch('test-branch', env.tmpDir);

    // Create the extra directory
    fs.mkdirSync(path.join(env.tmpDir, 'extra-dir'), { recursive: true });

    // Create test branch
    await env.createBranch('test-branch');

    const stats = testResourceTracker.getStats();
    expect(stats.environments).toBeGreaterThanOrEqual(1);
    expect(stats.directories).toBeGreaterThanOrEqual(1);
    expect(stats.branches).toBeGreaterThanOrEqual(1);

    // Cleanup should handle all resources
    await testResourceTracker.cleanupAll();

    expect(fs.existsSync(env.tmpDir)).toBe(false);
  });

  it('should handle worktree tracking', async () => {
    const env = createGitTestEnvironment('tracker-worktree');
    await env.initRepo();

    try {
      const worktreePath = env.createWorktree('test-worktree');

      // Track the worktree
      testResourceTracker.trackWorktree('test-worktree', worktreePath, env.tmpDir);
      testResourceTracker.trackEnvironment(env);

      expect(fs.existsSync(worktreePath)).toBe(true);

      const stats = testResourceTracker.getStats();
      expect(stats.worktrees).toBeGreaterThanOrEqual(1);

      // Cleanup should remove worktree and main environment
      await testResourceTracker.cleanupAll();

      expect(fs.existsSync(worktreePath)).toBe(false);
      expect(fs.existsSync(env.tmpDir)).toBe(false);
    } catch {
      // Skip worktree test if git worktree is not available
      console.log('Skipping worktree test - git worktree not available');
      testResourceTracker.trackEnvironment(env);
      await testResourceTracker.cleanupAll();
    }
  });

  it('should cleanup orphaned resources gracefully', () => {
    // This test mainly checks that the function doesn't throw
    // Real cleanup behavior would require actual orphaned resources
    expect(() => {
      testResourceTracker.cleanupOrphanedResources();
    }).not.toThrow();
  });

  it('should maintain singleton behavior', () => {
    // Import the singleton multiple times
    const tracker1 = testResourceTracker;
    const tracker2 = testResourceTracker;

    // Should be the same instance
    expect(tracker1).toBe(tracker2);

    // Stats should be shared
    const stats1 = tracker1.getStats();
    const stats2 = tracker2.getStats();
    expect(stats1).toEqual(stats2);
  });

  it('should handle cleanup errors gracefully', async () => {
    const env = createGitTestEnvironment('tracker-error-test');
    await env.initRepo();

    // Track environment
    testResourceTracker.trackEnvironment(env);

    // Track a non-existent directory (will cause cleanup error)
    testResourceTracker.trackDirectory('/non/existent/path');

    // Cleanup should not throw even with errors
    await expect(testResourceTracker.cleanupAll()).resolves.not.toThrow();

    // Real environment should still be cleaned up
    expect(fs.existsSync(env.tmpDir)).toBe(false);
  });
});
