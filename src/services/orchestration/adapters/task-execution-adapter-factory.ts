import type { TaskExecutionAdapter } from '@/services/orchestration/types';

import { ExecutionEventBus } from '@/services/events/execution-event-bus';
import { ExecutionEventConsumer } from '@/services/events/execution-event-consumer';
import { logger } from '@/utils/global-logger';

import { ClaudeCliTaskExecutionAdapter } from './claude-cli-task-execution-adapter';
import { MockTaskExecutionAdapter } from './mock-task-execution-adapter';

export type AdapterOptions = {
  eventBus?: ExecutionEventBus;
};

/**
 * Singleton event bus instance shared across all adapters
 */
const globalEventBus = new ExecutionEventBus();

/**
 * Singleton event consumer for handling event display
 */
let globalEventConsumer: ExecutionEventConsumer | null = null;

/**
 * Get the global event bus instance
 */
export function getGlobalEventBus(): ExecutionEventBus {
  return globalEventBus;
}

/**
 * Initialize the global event consumer with options
 * Should be called once at application startup
 */
export function initializeEventConsumer(options: { verbose: boolean }): void {
  // Clean up existing consumer if any
  if (globalEventConsumer !== null) {
    globalEventConsumer.destroy();
  }

  // Create new consumer with options
  globalEventConsumer = new ExecutionEventConsumer(globalEventBus, {
    verbose: options.verbose,
    showStreamData: options.verbose, // Only show raw stream data in verbose mode
    showTaskProgress: true,
  });
}

/**
 * Factory for creating task execution adapters based on agent type
 */
export const TaskExecutionAdapterFactory = {
  /**
   * Create a task execution adapter for the specified agent type
   */
  createAdapter(agentType: string = 'claude', options?: AdapterOptions): TaskExecutionAdapter {
    const eventBus = options?.eventBus ?? globalEventBus;

    switch (agentType) {
      case 'claude': {
        return new ClaudeCliTaskExecutionAdapter({ ...options, eventBus });
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
        return new ClaudeCliTaskExecutionAdapter({ ...options, eventBus });
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
