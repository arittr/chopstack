import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeCliTaskExecutionAdapter } from '../claude-cli-task-execution-adapter';
import { MockTaskExecutionAdapter } from '../mock-task-execution-adapter';
import { TaskExecutionAdapterFactory } from '../task-execution-adapter-factory';

// Mock logger to suppress warnings in tests
vi.mock('@/utils/logger', () => ({
  Logger: class {
    warn = vi.fn();
    info = vi.fn();
    error = vi.fn();
    debug = vi.fn();
    configure = vi.fn();
    getOptions = vi.fn(() => ({}));
  },
}));

vi.mock('@/utils/global-logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TaskExecutionAdapterFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAdapter', () => {
    it('should create ClaudeCliTaskExecutionAdapter for claude agent', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter('claude');
      expect(adapter).toBeInstanceOf(ClaudeCliTaskExecutionAdapter);
    });

    it('should create MockTaskExecutionAdapter for mock agent', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter('mock');
      expect(adapter).toBeInstanceOf(MockTaskExecutionAdapter);
    });

    it('should fallback to MockTaskExecutionAdapter for agents without execution support', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter('codex');
      expect(adapter).toBeInstanceOf(MockTaskExecutionAdapter);
    });

    it('should fallback to MockTaskExecutionAdapter for aider agent', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter('aider');
      expect(adapter).toBeInstanceOf(MockTaskExecutionAdapter);
    });

    it('should default to ClaudeCliTaskExecutionAdapter for unknown agents', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter('unknown-agent');
      expect(adapter).toBeInstanceOf(ClaudeCliTaskExecutionAdapter);
    });

    it('should default to ClaudeCliTaskExecutionAdapter when no agent specified', () => {
      const adapter = TaskExecutionAdapterFactory.createAdapter();
      expect(adapter).toBeInstanceOf(ClaudeCliTaskExecutionAdapter);
    });

    it('should warn when using unsupported agents', async () => {
      const { logger } = await import('@/utils/global-logger');
      TaskExecutionAdapterFactory.createAdapter('codex');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Agent 'codex' does not support task execution"),
      );
    });

    it('should warn for unknown agent types', async () => {
      const { logger } = await import('@/utils/global-logger');
      TaskExecutionAdapterFactory.createAdapter('unknown');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Unknown agent type 'unknown'"),
      );
    });
  });

  describe('supportsExecution', () => {
    it('should return true for claude', () => {
      expect(TaskExecutionAdapterFactory.supportsExecution('claude')).toBe(true);
    });

    it('should return true for mock', () => {
      expect(TaskExecutionAdapterFactory.supportsExecution('mock')).toBe(true);
    });

    it('should return false for codex', () => {
      expect(TaskExecutionAdapterFactory.supportsExecution('codex')).toBe(false);
    });

    it('should return false for aider', () => {
      expect(TaskExecutionAdapterFactory.supportsExecution('aider')).toBe(false);
    });

    it('should return false for unknown agents', () => {
      expect(TaskExecutionAdapterFactory.supportsExecution('unknown')).toBe(false);
    });
  });
});
