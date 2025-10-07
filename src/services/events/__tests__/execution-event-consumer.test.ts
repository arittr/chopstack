import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogLevel } from '@/types/events';
import { logger } from '@/utils/global-logger';

import { ExecutionEventBus } from '../execution-event-bus';
import { ExecutionEventConsumer } from '../execution-event-consumer';

// Mock the global logger
vi.mock('@/utils/global-logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ExecutionEventConsumer', () => {
  let eventBus: ExecutionEventBus;

  beforeEach(() => {
    eventBus = new ExecutionEventBus();
    vi.clearAllMocks();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('log event filtering', () => {
    it('should show INFO logs by default', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false });

      eventBus.emitLog(LogLevel.INFO, 'Info message');

      expect(logger.info).toHaveBeenCalledWith('Info message');
    });

    it('should show WARN logs by default', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false });

      eventBus.emitLog(LogLevel.WARN, 'Warning message');

      expect(logger.info).toHaveBeenCalledWith('Warning message');
    });

    it('should show ERROR logs by default', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false });

      eventBus.emitLog(LogLevel.ERROR, 'Error message');

      expect(logger.info).toHaveBeenCalledWith('Error message');
    });

    it('should not show DEBUG logs by default', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false });

      eventBus.emitLog(LogLevel.DEBUG, 'Debug message');

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should show DEBUG logs in verbose mode', () => {
      new ExecutionEventConsumer(eventBus, { verbose: true });

      eventBus.emitLog(LogLevel.DEBUG, 'Debug message');

      expect(logger.debug).toHaveBeenCalledWith('Debug message');
    });
  });

  describe('stream data filtering', () => {
    it('should not show stream data by default', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false, showStreamData: false });

      eventBus.emitStreamData('task-1', {
        content: 'Thinking...',
        type: 'thinking',
      });

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should show all stream data in verbose mode', () => {
      new ExecutionEventConsumer(eventBus, { verbose: true });

      eventBus.emitStreamData('task-1', {
        content: 'Thinking...',
        type: 'thinking',
      });

      // Check that it was called with the right structure (JSON key order may vary)
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('[task-1]'));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"type":"thinking"'));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"content":"Thinking..."'));
    });

    it('should show thinking events when showStreamData is enabled', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false, showStreamData: true });

      eventBus.emitStreamData('task-1', {
        content: 'Thinking about the problem...',
        type: 'thinking',
      });

      expect(logger.info).toHaveBeenCalledWith('[task-1] 💭 Thinking about the problem...');
    });

    it('should truncate long thinking content', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false, showStreamData: true });

      const longContent = 'A'.repeat(150);
      eventBus.emitStreamData('task-1', {
        content: longContent,
        type: 'thinking',
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('💭'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('...'));
    });

    it('should show tool_use events when showStreamData is enabled', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false, showStreamData: true });

      eventBus.emitStreamData('task-1', {
        tool: 'Read',
        type: 'tool_use',
      });

      expect(logger.info).toHaveBeenCalledWith('[task-1] 🔧 Read');
    });

    it('should show error events', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false, showStreamData: true });

      eventBus.emitStreamData('task-1', {
        error: 'Something went wrong',
        type: 'error',
      });

      expect(logger.error).toHaveBeenCalledWith('[task-1] ❌ Something went wrong');
    });
  });

  describe('task progress events', () => {
    it('should show task start events when showTaskProgress is enabled', () => {
      new ExecutionEventConsumer(eventBus, { showTaskProgress: true });

      eventBus.emitTaskStart(
        {
          agentPrompt: 'Test',
          description: 'Test task',
          estimatedLines: 10,
          id: 'task-1',
          produces: [],
          requires: [],
          title: 'Test Task',
          touches: [],
        },
        { taskId: 'task-1', taskName: 'Test Task' },
      );

      expect(logger.info).toHaveBeenCalledWith('🚀 Starting task: task-1');
    });

    it('should show task progress events when showTaskProgress is enabled', () => {
      new ExecutionEventConsumer(eventBus, { showTaskProgress: true });

      eventBus.emitTaskProgress('task-1', {
        message: 'Processing...',
        phase: 'executing',
      });

      expect(logger.info).toHaveBeenCalledWith('[task-1] executing: Processing...');
    });

    it('should show task complete events when showTaskProgress is enabled', () => {
      new ExecutionEventConsumer(eventBus, { showTaskProgress: true });

      eventBus.emitTaskComplete('task-1', {
        success: true,
      });

      expect(logger.info).toHaveBeenCalledWith('✅ Task task-1 completed');
    });

    it('should show task failed events when showTaskProgress is enabled', () => {
      new ExecutionEventConsumer(eventBus, { showTaskProgress: true });

      eventBus.emitTaskFailed('task-1', new Error('Failed'));

      expect(logger.error).toHaveBeenCalledWith('❌ Task task-1 failed: Failed');
    });

    it('should not show task events when showTaskProgress is disabled', () => {
      new ExecutionEventConsumer(eventBus, { showTaskProgress: false });

      eventBus.emitTaskStart(
        {
          agentPrompt: 'Test',
          description: 'Test task',
          estimatedLines: 10,
          id: 'task-1',
          produces: [],
          requires: [],
          title: 'Test Task',
          touches: [],
        },
        { taskId: 'task-1', taskName: 'Test Task' },
      );

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('VCS events', () => {
    it('should show branch created events in verbose mode', () => {
      new ExecutionEventConsumer(eventBus, { verbose: true });

      eventBus.emitBranchCreated('feature-branch', 'main');

      expect(logger.debug).toHaveBeenCalledWith('📌 Created branch feature-branch from main');
    });

    it('should show commit events in verbose mode', () => {
      new ExecutionEventConsumer(eventBus, { verbose: true });

      eventBus.emitCommit('feature-branch', 'Add feature', ['src/feature.ts']);

      expect(logger.debug).toHaveBeenCalledWith(
        '💾 Committed to feature-branch: Add feature (1 files)',
      );
    });

    it('should not show VCS events in non-verbose mode', () => {
      new ExecutionEventConsumer(eventBus, { verbose: false });

      eventBus.emitBranchCreated('feature-branch', 'main');
      eventBus.emitCommit('feature-branch', 'Add feature', ['src/feature.ts']);

      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove all listeners on destroy', () => {
      const consumer = new ExecutionEventConsumer(eventBus);

      expect(eventBus.listenerCount('log')).toBeGreaterThan(0);

      consumer.destroy();

      expect(eventBus.listenerCount('log')).toBe(0);
    });
  });
});
