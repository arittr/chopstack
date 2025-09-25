import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StreamingUpdate, TaskExecutionRequest } from '@/services/orchestration/types';

import { MockTaskExecutionAdapter } from '../mock-task-execution-adapter';

describe('MockTaskExecutionAdapter', () => {
  let adapter: MockTaskExecutionAdapter;
  let mockEmitUpdate: (update: StreamingUpdate) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MockTaskExecutionAdapter();
    mockEmitUpdate = vi.fn();
  });

  describe('executeTask', () => {
    it('should simulate task execution', async () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt with some content',
        files: ['file1.ts', 'file2.ts'],
        mode: 'execute',
      };

      const result = await adapter.executeTask(request, mockEmitUpdate);

      expect(result).toMatchObject({
        taskId: 'test-task',
        status: 'completed',
        duration: expect.any(Number),
        output: expect.stringContaining('[MOCK] Executing task: Test Task'),
      });
    });

    it('should emit status updates during execution', async () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'plan',
      };

      await adapter.executeTask(request, mockEmitUpdate);

      // Should emit running status at start
      expect(mockEmitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'test-task',
          type: 'status',
          data: 'running',
        }),
      );

      // Should emit stdout updates
      expect(mockEmitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'test-task',
          type: 'stdout',
          data: expect.stringContaining('[MOCK] Mode: plan'),
        }),
      );

      // Should emit completed status at end
      expect(mockEmitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'test-task',
          type: 'status',
          data: 'completed',
        }),
      );
    });

    it('should include all task details in mock output', async () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Complex Task',
        prompt: 'A very long prompt that contains many characters',
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        mode: 'execute',
      };

      const result = await adapter.executeTask(request, mockEmitUpdate);

      expect(result.output).toContain('Complex Task');
      expect(result.output).toContain('Mode: execute');
      expect(result.output).toContain('file1.ts, file2.ts, file3.ts');
      expect(result.output).toContain('Prompt length: 48 characters');
    });

    it('should handle task stopping', async () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
      };

      // Start task execution but stop it immediately
      const executionPromise = adapter.executeTask(request, mockEmitUpdate);

      // Stop the task while it's running
      global.setTimeout(() => adapter.stopTask('test-task'), 50);

      const result = await executionPromise;

      expect(result).toMatchObject({
        taskId: 'test-task',
        status: 'stopped',
      });
    });
  });

  describe('stopTask', () => {
    it('should return true when stopping a running task', () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
      };

      // Start task without waiting
      void adapter.executeTask(request, mockEmitUpdate);

      // Task should be running
      const stopped = adapter.stopTask('test-task');
      expect(stopped).toBe(true);
    });

    it('should return false when stopping a non-existent task', () => {
      const stopped = adapter.stopTask('non-existent');
      expect(stopped).toBe(false);
    });
  });

  describe('getAllTaskStatuses', () => {
    it('should return running tasks', () => {
      const request1: TaskExecutionRequest = {
        taskId: 'task-1',
        title: 'Task 1',
        prompt: 'Test',
        files: [],
        mode: 'execute',
      };

      const request2: TaskExecutionRequest = {
        taskId: 'task-2',
        title: 'Task 2',
        prompt: 'Test',
        files: [],
        mode: 'execute',
      };

      // Start both tasks without waiting
      void adapter.executeTask(request1, mockEmitUpdate);
      void adapter.executeTask(request2, mockEmitUpdate);

      const statuses = adapter.getAllTaskStatuses();
      expect(statuses.get('task-1')).toBe('running');
      expect(statuses.get('task-2')).toBe('running');
    });

    it('should return empty map when no tasks are running', () => {
      const statuses = adapter.getAllTaskStatuses();
      expect(statuses.size).toBe(0);
    });
  });
});
