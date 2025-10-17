/**
 * Integration tests for MergeCommitBackend with real git operations
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { beforeEach, describe, expect, it } from 'bun:test';

import { MergeCommitBackend, MergeCommitError } from '../backend';

describe('MergeCommitBackend Integration', () => {
  const { getGit, getTmpDir } = setupGitTest('merge-commit-backend');
  let backend: MergeCommitBackend;
  let testDir: string;

  beforeEach(async () => {
    testDir = getTmpDir();
    backend = new MergeCommitBackend(testDir);

    // Initialize backend
    await backend.initialize(testDir, 'main');

    // Create initial commit
    const git = getGit();
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test Repo\n');
    await git.add('.');
    await git.commit('Initial commit');
  });

  describe('isAvailable', () => {
    it('should return true when git is installed', async () => {
      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('branch operations', () => {
    it('should create branch from base reference', async () => {
      await backend.createBranch('feature-1', { base: 'main' }, testDir);

      const git = getGit();
      const branches = await git.branch();
      expect(branches.all).toContain('feature-1');
    });

    it('should create branch from parent reference', async () => {
      // Create parent branch first
      await backend.createBranch('feature-1', { base: 'main' }, testDir);

      // Create child branch
      const git = getGit();
      await git.checkout('feature-1');
      await fs.writeFile(path.join(testDir, 'feature1.ts'), 'export const feature1 = true;');
      await git.add('.');
      await git.commit('Add feature 1');

      // Now create feature-2 from feature-1
      await backend.createBranch('feature-2', { parent: 'feature-1' }, testDir);

      const branches = await git.branch();
      expect(branches.all).toContain('feature-2');
      expect(branches.current).toBe('feature-2');
    });

    it('should delete branch', async () => {
      await backend.createBranch('temp-branch', { base: 'main' }, testDir);

      const git = getGit();
      await git.checkout('main'); // Switch away from branch to delete

      await backend.deleteBranch('temp-branch', testDir);

      const branches = await git.branch();
      expect(branches.all).not.toContain('temp-branch');
    });

    it('should throw error when creating duplicate branch', async () => {
      await backend.createBranch('duplicate', { base: 'main' }, testDir);

      const git = getGit();
      await git.checkout('main'); // Switch back to main

      await expect(backend.createBranch('duplicate', { base: 'main' }, testDir)).rejects.toThrow(
        MergeCommitError,
      );
    });
  });

  describe('commit operations', () => {
    beforeEach(async () => {
      await backend.createBranch('feature-branch', { base: 'main' }, testDir);
    });

    it('should commit all changes', async () => {
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1;');
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2;');

      const hash = await backend.commit('Add files', testDir);

      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(40); // Full SHA-1 hash

      const git = getGit();
      const log = await git.log({ maxCount: 1 });
      expect(log.latest?.message).toBe('Add files');
    });

    it('should commit specific files only', async () => {
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'export const x = 1;');
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'export const y = 2;');

      await backend.commit('Add file1 only', testDir, { files: ['file1.ts'] });

      const git = getGit();
      const status = await git.status();
      expect(status.not_added).toContain('file2.ts'); // file2 should still be untracked
    });

    it('should create empty commit when specified', async () => {
      const hash = await backend.commit('Empty commit', testDir, { allowEmpty: true });

      expect(hash).toBeTruthy();

      const git = getGit();
      const log = await git.log({ maxCount: 1 });
      expect(log.latest?.message).toBe('Empty commit');
    });
  });

  describe('conflict detection', () => {
    it('should return false when no conflicts', async () => {
      const hasConflicts = await backend.hasConflicts(testDir);
      expect(hasConflicts).toBe(false);
    });

    it('should return empty array when no conflicts', async () => {
      const files = await backend.getConflictedFiles(testDir);
      expect(files).toEqual([]);
    });

    it('should detect conflicts after conflicting merge', async () => {
      // Create two branches with conflicting changes
      const git = getGit();

      // Branch 1: Change line 1
      await backend.createBranch('branch-1', { base: 'main' }, testDir);
      await fs.writeFile(path.join(testDir, 'conflict.txt'), 'Line from branch-1\n');
      await backend.commit('Branch 1 change', testDir);

      // Branch 2: Change same line differently
      await git.checkout('main');
      await backend.createBranch('branch-2', { base: 'main' }, testDir);
      await fs.writeFile(path.join(testDir, 'conflict.txt'), 'Line from branch-2\n');
      await backend.commit('Branch 2 change', testDir);

      // Try to merge branch-1 (should create conflict)
      try {
        await git.merge(['branch-1']);
      } catch {
        // Merge will fail due to conflict
      }

      const hasConflicts = await backend.hasConflicts(testDir);
      expect(hasConflicts).toBe(true);

      const conflictedFiles = await backend.getConflictedFiles(testDir);
      expect(conflictedFiles).toContain('conflict.txt');
    });

    it('should abort merge successfully', async () => {
      // Create conflict (same as previous test)
      const git = getGit();

      await backend.createBranch('branch-1', { base: 'main' }, testDir);
      await fs.writeFile(path.join(testDir, 'conflict.txt'), 'Line from branch-1\n');
      await backend.commit('Branch 1 change', testDir);

      await git.checkout('main');
      await backend.createBranch('branch-2', { base: 'main' }, testDir);
      await fs.writeFile(path.join(testDir, 'conflict.txt'), 'Line from branch-2\n');
      await backend.commit('Branch 2 change', testDir);

      try {
        await git.merge(['branch-1']);
      } catch {
        // Merge will fail
      }

      // Abort the merge
      await backend.abortMerge(testDir);

      // Check that conflict is resolved
      const hasConflicts = await backend.hasConflicts(testDir);
      expect(hasConflicts).toBe(false);
    });
  });

  describe('submit', () => {
    it('should return empty array (stub)', async () => {
      const urls = await backend.submit({ branches: ['feature-1'] }, testDir);
      expect(urls).toEqual([]);
    });
  });
});
