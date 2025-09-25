import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StreamingUpdate, TaskExecutionRequest } from '@/services/orchestration/types';

import { DynamicTaskExecutionAdapter } from '../dynamic-task-execution-adapter';

// Mock the factory
vi.mock('../task-execution-adapter-factory', () => ({
  TaskExecutionAdapterFactory: {
    createAdapter: vi.fn((agent) => ({
      executeTask: vi.fn().mockResolvedValue({
        taskId: 'test-task',
        status: 'completed',
        duration: 100,
        output: `Executed with ${agent}`,
      }),
      stopTask: vi.fn().mockReturnValue(true),
      getAllTaskStatuses: vi.fn().mockReturnValue(new Map([['test-task', 'running']])),
    })),
  },
}));

describe('DynamicTaskExecutionAdapter', () => {
  let adapter: DynamicTaskExecutionAdapter;
  let mockEmitUpdate: (update: StreamingUpdate) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DynamicTaskExecutionAdapter();
    mockEmitUpdate = vi.fn();
  });

  describe('executeTask', () => {
    it('should use the default agent when none specified', async () => {
      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
      };

      const result = await adapter.executeTask(request, mockEmitUpdate);
      expect(result.output).toBe('Executed with claude');
    });

    it('should use the agent specified in the request', async () => {
      const request: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'mock',
      };

      const result = await adapter.executeTask(request, mockEmitUpdate);
      expect(result.output).toBe('Executed with mock');
    });

    it('should cache adapters for reuse', async () => {
      const { TaskExecutionAdapterFactory } = await import('../task-execution-adapter-factory');

      const request1: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task-1',
        title: 'Test Task 1',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'mock',
      };

      const request2: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task-2',
        title: 'Test Task 2',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'mock',
      };

      await adapter.executeTask(request1, mockEmitUpdate);
      await adapter.executeTask(request2, mockEmitUpdate);

      // Should only create one adapter for 'mock'
      expect(TaskExecutionAdapterFactory.createAdapter).toHaveBeenCalledTimes(1);
      expect(TaskExecutionAdapterFactory.createAdapter).toHaveBeenCalledWith('mock');
    });
  });

  describe('setDefaultAgent', () => {
    it('should change the default agent', async () => {
      adapter.setDefaultAgent('mock');

      const request: TaskExecutionRequest = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
      };

      const result = await adapter.executeTask(request, mockEmitUpdate);
      expect(result.output).toBe('Executed with mock');
    });
  });

  describe('stopTask', () => {
    it('should stop task in the appropriate adapter', async () => {
      // First execute a task to create an adapter
      const request: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task',
        title: 'Test Task',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'mock',
      };

      await adapter.executeTask(request, mockEmitUpdate);

      const stopped = adapter.stopTask('test-task');
      expect(stopped).toBe(true);
    });

    it('should return false if no adapter can stop the task', () => {
      const stopped = adapter.stopTask('unknown-task');
      expect(stopped).toBe(false);
    });
  });

  describe('getAllTaskStatuses', () => {
    it('should aggregate statuses from all adapters', async () => {
      // Execute tasks with different agents to create multiple adapters
      const request1: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task-1',
        title: 'Test Task 1',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'mock',
      };

      const request2: TaskExecutionRequest & { agent?: string } = {
        taskId: 'test-task-2',
        title: 'Test Task 2',
        prompt: 'Test prompt',
        files: ['test.ts'],
        mode: 'execute',
        agent: 'claude',
      };

      await adapter.executeTask(request1, mockEmitUpdate);
      await adapter.executeTask(request2, mockEmitUpdate);

      const statuses = adapter.getAllTaskStatuses();
      expect(statuses).toBeDefined();
      expect(statuses.size).toBeGreaterThan(0);
    });
  });
});
