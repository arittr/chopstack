/**
 * # Logging Architecture
 *
 * This module provides TWO SEPARATE logging systems for different purposes:
 *
 * ## 1. Service Logger (for general application logs)
 * **USE THIS FOR:** Internal service operations, debugging, user-facing messages
 * **IMPORT:** `import { logger } from '@/logging'`
 * **CONTROLS:** Log verbosity via `--verbose` flag or LOG_LEVEL env var
 *
 * Examples:
 * ```typescript
 * logger.info('Creating worktree for task-1');
 * logger.warn('Branch already exists, retrying...');
 * logger.error('Failed to commit changes');
 * logger.debug('Internal state: {...}');  // Only shown with --verbose
 * ```
 *
 * ## 2. Execution Event Bus (for Claude CLI streaming output)
 * **USE THIS FOR:** Emitting events from task execution adapters
 * **IMPORT:** `import { getGlobalEventBus, initializeEventConsumer } from '@/logging'`
 * **CONTROLS:** Stream data visibility via `--verbose` flag
 *
 * Examples:
 * ```typescript
 * // In adapters/services - emit events
 * eventBus.emitStreamData(taskId, claudeStreamEvent);
 * eventBus.emitTaskStart(task, context);
 * eventBus.emitLog(LogLevel.INFO, 'Task completed');
 *
 * // In CLI entry point - initialize consumer
 * initializeEventConsumer({ verbose: options.verbose });
 * ```
 *
 * ## When to Use What?
 *
 * | Scenario | Use |
 * |----------|-----|
 * | Service-level debugging (VCS, orchestration, planning) | `logger.*` |
 * | User-facing messages (errors, warnings, info) | `logger.*` |
 * | Claude CLI stream events (thinking, tool_use, etc.) | `eventBus.emitStreamData()` |
 * | Task lifecycle events (start, progress, complete) | `eventBus.emitTask*()` |
 * | VCS events (branch created, commit made) | `eventBus.emitBranch/emitCommit()` |
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────┐
 * │  Service Logger (logger.ts + global-logger.ts)          │
 * │  - General app logs (INFO, WARN, ERROR, DEBUG)          │
 * │  - Console output with colors                           │
 * │  - File logging support                                 │
 * │  - TUI integration via EventLogger                      │
 * └─────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Execution Event Bus (event-bus + event-consumer)       │
 * │  - Task execution events                                │
 * │  - Claude stream data filtering                         │
 * │  - Type-safe event emission                             │
 * │  - VCS operation events                                 │
 * └─────────────────────────────────────────────────────────┘
 * ```
 *
 * @module logging
 **/

// =============================================================================
// SERVICE LOGGER - Use for general application logs
// =============================================================================

export { ExecutionEventBus } from '@/services/events/execution-event-bus';
export { ExecutionEventConsumer } from '@/services/events/execution-event-consumer';
export {
  getGlobalEventBus,
  initializeEventConsumer,
} from '@/services/orchestration/adapters/task-execution-adapter-factory';
export type {
  ExecutionEvents,
  EventHandler,
  TaskContext,
  TaskProgress,
  TaskResult,
  ClaudeStreamEvent,
} from '@/types/events';

// =============================================================================
// EXECUTION EVENT BUS - Use for task execution events
// =============================================================================

export { LogLevel as EventLogLevel } from '@/types/events';
export { EventLogger } from '@/utils/event-logger';
export { logger, GlobalLogger } from '@/utils/global-logger';

export { Logger } from '@/utils/logger';
export type { LogLevel, LoggerOptions, LogEntry } from '@/utils/logger';
