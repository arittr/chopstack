import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isNonNullish } from '@/validation/guards';

import type { StreamingUpdate, TaskExecutionAdapter } from '../types';

import { TaskExecutionError } from '../errors';
import { TaskOrchestrator } from '../task-orchestrator';

describe('TaskOrchestrator', () => {
  let orchestrator: TaskOrchestrator;
  let mockAdapter: TaskExecutionAdapter;
  let emittedUpdates: StreamingUpdate[];

  beforeEach(() => {
    emittedUpdates = [];
    mockAdapter = {
      executeTask: vi.fn(),
      stopTask: vi.fn(),
      getAllTaskStatuses: vi.fn(),
    };
    orchestrator = new TaskOrchestrator(mockAdapter);
    orchestrator.on('taskUpdate', (update: StreamingUpdate) => emittedUpdates.push(update));
  });

  describe('executeTask', () => {
    it('should successfully execute a task', async () => {
      const mockResult = {
        taskId: 'task-1',
        mode: 'execute' as const,
        status: 'completed' as const,
        output: 'Task completed successfully',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
      };

      vi.mocked(mockAdapter.executeTask).mockResolvedValue(mockResult);

      const result = await orchestrator.executeTask(
        'task-1',
        'Test Task',
        'Do something',
        ['file1.ts'],
        '/test',
        'execute',
      );

      expect(result).toEqual(mockResult);
      expect(orchestrator.getTaskStatus('task-1')).toBe('completed');
      expect(orchestrator.getTaskOutput('task-1')).toBe('Task completed successfully');
    });

    it('should throw TaskExecutionError when adapter throws', async () => {
      const error = new TaskExecutionError('Task failed', 'task-1', undefined, 127, {
        stderr: 'Command not found',
      });

      vi.mocked(mockAdapter.executeTask).mockRejectedValue(error);

      await expect(
        orchestrator.executeTask('task-1', 'Test Task', 'Do something', [], '/test'),
      ).rejects.toThrow(TaskExecutionError);

      expect(orchestrator.getTaskStatus('task-1')).toBe('failed');
    });

    it('should wrap non-Error exceptions in TaskExecutionError', async () => {
      vi.mocked(mockAdapter.executeTask).mockRejectedValue('String error');

      await expect(
        orchestrator.executeTask('task-1', 'Test Task', 'Do something', []),
      ).rejects.toThrow(TaskExecutionError);

      const status = orchestrator.getTaskStatus('task-1');
      expect(status).toBe('failed');
    });

    it('should handle streaming updates correctly', async () => {
      vi.mocked(mockAdapter.executeTask).mockImplementation(async (_req, emitUpdate) => {
        await Promise.resolve();
        // Emit some updates
        emitUpdate({
          taskId: 'task-1',
          type: 'stdout',
          data: 'Starting task...',
          timestamp: new Date(),
        });

        emitUpdate({
          taskId: 'task-1',
          type: 'stderr',
          data: 'Warning: something',
          timestamp: new Date(),
        });

        emitUpdate({
          taskId: 'task-1',
          type: 'status',
          data: 'completed',
          timestamp: new Date(),
        });

        return {
          taskId: 'task-1',
          mode: 'execute' as const,
          status: 'completed' as const,
          output: 'Done',
          startTime: new Date(),
          endTime: new Date(),
        };
      });

      await orchestrator.executeTask('task-1', 'Test', 'Do it', []);

      // Check that updates were emitted
      expect(emittedUpdates.length).toBeGreaterThan(0);
      expect(emittedUpdates).toContainEqual(
        expect.objectContaining({
          taskId: 'task-1',
          type: 'stdout',
          data: 'Starting task...',
        }),
      );
      expect(emittedUpdates).toContainEqual(
        expect.objectContaining({
          taskId: 'task-1',
          type: 'stderr',
          data: 'Warning: something',
        }),
      );

      // Check output was recorded
      const output = orchestrator.getTaskOutput('task-1');
      expect(output).toContain('Starting task...');
      expect(output).toContain('[stderr] Warning: something');
    });

    it('should clean up resources on error', async () => {
      vi.mocked(mockAdapter.executeTask).mockRejectedValue(new Error('Failed'));

      await expect(orchestrator.executeTask('task-1', 'Test', 'Do it', [])).rejects.toThrow();

      // Task should not be in active tasks
      expect(orchestrator.getRunningTasks()).not.toContain('task-1');
    });
  });

  describe('stopTask', () => {
    it('should stop a task successfully', () => {
      if (isNonNullish(mockAdapter.stopTask)) {
        vi.mocked(mockAdapter.stopTask).mockReturnValue(true);
      }

      const stopped = orchestrator.stopTask('task-1');

      expect(stopped).toBe(true);
      if (isNonNullish(mockAdapter.stopTask)) {
        expect(mockAdapter.stopTask).toHaveBeenCalledWith('task-1');
      }
    });

    it('should handle when adapter does not support stopping', () => {
      delete mockAdapter.stopTask;

      const stopped = orchestrator.stopTask('task-1');

      expect(stopped).toBe(false);
    });

    it('should emit status update when task is stopped', () => {
      if (isNonNullish(mockAdapter.stopTask)) {
        vi.mocked(mockAdapter.stopTask).mockReturnValue(true);
      }

      orchestrator.stopTask('task-1');

      expect(emittedUpdates).toContainEqual(
        expect.objectContaining({
          taskId: 'task-1',
          type: 'status',
          data: 'stopped',
        }),
      );
    });
  });

  describe('getTaskStatus', () => {
    it('should return undefined for unknown task', () => {
      expect(orchestrator.getTaskStatus('unknown')).toBeUndefined();
    });

    it('should track task status through execution', async () => {
      vi.mocked(mockAdapter.executeTask).mockImplementation(async () => {
        await Promise.resolve();
        // Check status is running during execution
        expect(orchestrator.getTaskStatus('task-1')).toBe('running');

        return {
          taskId: 'task-1',
          mode: 'execute' as const,
          status: 'completed' as const,
          output: 'Done',
        };
      });

      await orchestrator.executeTask('task-1', 'Test', 'Do it', []);

      expect(orchestrator.getTaskStatus('task-1')).toBe('completed');
    });
  });

  describe('getAllTaskStatuses', () => {
    it('should return copy of statuses map', async () => {
      vi.mocked(mockAdapter.executeTask).mockResolvedValue({
        taskId: 'task-1',
        mode: 'execute',
        status: 'completed',
        output: 'Done',
      });

      await orchestrator.executeTask('task-1', 'Test', 'Do it', []);

      const statuses = orchestrator.getAllTaskStatuses();
      expect(statuses.get('task-1')).toBe('completed');

      // Verify it's a copy
      statuses.set('task-1', 'failed');
      expect(orchestrator.getTaskStatus('task-1')).toBe('completed');
    });
  });

  describe('getRunningTasks', () => {
    it('should track running tasks', async () => {
      let resolveTask: () => void;
      const taskPromise = new Promise<void>((resolve) => {
        resolveTask = resolve;
      });

      vi.mocked(mockAdapter.executeTask).mockImplementation(async () => {
        await taskPromise;
        return {
          taskId: 'task-1',
          mode: 'execute',
          status: 'completed',
          output: 'Done',
        };
      });

      const executePromise = orchestrator.executeTask('task-1', 'Test', 'Do it', []);

      // Task should be running
      expect(orchestrator.getRunningTasks()).toContain('task-1');

      // Complete the task
      resolveTask!();
      await executePromise;

      // Task should no longer be running
      expect(orchestrator.getRunningTasks()).not.toContain('task-1');
    });
  });

  describe('error handling', () => {
    it('should preserve error details in TaskExecutionError', async () => {
      const originalError = new TaskExecutionError(
        'Command failed',
        'task-1',
        {
          taskId: 'task-1',
          mode: 'execute',
          status: 'failed',
          output: 'Error output',
          error: 'Command failed',
        },
        127,
        { command: 'claude', args: ['-p', 'test'] },
      );

      vi.mocked(mockAdapter.executeTask).mockRejectedValue(originalError);

      try {
        await orchestrator.executeTask('task-1', 'Test', 'Do it', []);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TaskExecutionError);
        const taskError = error as TaskExecutionError;
        expect(taskError.exitCode).toBe(127);
        expect(taskError.taskId).toBe('task-1');
        expect(taskError.details).toEqual({ command: 'claude', args: ['-p', 'test'] });
      }
    });

    it('should wrap regular Error with context', async () => {
      const originalError = new Error('Network timeout');
      vi.mocked(mockAdapter.executeTask).mockRejectedValue(originalError);

      try {
        await orchestrator.executeTask('task-1', 'Test', 'Do it', []);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TaskExecutionError);
        const taskError = error as TaskExecutionError;
        expect(taskError.message).toBe('Network timeout');
        expect(taskError.taskId).toBe('task-1');
        expect(taskError.details?.originalError).toBe('Error');
      }
    });
  });
});
