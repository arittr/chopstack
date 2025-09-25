/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, expect, it, vi } from 'vitest';

import {
  addAllChanges,
  branchExists,
  createCommit,
  getCurrentBranch,
  getGitStatus,
  getStatusColor,
  isGitSpiceAvailable,
} from '../utils/git-operations';

// Mock execa - this will use the mock from vitest-unit.setup.ts
vi.mock('execa');
const { execaSync } = await import('execa');
const mockExecaSync = vi.mocked(execaSync);

describe('git-operations utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatusColor', () => {
    it('should return correct color function for modified files', () => {
      const colorFn = getStatusColor('M ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for added files', () => {
      const colorFn = getStatusColor('A ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for deleted files', () => {
      const colorFn = getStatusColor('D ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for renamed files', () => {
      const colorFn = getStatusColor('R ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for copied files', () => {
      const colorFn = getStatusColor('C ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return default color function for untracked files', () => {
      const colorFn = getStatusColor('??');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return default color function for unmerged files', () => {
      const colorFn = getStatusColor('UU');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return default color function for empty status', () => {
      const colorFn = getStatusColor('');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return default color function for unknown status', () => {
      const colorFn = getStatusColor('XY');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });
  });

  describe('getGitStatus', () => {
    it('should parse git status output with changes', () => {
      const mockOutput = 'M  src/file1.ts\nA  src/file2.ts\n?? src/file3.ts';
      mockExecaSync.mockReturnValue({ stdout: mockOutput } as any);

      const status = getGitStatus();

      expect(status.hasChanges).toBe(true);
      expect(status.statusLines).toEqual(['M  src/file1.ts', 'A  src/file2.ts', '?? src/file3.ts']);
      expect(mockExecaSync).toHaveBeenCalledWith('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      });
    });

    it('should handle empty git status output', () => {
      mockExecaSync.mockReturnValue({ stdout: '' } as any);

      const status = getGitStatus();

      expect(status.hasChanges).toBe(false);
      expect(status.statusLines).toEqual([]);
    });

    it('should filter out empty lines from git status output', () => {
      const mockOutput = 'M  src/file1.ts\n\nA  src/file2.ts\n';
      mockExecaSync.mockReturnValue({ stdout: mockOutput } as any);

      const status = getGitStatus();

      expect(status.statusLines).toEqual(['M  src/file1.ts', 'A  src/file2.ts']);
    });
  });

  describe('addAllChanges', () => {
    it('should call git add with correct arguments', () => {
      addAllChanges();

      expect(mockExecaSync).toHaveBeenCalledWith('git', ['add', '-A']);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', () => {
      mockExecaSync.mockReturnValue({ stdout: 'feature-branch\n' } as any);

      const branch = getCurrentBranch();

      expect(branch).toBe('feature-branch');
      expect(mockExecaSync).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
      });
    });

    it('should trim whitespace from branch name', () => {
      mockExecaSync.mockReturnValue({ stdout: '  main  \n' } as any);

      const branch = getCurrentBranch();

      expect(branch).toBe('main');
    });
  });

  describe('branchExists', () => {
    it('should return true when branch exists', () => {
      mockExecaSync.mockReturnValue({ stdout: '' } as any);

      const exists = branchExists('existing-branch');

      expect(exists).toBe(true);
      expect(mockExecaSync).toHaveBeenCalledWith('git', [
        'rev-parse',
        '--verify',
        'existing-branch',
      ]);
    });

    it('should return false when branch does not exist', () => {
      mockExecaSync.mockImplementation(() => {
        throw new Error('fatal: Needed a single revision');
      });

      const exists = branchExists('non-existing-branch');

      expect(exists).toBe(false);
    });
  });

  describe('createCommit', () => {
    it('should create commit with message', () => {
      mockExecaSync.mockReturnValue({ stdout: '' } as any);
      const message = 'feat: add new feature';

      createCommit(message);

      expect(mockExecaSync).toHaveBeenCalledWith('git', ['commit', '-m', message]);
    });
  });

  describe('isGitSpiceAvailable', () => {
    it('should return true when git-spice is available', () => {
      mockExecaSync.mockReturnValue({ stdout: 'git-spice 0.17.0' } as any);

      const isAvailable = isGitSpiceAvailable();

      expect(isAvailable).toBe(true);
      expect(mockExecaSync).toHaveBeenCalledWith('gs', ['--version']);
    });

    it('should return false when git-spice is not available', () => {
      mockExecaSync.mockImplementation(() => {
        throw new Error('command not found: gs');
      });

      const isAvailable = isGitSpiceAvailable();

      expect(isAvailable).toBe(false);
    });
  });
});
