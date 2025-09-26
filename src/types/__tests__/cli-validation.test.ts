import { describe, expect, it } from 'vitest';

import { validateDecomposeArgs, validateRunArgs, validateStackArgs } from '../cli';

describe('CLI argument validation', () => {
  describe('validateDecomposeArgs', () => {
    it('should validate valid decompose arguments', () => {
      const args = {
        spec: 'spec.md',
        output: 'plan.yaml',
        agent: 'claude',
        verbose: true,
      };

      expect(() => validateDecomposeArgs(args)).not.toThrow();
      const result = validateDecomposeArgs(args);
      expect(result.spec).toBe('spec.md');
      expect(result.agent).toBe('claude');
      expect(result.verbose).toBe(true);
    });

    it('should require agent field', () => {
      const args = {
        spec: 'spec.md',
        output: 'plan.yaml',
        // agent is required
      };

      expect(() => validateDecomposeArgs(args)).toThrow();
    });

    it('should throw for missing required fields', () => {
      const args = {
        output: 'plan.yaml',
      };

      expect(() => validateDecomposeArgs(args)).toThrow();
    });
  });

  describe('validateRunArgs', () => {
    it('should validate run arguments with spec', () => {
      const args = {
        spec: 'spec.md',
        mode: 'execute',
        strategy: 'parallel',
      };

      const result = validateRunArgs(args);
      expect(result.spec).toBe('spec.md');
      expect(result.mode).toBe('execute');
      expect(result.vcsMode).toBe('simple');
    });

    it('should validate run arguments with plan', () => {
      const args = {
        plan: 'plan.yaml',
        mode: 'plan',
        vcsMode: 'simple',
      };

      const result = validateRunArgs(args);
      expect(result.plan).toBe('plan.yaml');
      expect(result.mode).toBe('plan');
      expect(result.vcsMode).toBe('simple');
    });

    it('should require either spec or plan', () => {
      const args = {
        mode: 'execute',
        strategy: 'parallel',
      };

      // Schema has a refine that requires either spec or plan
      expect(() => validateRunArgs(args)).toThrow();
    });

    it('should validate execution modes', () => {
      const validModes = ['execute', 'plan', 'dry-run', 'validate'];

      for (const mode of validModes) {
        const args = { spec: 'spec.md', mode, strategy: 'serial' };
        const result = validateRunArgs(args);
        expect(result.mode).toBe(mode);
      }
    });

    it('should validate VCS modes', () => {
      const validModes = ['simple', 'worktree', 'stacked'];

      for (const vcsMode of validModes) {
        const args = { spec: 'spec.md', vcsMode, mode: 'execute' };
        const result = validateRunArgs(args);
        expect(result.vcsMode).toBe(vcsMode);
      }
    });
  });

  describe('validateStackArgs', () => {
    it('should validate stack arguments', () => {
      const args = {
        message: 'feat: Add new feature',
        createStack: true,
        autoAdd: true,
        verbose: false,
      };

      const result = validateStackArgs(args);
      expect(result.message).toBe('feat: Add new feature');
      expect(result.createStack).toBe(true);
      expect(result.autoAdd).toBe(true);
      expect(result.verbose).toBe(false);
    });

    it('should provide defaults for optional stack fields', () => {
      const args = {};

      const result = validateStackArgs(args);
      expect(result.createStack).toBe(false);
      expect(result.autoAdd).toBe(false); // Default is false
      expect(result.verbose).toBe(false);
    });

    it('should accept empty arguments object', () => {
      expect(() => validateStackArgs({})).not.toThrow();
    });
  });
});
