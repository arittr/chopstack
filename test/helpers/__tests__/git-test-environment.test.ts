import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isNonNullish, isValidArray } from '@/validation/guards';

import { createGitTestEnvironment } from '../git-test-environment';

describe('GitTestEnvironment', () => {
  it('should create isolated test environment', async () => {
    const env = createGitTestEnvironment('test-basic');

    // Should create temporary directory
    const tmpDir = env.tmpDir;
    expect(tmpDir).toBeDefined();
    expect(fs.existsSync(tmpDir)).toBe(false); // Not created until initRepo

    // Should initialize Git repository
    await env.initRepo();
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true);

    // Should have initial commit
    const git = env.git;
    const log = await git.log();
    expect(log.total).toBeGreaterThan(0);

    // Should clean up properly
    await env.cleanup();
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('should handle multiple environments independently', async () => {
    const env1 = createGitTestEnvironment('test-multi-1');
    const env2 = createGitTestEnvironment('test-multi-2');

    await env1.initRepo();
    await env2.initRepo();

    // Should have different directories
    expect(env1.tmpDir).not.toBe(env2.tmpDir);

    // Should both exist
    expect(fs.existsSync(env1.tmpDir)).toBe(true);
    expect(fs.existsSync(env2.tmpDir)).toBe(true);

    // Should create different files
    env1.createFile('file1.txt', 'content1');
    env2.createFile('file2.txt', 'content2');

    expect(fs.existsSync(path.join(env1.tmpDir, 'file1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(env2.tmpDir, 'file2.txt'))).toBe(true);
    expect(fs.existsSync(path.join(env1.tmpDir, 'file2.txt'))).toBe(false);
    expect(fs.existsSync(path.join(env2.tmpDir, 'file1.txt'))).toBe(false);

    // Clean up both
    await env1.cleanup();
    await env2.cleanup();

    expect(fs.existsSync(env1.tmpDir)).toBe(false);
    expect(fs.existsSync(env2.tmpDir)).toBe(false);
  });

  it('should handle branches and worktrees', async () => {
    const env = createGitTestEnvironment('test-branches');
    await env.initRepo();

    // Create test branch
    await env.createBranch('test-branch', true);
    const branches = await env.git.branch();
    expect(branches.current).toBe('test-branch');

    // Create worktree
    const worktreePath = env.createWorktree('worktree-branch');
    expect(fs.existsSync(worktreePath)).toBe(true);
    expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);

    // Cleanup should remove everything
    await env.cleanup();
    expect(fs.existsSync(env.tmpDir)).toBe(false);
    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  it('should be safe to call cleanup multiple times', async () => {
    const env = createGitTestEnvironment('test-safe-cleanup');
    await env.initRepo();

    const tmpDir = env.tmpDir;
    expect(fs.existsSync(tmpDir)).toBe(true);

    // First cleanup
    await env.cleanup();
    expect(fs.existsSync(tmpDir)).toBe(false);

    // Second cleanup should not throw
    await expect(env.cleanup()).resolves.not.toThrow();
    await expect(env.ensureCleanup()).resolves.not.toThrow();
  });

  it('should generate unique test directories', () => {
    const env1 = createGitTestEnvironment('same-name');
    const env2 = createGitTestEnvironment('same-name');

    // Even with same test name, should get different directories
    expect(env1.tmpDir).not.toBe(env2.tmpDir);

    const id1 = env1.getUniqueId();
    const id2 = env2.getUniqueId();
    expect(id1).not.toBe(id2);
  });

  it('should handle file creation with nested directories', async () => {
    const env = createGitTestEnvironment('test-nested-files');
    await env.initRepo();

    // Create nested file structure
    env.createFile('src/components/Button.tsx', 'export const Button = () => <button />;');
    env.createFile('src/utils/helpers.ts', 'export const helper = () => {};');

    // Files should exist
    expect(fs.existsSync(path.join(env.tmpDir, 'src/components/Button.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(env.tmpDir, 'src/utils/helpers.ts'))).toBe(true);

    // Should be able to commit them
    await env.git.add('.');
    await env.git.commit('Add test files');

    const log = await env.git.log({ maxCount: 1 });
    expect(log.latest?.message).toBe('Add test files');

    await env.cleanup();
  });

  it('should execute commands in test directory', async () => {
    const env = createGitTestEnvironment('test-exec');
    await env.initRepo();

    // Create a file and check it exists via command
    env.createFile('test.txt', 'test content');
    const result = env.exec('ls -la test.txt');
    expect(result).toContain('test.txt');

    await env.cleanup();
  });
});