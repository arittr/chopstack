import { describe, expect, it, mock } from 'bun:test';

import type { TaskV2 } from '@/types/schemas-v2';

import { LogLevel } from '@/types/events';

import { ExecutionEventBus } from '../execution-event-bus';

describe('ExecutionEventBus', () => {
  describe('event emission', () => {
    it('should emit task:start events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onTaskStart(handler);

      const task: TaskV2 = {
        acceptanceCriteria: ['Task completed'],
        complexity: 'M',
        dependencies: [],
        description: 'Test task',
        files: ['test.ts'],
        id: 'test-task',
        name: 'Test Task',
      };

      const context = {
        taskId: 'test-task',
        taskName: 'Test Task',
      };

      eventBus.emitTaskStart(task, context);

      expect(handler).toHaveBeenCalledWith({
        context,
        task,
      });
    });

    it('should emit task:progress events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onTaskProgress(handler);

      const progress = {
        phase: 'executing' as const,
        message: 'Executing task...',
      };

      eventBus.emitTaskProgress('test-task', progress);

      expect(handler).toHaveBeenCalledWith({
        progress,
        taskId: 'test-task',
      });
    });

    it('should emit task:complete events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onTaskComplete(handler);

      const result = {
        filesChanged: ['test.ts'],
        success: true,
      };

      eventBus.emitTaskComplete('test-task', result);

      expect(handler).toHaveBeenCalledWith({
        result,
        taskId: 'test-task',
      });
    });

    it('should emit task:failed events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onTaskFailed(handler);

      const error = new Error('Task failed');

      eventBus.emitTaskFailed('test-task', error);

      expect(handler).toHaveBeenCalledWith({
        error,
        taskId: 'test-task',
      });
    });

    it('should emit stream:data events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onStreamData(handler);

      const streamEvent = {
        content: 'Thinking...',
        type: 'thinking' as const,
      };

      eventBus.emitStreamData('test-task', streamEvent);

      expect(handler).toHaveBeenCalledWith({
        event: streamEvent,
        taskId: 'test-task',
      });
    });

    it('should emit log events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onLog(handler);

      eventBus.emitLog(LogLevel.INFO, 'Test message', { foo: 'bar' });

      expect(handler).toHaveBeenCalledWith({
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: { foo: 'bar' },
      });
    });

    it('should emit vcs:branch-created events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onBranchCreated(handler);

      eventBus.emitBranchCreated('feature-branch', 'main');

      expect(handler).toHaveBeenCalledWith({
        branchName: 'feature-branch',
        parentBranch: 'main',
      });
    });

    it('should emit vcs:commit events', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();
      eventBus.onCommit(handler);

      eventBus.emitCommit('feature-branch', 'Add feature', ['src/feature.ts']);

      expect(handler).toHaveBeenCalledWith({
        branchName: 'feature-branch',
        filesChanged: ['src/feature.ts'],
        message: 'Add feature',
      });
    });
  });

  describe('multiple listeners', () => {
    it('should support multiple listeners for the same event', () => {
      const eventBus = new ExecutionEventBus();
      const handler1 = mock();
      const handler2 = mock();

      eventBus.onLog(handler1);
      eventBus.onLog(handler2);

      eventBus.emitLog(LogLevel.INFO, 'Test message');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('listener management', () => {
    it('should remove all listeners for a specific event', () => {
      const eventBus = new ExecutionEventBus();
      const handler = mock();

      eventBus.onLog(handler);
      eventBus.removeAllListenersForEvent('log');
      eventBus.emitLog(LogLevel.INFO, 'Test message');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should get listener count for an event', () => {
      const eventBus = new ExecutionEventBus();
      const handler1 = mock();
      const handler2 = mock();

      eventBus.onLog(handler1);
      eventBus.onLog(handler2);

      expect(eventBus.getListenerCount('log')).toBe(2);
    });
  });
});
