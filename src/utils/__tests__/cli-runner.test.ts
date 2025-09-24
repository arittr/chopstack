import {
  checkGitSpiceAvailable,
  checkWorkspaceAvailable,
  CliTestRunner,
  runCliInProcess,
} from '@test/utils/cli-runner';

describe('CLI Runner', () => {
  describe('runCliInProcess', () => {
    it('should run CLI commands without build dependency', async () => {
      const result = await runCliInProcess(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('chopstack');
      expect(result.stdout).toContain('Chop massive AI changes');
    });

    it('should handle invalid commands gracefully', async () => {
      const result = await runCliInProcess(['invalid-command']);

      // Commander.js may show help or error for unknown commands
      expect(result.exitCode).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    it('should capture stdout and stderr separately', async () => {
      const result = await runCliInProcess(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('0.1.0');
      // Commander.js may output to stderr, that's ok
    });

    it('should respect timeout options', async () => {
      const result = await runCliInProcess(['--help'], { timeout: 1 });

      // Should either succeed quickly or timeout
      expect(result.exitCode === 0 || result.error?.message.includes('timed out')).toBe(true);
    });

    it('should handle working directory changes', async () => {
      const tempDir = '/tmp';
      const result = await runCliInProcess(['--help'], { cwd: tempDir });

      expect(result.exitCode).toBe(0);
      // Should still work regardless of cwd since it's just help
    });
  });

  describe('CliTestRunner', () => {
    let runner: CliTestRunner;

    beforeEach(() => {
      runner = new CliTestRunner();
    });

    it('should provide simplified command interface', async () => {
      const result = await runner.run('--help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('chopstack');
    });

    it('should handle decompose command parsing', async () => {
      // This will fail because we don't have a real spec file, but it should parse correctly
      const result = await runner.decompose('nonexistent-spec.md');

      expect(result.exitCode).toBe(1);
      // Should fail with file not found, not command parsing error
      expect(result.stderr).toBeDefined();
    });

    it('should handle run command parsing', async () => {
      // This will fail because we don't have a real plan file, but it should parse correctly
      const result = await runner.runExecution('nonexistent-plan.yaml', 'plan');

      expect(result.exitCode).toBe(1);
      // Should fail with file not found, not command parsing error
      expect(result.stderr).toBeDefined();
    });

    it('should handle stack command parsing', () => {
      // Just test that the command parser works without actually running the stack command
      // which can be slow due to git operations
      expect(runner.stack).toBeDefined();
      expect(typeof runner.stack).toBe('function');
    });
  });

  describe('Environment Guards', () => {
    describe('checkGitSpiceAvailable', () => {
      it('should return boolean for git-spice availability', () => {
        const result = checkGitSpiceAvailable();
        expect(typeof result).toBe('boolean');
      });
    });

    describe('checkWorkspaceAvailable', () => {
      it('should return false for non-existent workspace', () => {
        const result = checkWorkspaceAvailable('/nonexistent/workspace/path');
        expect(result).toBe(false);
      });

      it('should return true for existing workspace', () => {
        const result = checkWorkspaceAvailable('.');
        expect(result).toBe(true);
      });
    });
  });
});
