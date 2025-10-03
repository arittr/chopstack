import type { TaskExecutionAdapter } from '@/services/orchestration/types';

import { logger } from '@/utils/global-logger';

import { ClaudeCliTaskExecutionAdapter } from './claude-cli-task-execution-adapter';
import { MockTaskExecutionAdapter } from './mock-task-execution-adapter';

export type AdapterOptions = {
  verbose?: boolean;
};

/**
 * Factory for creating task execution adapters based on agent type
 */
export const TaskExecutionAdapterFactory = {
  /**
   * Create a task execution adapter for the specified agent type
   */
  createAdapter(agentType: string = 'claude', options?: AdapterOptions): TaskExecutionAdapter {
    switch (agentType) {
      case 'claude': {
        return new ClaudeCliTaskExecutionAdapter(options);
      }

      case 'mock': {
        return new MockTaskExecutionAdapter();
      }

      case 'codex':
      case 'aider': {
        // Agents without execution capability fallback to mock with warning
        logger.warn(
          `⚠️  Agent '${agentType}' does not support task execution. Using mock executor as fallback.`,
        );
        return new MockTaskExecutionAdapter();
      }

      default: {
        logger.warn(`⚠️  Unknown agent type '${agentType}'. Defaulting to Claude CLI executor.`);
        return new ClaudeCliTaskExecutionAdapter(options);
      }
    }
  },

  /**
   * Check if an agent type supports task execution
   */
  supportsExecution(agentType: string): boolean {
    return agentType === 'claude' || agentType === 'mock';
  },
};
