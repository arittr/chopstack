/* eslint-disable @typescript-eslint/require-await, unicorn/no-unused-properties, @typescript-eslint/strict-boolean-expressions */
import { describe, expect, it } from 'bun:test';

import type {
  CommitOptionsGeneric,
  CreateBranchOptions,
  PullRequest,
  StackBranch,
  StackInfo,
  SubmitOptions,
  VcsBackend,
} from '../interfaces';

/**
 * Tests for VCS Backend interface types
 *
 * These tests verify that the enhanced VcsBackend interface:
 * 1. Supports non-stacking workflows (merge-commit)
 * 2. Has generalized branch creation with options
 * 3. Has generalized commit method with files and allowEmpty
 * 4. Has optional stack methods (trackBranch?, restack?, getStackInfo?)
 * 5. Has conflict resolution methods
 * 6. Compiles correctly with TypeScript strict mode
 */
describe('VcsBackend Interface', () => {
  describe('Type Safety', () => {
    it('should allow mock implementation with all required methods', () => {
      const mockBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async (_workdir: string, _trunk?: string) => {},
        createBranch: async (
          _branchName: string,
          _options: CreateBranchOptions,
          _workdir: string,
        ) => {},
        deleteBranch: async (_branchName: string, _workdir: string) => {},
        commit: async (_message: string, _workdir: string, _options?: CommitOptionsGeneric) =>
          'abc123',
        submit: async (_options: SubmitOptions, _workdir: string) => [],
        hasConflicts: async (_workdir: string) => false,
        getConflictedFiles: async (_workdir: string) => [],
        abortMerge: async (_workdir: string) => {},
      };

      expect(mockBackend).toBeDefined();
      expect(mockBackend.isAvailable).toBeDefined();
      expect(mockBackend.createBranch).toBeDefined();
      expect(mockBackend.commit).toBeDefined();
    });

    it('should allow implementation with optional stack methods', () => {
      const stackingBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async (_workdir: string, _trunk?: string) => {},
        createBranch: async (
          _branchName: string,
          _options: CreateBranchOptions,
          _workdir: string,
        ) => {},
        deleteBranch: async (_branchName: string, _workdir: string) => {},
        commit: async (_message: string, _workdir: string, _options?: CommitOptionsGeneric) =>
          'abc123',
        submit: async (_options: SubmitOptions, _workdir: string) => [],
        hasConflicts: async (_workdir: string) => false,
        getConflictedFiles: async (_workdir: string) => [],
        abortMerge: async (_workdir: string) => {},
        // Optional stack methods
        trackBranch: async (_branchName: string, _parent: string, _workdir: string) => {},
        restack: async (_workdir: string) => {},
        getStackInfo: async (_workdir: string) => null,
      };

      expect(stackingBackend.trackBranch).toBeDefined();
      expect(stackingBackend.restack).toBeDefined();
      expect(stackingBackend.getStackInfo).toBeDefined();
    });

    it('should allow implementation without optional stack methods', () => {
      const nonStackingBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async (_workdir: string, _trunk?: string) => {},
        createBranch: async (
          _branchName: string,
          _options: CreateBranchOptions,
          _workdir: string,
        ) => {},
        deleteBranch: async (_branchName: string, _workdir: string) => {},
        commit: async (_message: string, _workdir: string, _options?: CommitOptionsGeneric) =>
          'abc123',
        submit: async (_options: SubmitOptions, _workdir: string) => [],
        hasConflicts: async (_workdir: string) => false,
        getConflictedFiles: async (_workdir: string) => [],
        abortMerge: async (_workdir: string) => {},
        // No optional stack methods
      };

      expect(nonStackingBackend.trackBranch).toBeUndefined();
      expect(nonStackingBackend.restack).toBeUndefined();
      expect(nonStackingBackend.getStackInfo).toBeUndefined();
    });
  });

  describe('CreateBranchOptions', () => {
    it('should support stacking workflow with parent tracking', () => {
      const stackingOptions: CreateBranchOptions = {
        parent: 'feature-1',
        track: true,
      };

      expect(stackingOptions.parent).toBe('feature-1');
      expect(stackingOptions.track).toBe(true);
      expect(stackingOptions.base).toBeUndefined();
    });

    it('should support merge-commit workflow with base reference', () => {
      const mergeOptions: CreateBranchOptions = {
        base: 'main',
      };

      expect(mergeOptions.base).toBe('main');
      expect(mergeOptions.parent).toBeUndefined();
      expect(mergeOptions.track).toBeUndefined();
    });

    it('should support both parent and base for hybrid workflows', () => {
      const hybridOptions: CreateBranchOptions = {
        parent: 'feature-1',
        base: 'main',
        track: true,
      };

      expect(hybridOptions.parent).toBe('feature-1');
      expect(hybridOptions.base).toBe('main');
      expect(hybridOptions.track).toBe(true);
    });

    it('should support empty options for default behavior', () => {
      const defaultOptions: CreateBranchOptions = {};

      expect(defaultOptions.parent).toBeUndefined();
      expect(defaultOptions.base).toBeUndefined();
      expect(defaultOptions.track).toBeUndefined();
    });
  });

  describe('CommitOptionsGeneric', () => {
    it('should support committing specific files', () => {
      const options: CommitOptionsGeneric = {
        files: ['src/app.ts', 'src/config.ts'],
      };

      expect(options.files).toHaveLength(2);
      expect(options.allowEmpty).toBeUndefined();
      expect(options.noRestack).toBeUndefined();
    });

    it('should support empty commits', () => {
      const options: CommitOptionsGeneric = {
        allowEmpty: true,
      };

      expect(options.allowEmpty).toBe(true);
      expect(options.files).toBeUndefined();
    });

    it('should support disabling automatic restack', () => {
      const options: CommitOptionsGeneric = {
        noRestack: true,
      };

      expect(options.noRestack).toBe(true);
    });

    it('should support all commit options together', () => {
      const options: CommitOptionsGeneric = {
        files: ['src/feature.ts'],
        allowEmpty: false,
        noRestack: true,
      };

      expect(options.files).toHaveLength(1);
      expect(options.allowEmpty).toBe(false);
      expect(options.noRestack).toBe(true);
    });

    it('should allow undefined options', () => {
      const options: CommitOptionsGeneric | undefined = undefined;

      expect(options).toBeUndefined();
    });
  });

  describe('SubmitOptions', () => {
    it('should require branches array', () => {
      const options: SubmitOptions = {
        branches: ['feature-1', 'feature-2'],
      };

      expect(options.branches).toHaveLength(2);
      expect(options.draft).toBeUndefined();
      expect(options.autoMerge).toBeUndefined();
    });

    it('should support draft PR creation', () => {
      const options: SubmitOptions = {
        branches: ['feature-1'],
        draft: true,
      };

      expect(options.draft).toBe(true);
    });

    it('should support auto-merge', () => {
      const options: SubmitOptions = {
        branches: ['feature-1'],
        autoMerge: true,
      };

      expect(options.autoMerge).toBe(true);
    });

    it('should support extra backend-specific arguments', () => {
      const options: SubmitOptions = {
        branches: ['feature-1'],
        extraArgs: ['--force', '--no-verify'],
      };

      expect(options.extraArgs).toHaveLength(2);
    });

    it('should support all submit options', () => {
      const options: SubmitOptions = {
        branches: ['feature-1', 'feature-2'],
        draft: true,
        autoMerge: false,
        extraArgs: ['--verbose'],
      };

      expect(options.branches).toHaveLength(2);
      expect(options.draft).toBe(true);
      expect(options.autoMerge).toBe(false);
      expect(options.extraArgs).toHaveLength(1);
    });
  });

  describe('StackInfo', () => {
    it('should represent stack information with branches', () => {
      const info: StackInfo = {
        baseBranch: 'main',
        branches: [],
      };

      expect(info.baseBranch).toBe('main');
      expect(info.branches).toHaveLength(0);
      expect(info.name).toBeUndefined();
    });

    it('should support optional stack name', () => {
      const info: StackInfo = {
        baseBranch: 'main',
        branches: [],
        name: 'feature-stack',
      };

      expect(info.name).toBe('feature-stack');
    });

    it('should contain branch information', () => {
      const branch: StackBranch = {
        name: 'feature-1',
        current: true,
        hasChanges: false,
      };

      const info: StackInfo = {
        baseBranch: 'main',
        branches: [branch],
      };

      expect(info.branches).toHaveLength(1);
      expect(info.branches?.[0]?.name).toBe('feature-1');
    });
  });

  describe('StackBranch', () => {
    it('should represent branch with minimal fields', () => {
      const branch: StackBranch = {
        name: 'feature-1',
        current: false,
        hasChanges: true,
      };

      expect(branch.name).toBe('feature-1');
      expect(branch.current).toBe(false);
      expect(branch.hasChanges).toBe(true);
      expect(branch.parent).toBeUndefined();
      expect(branch.pullRequest).toBeUndefined();
    });

    it('should support parent relationship for stacking', () => {
      const branch: StackBranch = {
        name: 'feature-2',
        current: true,
        hasChanges: false,
        parent: 'feature-1',
      };

      expect(branch.parent).toBe('feature-1');
    });

    it('should support associated pull request', () => {
      const pr: PullRequest = {
        id: '123',
        branch: 'feature-1',
        title: 'Add feature',
        url: 'https://github.com/org/repo/pull/123',
        status: 'open',
      };

      const branch: StackBranch = {
        name: 'feature-1',
        current: false,
        hasChanges: false,
        pullRequest: pr,
      };

      expect(branch.pullRequest).toBeDefined();
      expect(branch.pullRequest?.id).toBe('123');
    });
  });

  describe('PullRequest', () => {
    it('should represent open pull request', () => {
      const pr: PullRequest = {
        id: '123',
        branch: 'feature-1',
        title: 'Add authentication',
        url: 'https://github.com/org/repo/pull/123',
        status: 'open',
      };

      expect(pr.status).toBe('open');
    });

    it('should represent closed pull request', () => {
      const pr: PullRequest = {
        id: '124',
        branch: 'feature-2',
        title: 'Fix bug',
        url: 'https://github.com/org/repo/pull/124',
        status: 'closed',
      };

      expect(pr.status).toBe('closed');
    });

    it('should represent merged pull request', () => {
      const pr: PullRequest = {
        id: '125',
        branch: 'feature-3',
        title: 'Refactor code',
        url: 'https://github.com/org/repo/pull/125',
        status: 'merged',
      };

      expect(pr.status).toBe('merged');
    });
  });

  describe('Conflict Resolution', () => {
    it('should provide conflict detection method', async () => {
      const backend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async () => {},
        createBranch: async () => {},
        deleteBranch: async () => {},
        commit: async () => 'abc123',
        submit: async () => [],
        hasConflicts: async () => true,
        getConflictedFiles: async () => ['src/app.ts', 'src/config.ts'],
        abortMerge: async () => {},
      };

      const hasConflicts = await backend.hasConflicts?.('/path/to/repo');
      expect(hasConflicts).toBe(true);

      const conflictedFiles = await backend.getConflictedFiles?.('/path/to/repo');
      expect(conflictedFiles).toHaveLength(2);
      expect(conflictedFiles).toContain('src/app.ts');
    });

    it('should provide merge abort method', async () => {
      const backend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async () => {},
        createBranch: async () => {},
        deleteBranch: async () => {},
        commit: async () => 'abc123',
        submit: async () => [],
        hasConflicts: async () => false,
        getConflictedFiles: async () => [],
        abortMerge: async () => {},
      };

      // Should not throw
      await expect(backend.abortMerge?.('/path/to/repo')).resolves.toBeUndefined();
    });
  });

  describe('Usage Patterns', () => {
    it('should support git-spice workflow', async () => {
      const gitSpiceBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async (_workdir, _trunk) => {},
        createBranch: async (_branchName, options, _workdir) => {
          expect(options.parent).toBeDefined();
          expect(options.track).toBe(true);
        },
        deleteBranch: async () => {},
        commit: async (_message, _workdir, options) => {
          expect(options?.noRestack).toBe(false);
          return 'abc123';
        },
        submit: async (options, _workdir) => {
          expect(options.branches.length).toBeGreaterThan(0);
          return ['https://github.com/org/repo/pull/123'];
        },
        hasConflicts: async () => false,
        getConflictedFiles: async () => [],
        abortMerge: async () => {},
        trackBranch: async (_branchName, _parent, _workdir) => {},
        restack: async (_workdir) => {},
        getStackInfo: async (_workdir) => ({
          baseBranch: 'main',
          branches: [
            { name: 'feature-1', current: true, hasChanges: false, parent: 'main' },
            { name: 'feature-2', current: false, hasChanges: false, parent: 'feature-1' },
          ],
        }),
      };

      await gitSpiceBackend.createBranch?.('feature-1', { parent: 'main', track: true }, '/repo');
      const hash = await gitSpiceBackend.commit?.('[task-1] Add feature', '/repo', {
        noRestack: false,
      });
      expect(hash).toBe('abc123');

      if (gitSpiceBackend.getStackInfo) {
        const stackInfo = await gitSpiceBackend.getStackInfo('/repo');
        if (stackInfo && typeof stackInfo === 'object' && 'branches' in stackInfo) {
          const typedStackInfo = stackInfo as StackInfo;
          expect(typedStackInfo.branches).toHaveLength(2);
        }
      }
    });

    it('should support merge-commit workflow', async () => {
      const mergeCommitBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async (_workdir, _trunk) => {},
        createBranch: async (_branchName, options, _workdir) => {
          expect(options.base).toBe('main');
          expect(options.parent).toBeUndefined();
        },
        deleteBranch: async () => {},
        commit: async (_message, _workdir, options) => {
          expect(options?.files).toBeDefined();
          return 'def456';
        },
        submit: async (options, _workdir) => {
          expect(options.branches).toHaveLength(1);
          return ['https://github.com/org/repo/pull/124'];
        },
        hasConflicts: async () => false,
        getConflictedFiles: async () => [],
        abortMerge: async () => {},
        // No optional stack methods
      };

      await mergeCommitBackend.createBranch?.('feature-1', { base: 'main' }, '/repo');
      const hash = await mergeCommitBackend.commit?.('[task-1] Add feature', '/repo', {
        files: ['src/app.ts'],
      });
      expect(hash).toBe('def456');

      expect(mergeCommitBackend.trackBranch).toBeUndefined();
      expect(mergeCommitBackend.restack).toBeUndefined();
      expect(mergeCommitBackend.getStackInfo).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should allow code that checks for optional methods', async () => {
      const backend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async () => {},
        createBranch: async () => {},
        deleteBranch: async () => {},
        commit: async () => 'abc123',
        submit: async () => [],
        hasConflicts: async () => false,
        getConflictedFiles: async () => [],
        abortMerge: async () => {},
      };

      // Safe optional chaining pattern
      if (backend.trackBranch) {
        await backend.trackBranch('feature-1', 'main', '/repo');
      }

      if (backend.restack) {
        await backend.restack('/repo');
      }

      const info = await backend.getStackInfo?.('/repo');
      expect(info).toBeUndefined();
    });

    it('should support backends that implement all methods', async () => {
      const fullBackend: VcsBackend = {
        isAvailable: async () => true,
        initialize: async () => {},
        createBranch: async () => {},
        deleteBranch: async () => {},
        commit: async () => 'abc123',
        submit: async () => [],
        hasConflicts: async () => false,
        getConflictedFiles: async () => [],
        abortMerge: async () => {},
        trackBranch: async () => {},
        restack: async () => {},
        getStackInfo: async () => null,
      };

      expect(fullBackend.trackBranch).toBeDefined();
      expect(fullBackend.restack).toBeDefined();
      expect(fullBackend.getStackInfo).toBeDefined();
    });
  });
});
