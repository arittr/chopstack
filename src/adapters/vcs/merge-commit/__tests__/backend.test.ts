/**
 * Unit tests for MergeCommitBackend
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';

import { MergeCommitBackend, MergeCommitError } from '../backend';

// Mock GitWrapper
vi.mock('@/adapters/vcs/git-wrapper');

describe('MergeCommitBackend', () => {
  let backend: MergeCommitBackend;
  let mockGit: {
    checkout: ReturnType<typeof vi.fn>;
    cherryPick: ReturnType<typeof vi.fn>;
    git: {
      add: ReturnType<typeof vi.fn>;
      checkoutBranch: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      deleteLocalBranch: ReturnType<typeof vi.fn>;
      merge: ReturnType<typeof vi.fn>;
      status: ReturnType<typeof vi.fn>;
      version: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    backend = new MergeCommitBackend('/test/repo');

    // Create mock git instance
    mockGit = {
      checkout: vi.fn(),
      cherryPick: vi.fn(),
      git: {
        add: vi.fn().mockResolvedValue(undefined),
        checkoutBranch: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue({ commit: 'abc123' }),
        deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
        merge: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({ conflicted: [] }),
        version: vi.fn().mockResolvedValue({ major: 2, minor: 40 }),
      },
    };

    // Mock GitWrapper constructor
    vi.mocked(GitWrapper).mockImplementation(() => mockGit as unknown as GitWrapper);
  });

  describe('isAvailable', () => {
    it('should return true when git is available', async () => {
      const available = await backend.isAvailable();
      expect(available).toBe(true);
      expect(mockGit.git.version).toHaveBeenCalled();
    });

    it('should return false when git is not available', async () => {
      mockGit.git.version.mockRejectedValue(new Error('git not found'));

      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(backend.initialize('/test/repo', 'main')).resolves.toBeUndefined();
    });
  });

  describe('createBranch', () => {
    it('should create branch from base reference', async () => {
      await backend.initialize('/test/repo');
      await backend.createBranch('feature-1', { base: 'main' }, '/test/repo');

      expect(mockGit.git.checkoutBranch).toHaveBeenCalledWith('feature-1', 'main');
    });

    it('should create branch from parent reference when base not provided', async () => {
      await backend.initialize('/test/repo');
      await backend.createBranch('feature-2', { parent: 'feature-1' }, '/test/repo');

      expect(mockGit.git.checkoutBranch).toHaveBeenCalledWith('feature-2', 'feature-1');
    });

    it('should create branch from HEAD when no options provided', async () => {
      await backend.initialize('/test/repo');
      await backend.createBranch('feature-3', {}, '/test/repo');

      expect(mockGit.git.checkoutBranch).toHaveBeenCalledWith('feature-3', 'HEAD');
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.checkoutBranch.mockRejectedValue(new Error('Branch already exists'));
      await backend.initialize('/test/repo');

      await expect(
        backend.createBranch('feature-1', { base: 'main' }, '/test/repo'),
      ).rejects.toThrow(MergeCommitError);
    });
  });

  describe('deleteBranch', () => {
    it('should delete branch', async () => {
      await backend.initialize('/test/repo');
      await backend.deleteBranch('feature-1', '/test/repo');

      expect(mockGit.git.deleteLocalBranch).toHaveBeenCalledWith('feature-1', true);
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.deleteLocalBranch.mockRejectedValue(new Error('Branch not found'));
      await backend.initialize('/test/repo');

      await expect(backend.deleteBranch('feature-1', '/test/repo')).rejects.toThrow(
        MergeCommitError,
      );
    });
  });

  describe('commit', () => {
    it('should commit all changes by default', async () => {
      await backend.initialize('/test/repo');
      const hash = await backend.commit('test commit', '/test/repo');

      expect(mockGit.git.add).toHaveBeenCalledWith('.');
      expect(mockGit.git.commit).toHaveBeenCalledWith('test commit', []);
      expect(hash).toBe('abc123');
    });

    it('should commit specific files when provided', async () => {
      await backend.initialize('/test/repo');
      await backend.commit('test commit', '/test/repo', {
        files: ['file1.ts', 'file2.ts'],
      });

      expect(mockGit.git.add).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
      expect(mockGit.git.commit).toHaveBeenCalledWith('test commit', []);
    });

    it('should allow empty commits when specified', async () => {
      await backend.initialize('/test/repo');
      await backend.commit('empty commit', '/test/repo', { allowEmpty: true });

      expect(mockGit.git.commit).toHaveBeenCalledWith('empty commit', ['--allow-empty']);
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.commit.mockRejectedValue(new Error('Nothing to commit'));
      await backend.initialize('/test/repo');

      await expect(backend.commit('test commit', '/test/repo')).rejects.toThrow(MergeCommitError);
    });
  });

  describe('submit', () => {
    it('should return empty array (stub implementation)', async () => {
      await backend.initialize('/test/repo');
      const urls = await backend.submit({ branches: ['feature-1'] }, '/test/repo');

      expect(urls).toEqual([]);
    });
  });

  describe('hasConflicts', () => {
    it('should return false when no conflicts', async () => {
      mockGit.git.status.mockResolvedValue({ conflicted: [] });
      await backend.initialize('/test/repo');

      const hasConflicts = await backend.hasConflicts('/test/repo');
      expect(hasConflicts).toBe(false);
    });

    it('should return true when conflicts exist', async () => {
      mockGit.git.status.mockResolvedValue({ conflicted: ['file1.ts', 'file2.ts'] });
      await backend.initialize('/test/repo');

      const hasConflicts = await backend.hasConflicts('/test/repo');
      expect(hasConflicts).toBe(true);
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.status.mockRejectedValue(new Error('Git error'));
      await backend.initialize('/test/repo');

      await expect(backend.hasConflicts('/test/repo')).rejects.toThrow(MergeCommitError);
    });
  });

  describe('getConflictedFiles', () => {
    it('should return empty array when no conflicts', async () => {
      mockGit.git.status.mockResolvedValue({ conflicted: [] });
      await backend.initialize('/test/repo');

      const files = await backend.getConflictedFiles('/test/repo');
      expect(files).toEqual([]);
    });

    it('should return conflicted files', async () => {
      mockGit.git.status.mockResolvedValue({ conflicted: ['file1.ts', 'file2.ts'] });
      await backend.initialize('/test/repo');

      const files = await backend.getConflictedFiles('/test/repo');
      expect(files).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.status.mockRejectedValue(new Error('Git error'));
      await backend.initialize('/test/repo');

      await expect(backend.getConflictedFiles('/test/repo')).rejects.toThrow(MergeCommitError);
    });
  });

  describe('abortMerge', () => {
    it('should abort merge', async () => {
      await backend.initialize('/test/repo');
      await backend.abortMerge('/test/repo');

      expect(mockGit.git.merge).toHaveBeenCalledWith(['--abort']);
    });

    it('should throw MergeCommitError on failure', async () => {
      mockGit.git.merge.mockRejectedValue(new Error('No merge in progress'));
      await backend.initialize('/test/repo');

      await expect(backend.abortMerge('/test/repo')).rejects.toThrow(MergeCommitError);
    });
  });
});
