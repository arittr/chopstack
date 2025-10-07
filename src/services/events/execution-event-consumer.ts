import { LogLevel } from '@/types/events';
import { logger } from '@/utils/global-logger';

import type { ExecutionEventBus } from './execution-event-bus';

export type EventConsumerOptions = {
  showStreamData: boolean;
  showTaskProgress: boolean;
  verbose: boolean;
};

/**
 * Event consumer that subscribes to ExecutionEventBus and renders output
 * based on configuration. Decouples event emission from display logic.
 */
export class ExecutionEventConsumer {
  private readonly eventBus: ExecutionEventBus;
  private readonly options: EventConsumerOptions;

  constructor(eventBus: ExecutionEventBus, options: Partial<EventConsumerOptions> = {}) {
    this.eventBus = eventBus;
    this.options = {
      showStreamData: options.showStreamData ?? false,
      showTaskProgress: options.showTaskProgress ?? true,
      verbose: options.verbose ?? false,
    };

    this._setupEventHandlers();
  }

  private _setupEventHandlers(): void {
    // Always show user-facing logs at INFO level or higher
    this.eventBus.onLog((event) => {
      if (event.level >= LogLevel.INFO) {
        logger.info(event.message);
      } else if (this.options.verbose && event.level >= LogLevel.DEBUG) {
        logger.debug(event.message);
      }
    });

    // Only show stream data in verbose mode
    this.eventBus.onStreamData((event) => {
      if (!this.options.showStreamData && !this.options.verbose) {
        return;
      }

      // Format stream data for display
      const { taskId, event: streamEvent } = event;

      // In verbose mode, show everything
      if (this.options.verbose) {
        logger.debug(`[${taskId}] ${JSON.stringify(streamEvent)}`);
        return;
      }

      // Otherwise, show only important events
      switch (streamEvent.type) {
        case 'thinking': {
          if ('content' in streamEvent && typeof streamEvent.content === 'string') {
            const { content } = streamEvent;
            logger.info(
              `[${taskId}] 💭 ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`,
            );
          }

          break;
        }
        case 'tool_use': {
          if ('tool' in streamEvent && typeof streamEvent.tool === 'string') {
            const { tool } = streamEvent;
            logger.info(`[${taskId}] 🔧 ${tool}`);
          }

          break;
        }
        case 'error': {
          if ('error' in streamEvent) {
            logger.error(`[${taskId}] ❌ ${String(streamEvent.error)}`);
          }

          break;
        }
        // No default - other events are not displayed in non-verbose mode
      }
    });

    // Show task progress events
    if (this.options.showTaskProgress) {
      this.eventBus.onTaskStart((event) => {
        logger.info(`🚀 Starting task: ${event.task.id}`);
      });

      this.eventBus.onTaskProgress((event) => {
        const { taskId, progress } = event;
        logger.info(
          `[${taskId}] ${progress.phase}${progress.message !== undefined ? `: ${progress.message}` : ''}`,
        );
      });

      this.eventBus.onTaskComplete((event) => {
        const { taskId, result } = event;
        if (result.success) {
          logger.info(`✅ Task ${taskId} completed`);
        } else {
          logger.warn(`⚠️ Task ${taskId} completed with warnings`);
        }
      });

      this.eventBus.onTaskFailed((event) => {
        logger.error(`❌ Task ${event.taskId} failed: ${event.error.message}`);
      });
    }

    // Show VCS events in verbose mode
    if (this.options.verbose) {
      this.eventBus.onBranchCreated((event) => {
        logger.debug(`📌 Created branch ${event.branchName} from ${event.parentBranch}`);
      });

      this.eventBus.onCommit((event) => {
        logger.debug(
          `💾 Committed to ${event.branchName}: ${event.message} (${event.filesChanged.length} files)`,
        );
      });
    }
  }

  /**
   * Clean up event listeners (call this when shutting down)
   */
  destroy(): void {
    this.eventBus.removeAllListeners();
  }
}
