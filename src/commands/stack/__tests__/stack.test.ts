import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultDependencies, StackCommand } from '@/commands';

// Mock the CommitMessageGenerator
vi.mock('@/vcs/commit-message-generator', () => ({
  CommitMessageGenerator: vi.fn().mockImplementation(() => ({
    generateCommitMessage: vi.fn().mockResolvedValue('feat: Update implementation'),
    generateFromDiff: vi.fn().mockResolvedValue('feat: Update implementation'),
  })),
}));

// Mock execa
vi.mock('execa', () => ({
  execaSync: vi.fn(),
  execa: vi.fn().mockResolvedValue({
    stdout: 'feat: Update implementation\n\n- Modified file1.ts\n- Added file2.ts',
    stderr: '',
    exitCode: 0,
  }),
}));

// Mock chalk to avoid color codes in test output
vi.mock('chalk', () => ({
  default: {
    blue: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    red: (text: string) => text,
    cyan: (text: string) => text,
    gray: (text: string) => text,
    white: (text: string) => text,
    dim: (text: string) => text,
    magenta: (text: string) => text,
  },
}));

describe('stackCommand', () => {
  let execaSyncMock: ReturnType<typeof vi.fn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { execaSync } = await import('execa');
    execaSyncMock = execaSync as unknown as ReturnType<typeof vi.fn>;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('without changes', () => {
    it('should return 1 when no changes to commit', async () => {
      // Mock git status with no changes
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({});

      expect(result).toBe(1);
      expect(execaSyncMock).toHaveBeenCalledWith('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No changes to commit'));
    });
  });

  describe('with changes', () => {
    const mockChanges = 'M  src/file1.ts\nA  src/file2.ts';

    beforeEach(() => {
      // Mock git status with changes
      execaSyncMock.mockReturnValueOnce({
        stdout: mockChanges,
        stderr: '',
        exitCode: 0,
      });
    });

    it('should create a regular commit when createStack is false', async () => {
      // Mock git commit success
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({ createStack: false, autoAdd: false });

      expect(result).toBe(0);
      expect(execaSyncMock).toHaveBeenCalledWith('git', [
        'commit',
        '-m',
        expect.stringContaining('Update'),
      ]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created commit with message:'),
      );
    });

    it('should add all changes when autoAdd is true', async () => {
      // Mock git add
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      // Mock git commit
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({ createStack: false, autoAdd: true });

      expect(result).toBe(0);
      expect(execaSyncMock).toHaveBeenCalledWith('git', ['add', '-A']);
    });

    describe('git-spice stack creation', () => {
      it('should check for git-spice availability', async () => {
        // Mock gs --version failure
        execaSyncMock.mockImplementationOnce(() => {
          throw new Error('Command not found');
        });

        // Mock git commit for fallback
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        const deps = createDefaultDependencies();
        const command = new StackCommand(deps);
        const result = await command.execute({ createStack: true, autoAdd: false });

        expect(result).toBe(0); // Falls back to regular commit
        expect(execaSyncMock).toHaveBeenCalledWith('gs', ['--version']);
        // The warning about git-spice is logged via logger.warn which goes to console.warn
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('git-spice (gs) is not installed'),
        );
      });

      it('should create git-spice branch when gs is available', async () => {
        // Mock gs --version success
        execaSyncMock.mockReturnValueOnce({
          stdout: 'git-spice version 1.0.0',
          stderr: '',
          exitCode: 0,
        });

        // Mock gs branch create success
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        // Mock git commit success (git-spice commits after creating branch)
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        const deps = createDefaultDependencies();
        const command = new StackCommand(deps);
        const result = await command.execute({ createStack: true, autoAdd: false });

        expect(result).toBe(0);
        expect(execaSyncMock).toHaveBeenCalledWith('gs', [
          'branch',
          'create',
          expect.stringMatching(/^stack-/),
        ]);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Created git-spice branch:'),
        );
      });

      it('should handle git-spice branch creation failure', async () => {
        // Mock gs --version success
        execaSyncMock.mockReturnValueOnce({
          stdout: 'git-spice version 1.0.0',
          stderr: '',
          exitCode: 0,
        });

        // Mock gs branch create failure
        execaSyncMock.mockImplementationOnce(() => {
          const error = new Error('Branch already exists');
          (error as any).exitCode = 1;
          throw error;
        });

        const deps = createDefaultDependencies();
        const command = new StackCommand(deps);
        const result = await command.execute({ createStack: true, autoAdd: false });

        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create git-spice branch'),
        );
      });

      it('should show verbose output when verbose is true', async () => {
        // Mock gs --version success
        execaSyncMock.mockReturnValueOnce({
          stdout: 'git-spice version 1.0.0',
          stderr: '',
          exitCode: 0,
        });

        // Mock gs branch create success
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        // Mock git commit success
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        const deps = createDefaultDependencies();
        const command = new StackCommand(deps);
        const result = await command.execute({ createStack: true, autoAdd: false, verbose: true });

        expect(result).toBe(0);
        // Verbose doesn't change the command call, just the logging
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Created git-spice branch:'),
        );
      });
    });

    it('should handle git commit failure gracefully', async () => {
      // Mock git commit failure
      execaSyncMock.mockImplementationOnce(() => {
        throw new Error('Failed to commit');
      });

      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({ createStack: false, autoAdd: false });

      expect(result).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create commit'),
      );
    });

    it('should pass verbose flag through to git operations', async () => {
      // Mock git commit
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({ createStack: false, autoAdd: false, verbose: true });

      expect(result).toBe(0);
      // Verbose doesn't change how git commands are called (stdio mode)
      expect(execaSyncMock).toHaveBeenCalledWith('git', [
        'commit',
        '-m',
        expect.stringContaining('Update'),
      ]);
    });
  });

  describe('argument validation', () => {
    it('should handle invalid arguments', async () => {
      // When passing undefined, validateStackArgs will throw
      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute(undefined);

      // Stack command returns 1 on errors
      expect(result).toBe(1);
    });

    it('should return 1 on invalid argument types', async () => {
      // The validateStackArgs function should fail validation
      const deps = createDefaultDependencies();
      const command = new StackCommand(deps);
      const result = await command.execute({ createStack: 'not-a-boolean' } as any);

      // Stack command returns 1 on validation errors
      expect(result).toBe(1);
    });
  });
});
