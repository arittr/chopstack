import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stackCommand } from '@/commands/stack';

// Mock execa
vi.mock('execa', () => ({
  execaSync: vi.fn(),
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

  beforeEach(async () => {
    const { execaSync } = await import('execa');
    execaSyncMock = execaSync as unknown as ReturnType<typeof vi.fn>;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('without changes', () => {
    it('should return 1 when no changes to commit', () => {
      // Mock git status with no changes
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = stackCommand({});

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

      // Mock claude --version check (not available)
      execaSyncMock.mockImplementationOnce((cmd: string) => {
        if (cmd === 'claude') {
          throw new Error('Command not found');
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });
    });

    it('should create a regular commit when createStack is false', () => {
      // Mock git commit success
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = stackCommand({ createStack: false, autoAdd: false });

      expect(result).toBe(0);
      expect(execaSyncMock).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.stringContaining('Update')],
        expect.objectContaining({ stdio: 'pipe' }),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Commit created successfully'),
      );
    });

    it('should add all changes when autoAdd is true', () => {
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

      const result = stackCommand({ createStack: false, autoAdd: true });

      expect(result).toBe(0);
      expect(execaSyncMock).toHaveBeenCalledWith('git', ['add', '-A']);
    });

    describe('git-spice stack creation', () => {
      it('should check for git-spice availability', () => {
        // Mock gs --version failure
        execaSyncMock.mockImplementationOnce(() => {
          throw new Error('Command not found');
        });

        const result = stackCommand({ createStack: true, autoAdd: false });

        expect(result).toBe(1);
        expect(execaSyncMock).toHaveBeenCalledWith('gs', ['--version'], { stdio: 'pipe' });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('git-spice (gs) not available'),
        );
      });

      it('should create git-spice branch when gs is available', () => {
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

        const result = stackCommand({ createStack: true, autoAdd: false });

        expect(result).toBe(0);
        expect(execaSyncMock).toHaveBeenCalledWith(
          'gs',
          ['branch', 'create', expect.any(String), '--message', expect.any(String)],
          expect.objectContaining({ encoding: 'utf8' }),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Git-spice branch created successfully'),
        );
      });

      it('should handle git-spice branch creation failure', () => {
        // Mock gs --version success
        execaSyncMock.mockReturnValueOnce({
          stdout: 'git-spice version 1.0.0',
          stderr: '',
          exitCode: 0,
        });

        // Mock gs branch create failure
        execaSyncMock.mockReturnValueOnce({
          stdout: '',
          stderr: 'Branch already exists',
          exitCode: 1,
        });

        const result = stackCommand({ createStack: true, autoAdd: false });

        expect(result).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create git-spice branch'),
        );
      });

      it('should show verbose output when verbose is true', () => {
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

        const result = stackCommand({ createStack: true, autoAdd: false, verbose: true });

        expect(result).toBe(0);
        expect(execaSyncMock).toHaveBeenCalledWith(
          'gs',
          expect.any(Array),
          expect.objectContaining({ stdio: 'inherit' }),
        );
      });
    });

    it('should handle git commit failure gracefully', () => {
      // Mock git commit failure
      execaSyncMock.mockImplementationOnce(() => {
        throw new Error('Failed to commit');
      });

      const result = stackCommand({ createStack: false, autoAdd: false });

      expect(result).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create commit'),
      );
    });

    it('should pass verbose flag through to git operations', () => {
      // Mock git commit
      execaSyncMock.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = stackCommand({ createStack: false, autoAdd: false, verbose: true });

      expect(result).toBe(0);
      expect(execaSyncMock).toHaveBeenCalledWith(
        'git',
        expect.any(Array),
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });
  });

  describe('argument validation', () => {
    it('should handle invalid arguments', () => {
      // When passing undefined, validateStackArgs will throw
      const result = stackCommand(undefined);

      // Stack command returns 1 on errors
      expect(result).toBe(1);
    });

    it('should return 1 on invalid argument types', () => {
      // The validateStackArgs function should fail validation
      const result = stackCommand({ createStack: 'not-a-boolean' });

      // Stack command returns 1 on validation errors
      expect(result).toBe(1);
    });
  });
});
