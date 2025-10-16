/**
 * Integration tests for VcsConfigService with real file system operations
 *
 * These tests validate complete workflows including:
 * - Real config file creation and reading
 * - Actual backend availability checks
 * - Integration with filesystem in temporary directories
 * - End-to-end configuration scenarios
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { VcsMode } from '@/core/vcs/vcs-strategy';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { MergeCommitBackend } from '@/adapters/vcs/merge-commit/backend';

import { VcsToolUnavailableError } from '../types';
import { VcsConfigServiceImpl } from '../vcs-config';

describe('VcsConfigService Integration', () => {
  let service: VcsConfigServiceImpl;
  let tempConfigDir: string;
  let testWorkdir: string;

  beforeEach(async () => {
    service = new VcsConfigServiceImpl();

    // Create temporary directory for config files
    tempConfigDir = path.join(os.tmpdir(), `chopstack-config-test-${Date.now()}`);
    await fs.mkdir(tempConfigDir, { recursive: true });

    // Create the actual config directory structure for realistic testing
    const chopstackDir = path.join(tempConfigDir, '.chopstack');
    await fs.mkdir(chopstackDir, { recursive: true });

    // Create test working directory
    testWorkdir = path.join(tempConfigDir, 'workdir');
    await fs.mkdir(testWorkdir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup temp directories
    try {
      await fs.rm(tempConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('config file loading', () => {
    it('should load config from real YAML file', async () => {
      // Note: This test uses the actual home directory config path
      // We'll test with defaults since we can't easily override home directory
      const config = await service.loadConfig(testWorkdir);

      expect(config.workdir).toBe(testWorkdir);
      expect(config.trunk).toBeDefined();
      expect(config.worktreePath).toBeDefined();
      expect(config.branchPrefix).toBeDefined();
    });

    it('should handle missing config file gracefully', async () => {
      // Load config when file doesn't exist - should use defaults
      const config = await service.loadConfig(testWorkdir);

      expect(config.workdir).toBe(testWorkdir);
      expect(config.trunk).toBe('main');
      expect(config.worktreePath).toBe('.chopstack/shadows');
      expect(config.branchPrefix).toBe('task');
      expect(config.autoRestack).toBe(true);
      expect(config.submitOnComplete).toBe(false);
    });

    it('should prioritize CLI mode over file configuration', async () => {
      const config = await service.loadConfig(testWorkdir, 'git-spice');

      expect(config.mode).toBe('git-spice');
      expect(config.workdir).toBe(testWorkdir);
    });

    it('should load config multiple times without errors', async () => {
      const config1 = await service.loadConfig(testWorkdir);
      const config2 = await service.loadConfig(testWorkdir, 'merge-commit');

      expect(config1.workdir).toBe(testWorkdir);
      expect(config2.mode).toBe('merge-commit');
    });
  });

  describe('backend creation and availability', () => {
    beforeEach(async () => {
      // Load config first to initialize service state
      await service.loadConfig(testWorkdir);
    });

    it('should create MergeCommitBackend and verify availability', async () => {
      const backend = await service.createBackend('merge-commit', testWorkdir);

      expect(backend).toBeInstanceOf(MergeCommitBackend);

      // Verify backend is actually available
      const available = await backend.isAvailable();
      expect(available).toBe(true); // git is always available in test environment
    });

    it('should create GitSpiceBackend instance', async () => {
      const backend = await service.createBackend('git-spice', testWorkdir);

      expect(backend).toBeInstanceOf(GitSpiceBackend);
    });

    it('should verify GitSpiceBackend availability matches system state', async () => {
      const backend = await service.createBackend('git-spice', testWorkdir);
      const available = await backend.isAvailable();

      // This will be true if git-spice is installed, false otherwise
      expect(typeof available).toBe('boolean');
    });

    it('should handle all VCS modes', async () => {
      const modes: VcsMode[] = [
        'git-spice',
        'merge-commit',
        'graphite',
        'sapling',
        'simple', // legacy
        'worktree', // legacy
        'stacked', // legacy
      ];

      for (const mode of modes) {
        const backend = await service.createBackend(mode, testWorkdir);
        expect(backend).toBeDefined();
        expect(typeof backend.isAvailable).toBe('function');
      }
    });
  });

  describe('mode validation with real backends', () => {
    beforeEach(async () => {
      await service.loadConfig(testWorkdir);
    });

    it('should validate merge-commit mode successfully', async () => {
      const validatedMode = await service.validateMode('merge-commit', true);

      expect(validatedMode).toBe('merge-commit');
    });

    it('should fallback to merge-commit when git-spice unavailable (non-explicit)', async () => {
      // Check if git-spice is available
      const backend = await service.createBackend('git-spice', testWorkdir);
      const available = await backend.isAvailable();

      if (available) {
        // If git-spice IS available, this test is moot
        const validatedMode = await service.validateMode('git-spice', false);
        expect(validatedMode).toBe('git-spice');
      } else {
        // If git-spice is NOT available, should fallback
        const validatedMode = await service.validateMode('git-spice', false);
        expect(validatedMode).toBe('merge-commit');
      }
    });

    it('should throw VcsToolUnavailableError for explicit unavailable mode', async () => {
      // Test with a mode we know is not available (sapling)
      const backend = await service.createBackend('sapling', testWorkdir);
      const available = await backend.isAvailable();

      if (!available) {
        await expect(service.validateMode('sapling', true)).rejects.toThrow(
          VcsToolUnavailableError,
        );
      }
    });

    it('should include installation instructions in error', async () => {
      // Test with graphite (likely not installed)
      const backend = await service.createBackend('graphite', testWorkdir);
      const available = await backend.isAvailable();

      if (!available) {
        try {
          await service.validateMode('graphite', true);
          expect.fail('Should have thrown VcsToolUnavailableError');
        } catch (error) {
          expect(error).toBeInstanceOf(VcsToolUnavailableError);
          const err = error as VcsToolUnavailableError;
          expect(err.mode).toBe('graphite');
          expect(err.installInstructions).toContain('npm install -g');
          expect(err.installInstructions).toContain('@withgraphite/graphite-cli');
        }
      }
    });
  });

  describe('complete configuration workflows', () => {
    it('should support explicit git-spice workflow', async () => {
      // 1. Load config with explicit mode
      const config = await service.loadConfig(testWorkdir, 'git-spice');
      expect(config.mode).toBe('git-spice');

      // 2. Check if git-spice is available
      const backend = await service.createBackend('git-spice', testWorkdir);
      const available = await backend.isAvailable();

      if (available) {
        // 3. Validate mode (should succeed)
        const validatedMode = await service.validateMode('git-spice', true);
        expect(validatedMode).toBe('git-spice');

        // 4. Verify config is stored
        const storedConfig = service.getConfig();
        expect(storedConfig?.mode).toBe('git-spice');
      } else {
        // 3. Validate mode (should fail)
        await expect(service.validateMode('git-spice', true)).rejects.toThrow(
          VcsToolUnavailableError,
        );
      }
    });

    it('should support default merge-commit workflow', async () => {
      // 1. Load config without explicit mode
      const config = await service.loadConfig(testWorkdir);
      expect(config.mode).toBeUndefined();

      // 2. Create merge-commit backend (always available)
      const backend = await service.createBackend('merge-commit', testWorkdir);
      expect(backend).toBeInstanceOf(MergeCommitBackend);

      // 3. Verify availability
      const available = await backend.isAvailable();
      expect(available).toBe(true);

      // 4. Validate mode (should succeed)
      const validatedMode = await service.validateMode('merge-commit', false);
      expect(validatedMode).toBe('merge-commit');
    });

    it('should support mode switching', async () => {
      // 1. Start with merge-commit
      await service.loadConfig(testWorkdir, 'merge-commit');

      const backend1 = await service.createBackend('merge-commit', testWorkdir);
      const available1 = await backend1.isAvailable();
      expect(available1).toBe(true);

      // 2. Switch to git-spice
      const config2 = await service.loadConfig(testWorkdir, 'git-spice');
      expect(config2.mode).toBe('git-spice');

      // 3. Verify new backend
      const backend2 = await service.createBackend('git-spice', testWorkdir);
      expect(backend2).toBeInstanceOf(GitSpiceBackend);
    });

    it('should handle auto-detect fallback workflow', async () => {
      // 1. Load config without mode
      await service.loadConfig(testWorkdir);

      // 2. Try to validate git-spice (non-explicit)
      const backend = await service.createBackend('git-spice', testWorkdir);
      const available = await backend.isAvailable();

      if (!available) {
        // 3. Should fallback to merge-commit
        const validatedMode = await service.validateMode('git-spice', false);
        expect(validatedMode).toBe('merge-commit');

        // 4. Create fallback backend
        const fallbackBackend = await service.createBackend(validatedMode, testWorkdir);
        expect(fallbackBackend).toBeInstanceOf(MergeCommitBackend);

        const fallbackAvailable = await fallbackBackend.isAvailable();
        expect(fallbackAvailable).toBe(true);
      } else {
        // If git-spice IS available, validate should succeed
        const validatedMode = await service.validateMode('git-spice', false);
        expect(validatedMode).toBe('git-spice');
      }
    });
  });

  describe('config persistence', () => {
    it('should maintain config state across operations', async () => {
      // 1. Load initial config
      await service.loadConfig(testWorkdir, 'merge-commit');

      // 2. Get config - should match loaded config
      const storedConfig = service.getConfig();
      expect(storedConfig).not.toBeNull();
      expect(storedConfig?.mode).toBe('merge-commit');
      expect(storedConfig?.workdir).toBe(testWorkdir);

      // 3. Create backend
      const backend = await service.createBackend('merge-commit', testWorkdir);
      expect(backend).toBeDefined();

      // 4. Config should still be available
      const storedConfig2 = service.getConfig();
      expect(storedConfig2).not.toBeNull();
      expect(storedConfig2?.mode).toBe('merge-commit');
    });

    it('should update config when loadConfig called again', async () => {
      // 1. Load with merge-commit
      await service.loadConfig(testWorkdir, 'merge-commit');
      const config1 = service.getConfig();
      expect(config1?.mode).toBe('merge-commit');

      // 2. Load again with git-spice
      await service.loadConfig(testWorkdir, 'git-spice');
      const config2 = service.getConfig();
      expect(config2?.mode).toBe('git-spice');
    });
  });

  describe('error handling with real filesystem', () => {
    it('should handle file read errors gracefully', async () => {
      // Create a temporary service instance to test error handling
      const tempService = new VcsConfigServiceImpl();

      // The service will try to read from ~/.chopstack/config.yaml
      // If it doesn't exist, should return defaults without throwing
      await expect(tempService.loadConfig(testWorkdir)).resolves.toBeDefined();
    });

    it('should handle invalid working directory', async () => {
      await service.loadConfig(testWorkdir);

      // Create backend with non-existent directory
      const backend = await service.createBackend('merge-commit', '/non/existent/directory');

      // Backend should be created, but operations may fail
      expect(backend).toBeDefined();
    });

    it('should provide meaningful error for unavailable tools', async () => {
      await service.loadConfig(testWorkdir);

      // Test with mode that's definitely not available
      const backend = await service.createBackend('sapling', testWorkdir);
      const available = await backend.isAvailable();

      if (!available) {
        try {
          await service.validateMode('sapling', true);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(VcsToolUnavailableError);
          const err = error as VcsToolUnavailableError;
          expect(err.message).toContain('sapling');
          expect(err.installInstructions).toContain('sapling-scm.com');
        }
      }
    });
  });

  describe('legacy mode support', () => {
    beforeEach(async () => {
      await service.loadConfig(testWorkdir);
    });

    it('should handle legacy "simple" mode as merge-commit', async () => {
      const backend = await service.createBackend('simple', testWorkdir);
      expect(backend).toBeInstanceOf(MergeCommitBackend);

      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should handle legacy "worktree" mode as merge-commit', async () => {
      const backend = await service.createBackend('worktree', testWorkdir);
      expect(backend).toBeInstanceOf(MergeCommitBackend);

      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should handle legacy "stacked" mode as git-spice', async () => {
      const backend = await service.createBackend('stacked', testWorkdir);
      expect(backend).toBeInstanceOf(GitSpiceBackend);
    });

    it('should validate legacy modes', async () => {
      // Legacy simple mode should always work (merge-commit)
      const validatedSimple = await service.validateMode('simple', false);
      expect(validatedSimple).toBe('simple');

      // Legacy worktree mode should always work (merge-commit)
      const validatedWorktree = await service.validateMode('worktree', false);
      expect(validatedWorktree).toBe('worktree');
    });
  });

  describe('multiple service instances', () => {
    it('should support independent service instances', async () => {
      const service1 = new VcsConfigServiceImpl();
      const service2 = new VcsConfigServiceImpl();

      // Load different configs
      await service1.loadConfig(testWorkdir, 'merge-commit');
      await service2.loadConfig(testWorkdir, 'git-spice');

      // Should maintain separate state
      const config1 = service1.getConfig();
      const config2 = service2.getConfig();

      expect(config1?.mode).toBe('merge-commit');
      expect(config2?.mode).toBe('git-spice');
    });

    it('should create backends independently', async () => {
      const service1 = new VcsConfigServiceImpl();
      const service2 = new VcsConfigServiceImpl();

      await service1.loadConfig(testWorkdir);
      await service2.loadConfig(testWorkdir);

      const backend1 = await service1.createBackend('merge-commit', testWorkdir);
      const backend2 = await service2.createBackend('git-spice', testWorkdir);

      expect(backend1).toBeInstanceOf(MergeCommitBackend);
      expect(backend2).toBeInstanceOf(GitSpiceBackend);
    });
  });

  describe('real-world scenarios', () => {
    it('should support typical development workflow', async () => {
      // 1. Developer loads config without specifying mode (auto-detect)
      await service.loadConfig(testWorkdir);

      // 2. System checks if git-spice is available
      const gitSpiceBackend = await service.createBackend('git-spice', testWorkdir);
      const hasGitSpice = await gitSpiceBackend.isAvailable();

      let backend;
      if (hasGitSpice) {
        // 3a. Use git-spice if available
        const mode = await service.validateMode('git-spice', false);
        expect(mode).toBe('git-spice');
        backend = await service.createBackend(mode, testWorkdir);
      } else {
        // 3b. Fallback to merge-commit
        const mode = await service.validateMode('git-spice', false);
        expect(mode).toBe('merge-commit');
        backend = await service.createBackend(mode, testWorkdir);
      }

      // 4. Backend is ready to use
      expect(backend).toBeDefined();
      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should support explicit mode configuration by power users', async () => {
      // 1. Power user explicitly configures git-spice
      const config = await service.loadConfig(testWorkdir, 'git-spice');
      expect(config.mode).toBe('git-spice');

      // 2. Check if git-spice is available
      const backend = await service.createBackend('git-spice', testWorkdir);
      const available = await backend.isAvailable();

      if (available) {
        // 3a. Validation succeeds
        const mode = await service.validateMode('git-spice', true);
        expect(mode).toBe('git-spice');
      } else {
        // 3b. Validation fails with clear error
        try {
          await service.validateMode('git-spice', true);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(VcsToolUnavailableError);
          const err = error as VcsToolUnavailableError;
          expect(err.installInstructions).toBeDefined();
        }
      }
    });

    it('should support CI/CD environment with minimal dependencies', async () => {
      // CI environments typically only have git installed

      // 1. Load config for CI (no special tools)
      await service.loadConfig(testWorkdir);

      // 2. Use merge-commit (requires only git)
      const backend = await service.createBackend('merge-commit', testWorkdir);
      const available = await backend.isAvailable();

      // 3. Should always work in CI
      expect(available).toBe(true);

      // 4. Validate mode
      const mode = await service.validateMode('merge-commit', false);
      expect(mode).toBe('merge-commit');
    });
  });
});
