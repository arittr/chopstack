import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VcsMode } from '@/core/vcs/vcs-strategy';

import { VcsConfigFileError, VcsToolUnavailableError } from '../types';
import { VcsConfigServiceImpl } from '../vcs-config';

// Mock file system
vi.mock('node:fs', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
    },
  };
});

// Mock backend implementations
const { mockGitSpiceIsAvailable, mockMergeCommitIsAvailable, mockGraphiteIsAvailable } = vi.hoisted(
  () => ({
    mockGitSpiceIsAvailable: vi.fn(),
    mockMergeCommitIsAvailable: vi.fn(),
    mockGraphiteIsAvailable: vi.fn(),
  }),
);

vi.mock('@/adapters/vcs/git-spice/backend', () => ({
  GitSpiceBackend: vi.fn().mockImplementation(() => ({
    isAvailable: mockGitSpiceIsAvailable,
  })),
}));

vi.mock('@/adapters/vcs/merge-commit/backend', () => ({
  MergeCommitBackend: vi.fn().mockImplementation(() => ({
    isAvailable: mockMergeCommitIsAvailable,
  })),
}));

vi.mock('@/adapters/vcs/graphite/backend', () => ({
  GraphiteBackend: vi.fn().mockImplementation(() => ({
    isAvailable: mockGraphiteIsAvailable,
  })),
}));

vi.mock('@/adapters/vcs/sapling/backend', () => ({
  SaplingBackend: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

describe('VcsConfigServiceImpl', () => {
  let service: VcsConfigServiceImpl;
  const testWorkdir = '/test/workdir';

  beforeEach(() => {
    service = new VcsConfigServiceImpl();
    vi.clearAllMocks();

    // Default: all backends unavailable
    mockGitSpiceIsAvailable.mockResolvedValue(false);
    mockMergeCommitIsAvailable.mockResolvedValue(false);
    mockGraphiteIsAvailable.mockResolvedValue(false);
  });

  describe('loadConfig', () => {
    it('should load config with CLI mode taking priority', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('vcs:\n  mode: merge-commit\n');

      const config = await service.loadConfig(testWorkdir, 'git-spice');

      expect(config.mode).toBe('git-spice');
      expect(config.workdir).toBe(testWorkdir);
    });

    it('should load config from file when CLI mode not provided', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('vcs:\n  mode: graphite\n');

      const config = await service.loadConfig(testWorkdir);

      expect(config.mode).toBe('graphite');
      expect(config.workdir).toBe(testWorkdir);
    });

    it('should use defaults when config file does not exist', async () => {
      const enoentError = new Error('ENOENT') as Error & { code?: string };
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);

      const config = await service.loadConfig(testWorkdir);

      expect(config.mode).toBeUndefined();
      expect(config.trunk).toBe('main');
      expect(config.worktreePath).toBe('.chopstack/shadows');
      expect(config.branchPrefix).toBe('task');
      expect(config.autoRestack).toBe(true);
      expect(config.submitOnComplete).toBe(false);
    });

    it('should load all config fields from file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        'vcs:\n' +
          '  mode: git-spice\n' +
          '  trunk: develop\n' +
          '  worktreePath: .worktrees\n' +
          '  branchPrefix: feature\n' +
          '  autoRestack: false\n' +
          '  submitOnComplete: true\n',
      );

      const config = await service.loadConfig(testWorkdir);

      expect(config.mode).toBe('git-spice');
      expect(config.trunk).toBe('develop');
      expect(config.worktreePath).toBe('.worktrees');
      expect(config.branchPrefix).toBe('feature');
      expect(config.autoRestack).toBe(false);
      expect(config.submitOnComplete).toBe(true);
    });

    it('should throw VcsConfigFileError for invalid YAML', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: [');

      await expect(service.loadConfig(testWorkdir)).rejects.toThrow(VcsConfigFileError);
    });

    it('should throw VcsConfigFileError for file read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(service.loadConfig(testWorkdir)).rejects.toThrow(VcsConfigFileError);
    });

    it('should use correct config path', async () => {
      const enoentError = new Error('ENOENT') as Error & { code?: string };
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);

      await service.loadConfig(testWorkdir);

      const expectedPath = path.join(os.homedir(), '.chopstack', 'config.yaml');
      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
    });
  });

  describe('validateMode', () => {
    beforeEach(async () => {
      // Load config first so validateMode has workdir
      const enoentError = new Error('ENOENT') as Error & { code?: string };
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      await service.loadConfig(testWorkdir);
    });

    it('should return mode when available and explicit', async () => {
      mockGitSpiceIsAvailable.mockResolvedValue(true);

      const mode = await service.validateMode('git-spice', true);

      expect(mode).toBe('git-spice');
    });

    it('should throw VcsToolUnavailableError for explicit mode when unavailable', async () => {
      mockGitSpiceIsAvailable.mockResolvedValue(false);

      await expect(service.validateMode('git-spice', true)).rejects.toThrow(
        VcsToolUnavailableError,
      );
    });

    it('should include install instructions in error for git-spice', async () => {
      mockGitSpiceIsAvailable.mockResolvedValue(false);

      try {
        await service.validateMode('git-spice', true);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VcsToolUnavailableError);
        const err = error as VcsToolUnavailableError;
        expect(err.installInstructions).toContain('brew install');
        expect(err.installInstructions).toContain('go install');
      }
    });

    it('should include install instructions in error for graphite', async () => {
      mockGraphiteIsAvailable.mockResolvedValue(false);

      try {
        await service.validateMode('graphite', true);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(VcsToolUnavailableError);
        const err = error as VcsToolUnavailableError;
        expect(err.installInstructions).toContain('npm install -g');
        expect(err.installInstructions).toContain('@withgraphite/graphite-cli');
      }
    });

    it('should fallback to merge-commit when non-explicit mode unavailable', async () => {
      mockGraphiteIsAvailable.mockResolvedValue(false);

      const mode = await service.validateMode('graphite', false);

      expect(mode).toBe('merge-commit');
    });

    it('should return mode when available and non-explicit', async () => {
      mockGitSpiceIsAvailable.mockResolvedValue(true);

      const mode = await service.validateMode('git-spice', false);

      expect(mode).toBe('git-spice');
    });
  });

  describe('createBackend', () => {
    it('should create GitSpiceBackend for git-spice mode', async () => {
      const backend = await service.createBackend('git-spice', testWorkdir);

      expect(backend).toBeDefined();
      expect(typeof backend.isAvailable).toBe('function');
    });

    it('should create GitSpiceBackend for stacked mode (legacy)', async () => {
      const backend = await service.createBackend('stacked', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should create MergeCommitBackend for merge-commit mode', async () => {
      const backend = await service.createBackend('merge-commit', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should create MergeCommitBackend for simple mode (legacy)', async () => {
      const backend = await service.createBackend('simple', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should create MergeCommitBackend for worktree mode (legacy)', async () => {
      const backend = await service.createBackend('worktree', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should create GraphiteBackend for graphite mode', async () => {
      const backend = await service.createBackend('graphite', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should create SaplingBackend for sapling mode', async () => {
      const backend = await service.createBackend('sapling', testWorkdir);

      expect(backend).toBeDefined();
    });

    it('should handle all VcsMode values exhaustively', async () => {
      const modes: VcsMode[] = [
        'git-spice',
        'merge-commit',
        'graphite',
        'sapling',
        'simple',
        'worktree',
        'stacked',
      ];

      for (const mode of modes) {
        const backend = await service.createBackend(mode, testWorkdir);
        expect(backend).toBeDefined();
      }
    });
  });

  describe('getConfig', () => {
    it('should return null before loadConfig is called', () => {
      const config = service.getConfig();

      expect(config).toBeNull();
    });

    it('should return config after loadConfig is called', async () => {
      const enoentError = new Error('ENOENT') as Error & { code?: string };
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);

      await service.loadConfig(testWorkdir, 'git-spice');
      const config = service.getConfig();

      expect(config).not.toBeNull();
      expect(config?.mode).toBe('git-spice');
      expect(config?.workdir).toBe(testWorkdir);
    });
  });

  describe('config priority', () => {
    it('should prioritize CLI mode over file mode', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('vcs:\n  mode: merge-commit\n  trunk: develop\n');

      const config = await service.loadConfig(testWorkdir, 'git-spice');

      expect(config.mode).toBe('git-spice'); // CLI wins
      expect(config.trunk).toBe('develop'); // File config still used
    });

    it('should prioritize file mode over defaults', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('vcs:\n  mode: graphite\n');

      const config = await service.loadConfig(testWorkdir);

      expect(config.mode).toBe('graphite'); // File wins over undefined
    });

    it('should use defaults when neither CLI nor file specify values', async () => {
      const enoentError = new Error('ENOENT') as Error & { code?: string };
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);

      const config = await service.loadConfig(testWorkdir);

      expect(config.mode).toBeUndefined();
      expect(config.trunk).toBe('main');
      expect(config.branchPrefix).toBe('task');
    });
  });

  describe('error types', () => {
    it('should create VcsToolUnavailableError with correct properties', () => {
      const error = new VcsToolUnavailableError('git-spice', 'Install instructions');

      expect(error).toBeInstanceOf(VcsToolUnavailableError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('VcsToolUnavailableError');
      expect(error.mode).toBe('git-spice');
      expect(error.installInstructions).toBe('Install instructions');
      expect(error.message).toContain('git-spice');
      expect(error.message).toContain('Install instructions');
    });

    it('should create VcsConfigFileError with correct properties', () => {
      const cause = new Error('Parse error');
      const error = new VcsConfigFileError('/path/to/config.yaml', cause);

      expect(error).toBeInstanceOf(VcsConfigFileError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('VcsConfigFileError');
      expect(error.configPath).toBe('/path/to/config.yaml');
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('/path/to/config.yaml');
      expect(error.message).toContain('Parse error');
    });
  });
});
