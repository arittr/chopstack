import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRunner } from '../agent-runner';
import { ProcessSpawnError } from '../errors';

vi.mock('node:child_process');

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockProcess: ChildProcess;
  let mockStdout: PassThrough;
  let mockStderr: PassThrough;

  beforeEach(() => {
    runner = new AgentRunner();

    // Create mock streams
    mockStdout = new PassThrough();
    mockStderr = new PassThrough();

    // Create mock child process with proper typing
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: new Writable(),
      stdio: [null, mockStdout, mockStderr, null, null] as const,
      killed: false,
      connected: true,
      pid: 12_345,
      exitCode: null,
      signalCode: null,
      spawnargs: [],
      spawnfile: '',
      kill: vi.fn(() => true),
      send: vi.fn(),
      disconnect: vi.fn(),
      unref: vi.fn(),
      ref: vi.fn(),
      [Symbol.dispose]: vi.fn(),
    }) as unknown as ChildProcess;

    vi.mocked(spawn).mockReturnValue(mockProcess);
  });

  describe('execute', () => {
    it('should execute command and return result', async () => {
      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'echo',
        args: ['hello'],
        workdir: '/test',
      });

      // Simulate process output and completion
      mockStdout.write('hello world\n');
      mockStderr.write('warning\n');
      mockProcess.emit('close', 0);

      const result = await executePromise;

      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('hello world\n');
      expect(result.stderr).toBe('warning\n');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-zero exit codes', async () => {
      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'false',
        args: [],
      });

      mockProcess.emit('close', 1);

      const result = await executePromise;
      expect(result.exitCode).toBe(1);
    });

    it('should throw ProcessSpawnError on spawn failure', async () => {
      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'nonexistent',
        args: [],
      });

      const spawnError = new Error('spawn ENOENT');
      mockProcess.emit('error', spawnError);

      await expect(executePromise).rejects.toThrow(ProcessSpawnError);
      await expect(executePromise).rejects.toMatchObject({
        taskId: 'test-1',
        command: 'nonexistent',
        originalError: spawnError,
      });
    });

    it('should call stdout callback', async () => {
      const onStdout = vi.fn();

      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'echo',
        args: ['test'],
        onStdout,
      });

      mockStdout.write('line 1\n');
      mockStdout.write('line 2\n');
      mockProcess.emit('close', 0);

      await executePromise;

      expect(onStdout).toHaveBeenCalledWith('line 1\n');
      expect(onStdout).toHaveBeenCalledWith('line 2\n');
    });

    it('should call stderr callback', async () => {
      const onStderr = vi.fn();

      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'echo',
        args: ['test'],
        onStderr,
      });

      mockStderr.write('error 1\n');
      mockStderr.write('error 2\n');
      mockProcess.emit('close', 0);

      await executePromise;

      expect(onStderr).toHaveBeenCalledWith('error 1\n');
      expect(onStderr).toHaveBeenCalledWith('error 2\n');
    });

    it('should track running processes', async () => {
      expect(runner.isRunning('test-1')).toBe(false);

      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'sleep',
        args: ['1'],
      });

      // Process should be running
      expect(runner.isRunning('test-1')).toBe(true);
      expect(runner.getRunningTasks()).toContain('test-1');

      // Complete the process
      mockProcess.emit('close', 0);
      await executePromise;

      // Process should no longer be running
      expect(runner.isRunning('test-1')).toBe(false);
      expect(runner.getRunningTasks()).not.toContain('test-1');
    });

    it('should use custom environment variables', async () => {
      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'echo',
        args: ['test'],
        env: { CUSTOM_VAR: 'value' },
      });

      mockProcess.emit('close', 0);
      await executePromise;

      expect(spawn).toHaveBeenCalledWith(
        'echo',
        ['test'],
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'value',
          }),
        }),
      );
    });
  });

  describe('stop', () => {
    it('should stop running process', async () => {
      const executePromise = runner.execute({
        taskId: 'test-1',
        command: 'sleep',
        args: ['10'],
      });

      // Process is running
      expect(runner.isRunning('test-1')).toBe(true);

      // Stop it
      const stopped = runner.stop('test-1');
      expect(stopped).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Process should no longer be running
      expect(runner.isRunning('test-1')).toBe(false);

      // Emit close to complete the promise
      mockProcess.emit('close', -1);
      await executePromise;
    });

    it('should return false for non-existent task', () => {
      const stopped = runner.stop('nonexistent');
      expect(stopped).toBe(false);
    });

    it('should not track stopped processes', () => {
      // Start a process
      void runner.execute({
        taskId: 'test-1',
        command: 'sleep',
        args: ['10'],
      });

      expect(runner.getRunningTasks()).toContain('test-1');

      // Stop it
      runner.stop('test-1');

      expect(runner.getRunningTasks()).not.toContain('test-1');
    });
  });

  describe('isRunning', () => {
    it('should return false for never-started task', () => {
      expect(runner.isRunning('never-started')).toBe(false);
    });

    it('should track multiple running tasks', () => {
      void runner.execute({
        taskId: 'task-1',
        command: 'sleep',
        args: ['1'],
      });

      void runner.execute({
        taskId: 'task-2',
        command: 'sleep',
        args: ['1'],
      });

      expect(runner.isRunning('task-1')).toBe(true);
      expect(runner.isRunning('task-2')).toBe(true);
      expect(runner.getRunningTasks()).toHaveLength(2);
    });
  });
});
