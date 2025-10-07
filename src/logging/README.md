# Logging Architecture

This module provides TWO SEPARATE logging systems for different purposes.

## Quick Start

### For General Application Logs
```typescript
import { logger } from '@/logging';

// Use this 99% of the time for service operations
logger.info('Creating worktree for task-1');
logger.warn('Branch already exists, retrying...');
logger.error('Failed to commit changes');
logger.debug('Internal state:', { foo: 'bar' }); // Only with --verbose
```

### For Task Execution Events
```typescript
import { getGlobalEventBus, initializeEventConsumer } from '@/logging';

// In CLI entry point ONLY - initialize once
initializeEventConsumer({ verbose: options.verbose });

// In task adapters - emit events
const eventBus = getGlobalEventBus();
eventBus.emitTaskStart(task, context);
eventBus.emitStreamData(taskId, streamEvent);
eventBus.emitTaskComplete(taskId, result);
```

## System 1: Service Logger

**Purpose:** General application logging (VCS, orchestration, planning, etc.)

**When to use:**
- ✅ Internal service operations
- ✅ User-facing error/warning/info messages
- ✅ Debug logging for development
- ✅ Any non-streaming operational log

**When NOT to use:**
- ❌ Claude CLI streaming output → Use Event Bus
- ❌ Task lifecycle events → Use Event Bus
- ❌ VCS events that need TUI tracking → Use Event Bus

**Example:**
```typescript
import { logger } from '@/logging';

export class VcsEngineService {
  async createBranch(name: string): Promise<void> {
    logger.info(`Creating branch: ${name}`);

    try {
      await this.git.branch(name);
      logger.debug(`Branch created successfully`, { name });
    } catch (error) {
      logger.error(`Failed to create branch: ${error.message}`);
      throw error;
    }
  }
}
```

## System 2: Execution Event Bus

**Purpose:** Event-driven architecture for task execution lifecycle

**When to use:**
- ✅ Task lifecycle events (start, progress, complete, failed)
- ✅ Claude CLI streaming output (thinking, tool_use, content, error)
- ✅ VCS operation events (branch created, commit made)
- ✅ Cross-cutting concerns (TUI, metrics, webhooks)

**When NOT to use:**
- ❌ General service logging → Use Service Logger
- ❌ Internal debugging → Use Service Logger
- ❌ Simple error messages → Use Service Logger

**Example:**
```typescript
import { getGlobalEventBus, EventLogLevel } from '@/logging';
import type { Task, TaskContext } from '@/logging';

export class ClaudeCliTaskExecutionAdapter {
  private readonly eventBus = getGlobalEventBus();

  async executeTask(task: Task): Promise<void> {
    // Emit task start event
    const context: TaskContext = {
      taskId: task.id,
      taskName: task.title,
    };
    this.eventBus.emitTaskStart(task, context);

    // Parse Claude stream output
    const streamEvent = JSON.parse(line);
    this.eventBus.emitStreamData(task.id, streamEvent);

    // Emit completion
    this.eventBus.emitTaskComplete(task.id, { success: true });
  }
}
```

## Decision Tree

```
Need to log something?
│
├─ Is it Claude CLI stream output (thinking, tool_use)?
│  └─ YES → Use Event Bus: eventBus.emitStreamData()
│
├─ Is it a task lifecycle event (start, complete, failed)?
│  └─ YES → Use Event Bus: eventBus.emitTask*()
│
├─ Is it a VCS event that TUI needs to track?
│  └─ YES → Use Event Bus: eventBus.emitBranch*/emitCommit()
│
└─ Otherwise → Use Service Logger: logger.info/warn/error/debug()
```

## Verbosity Control

Both systems respect the `--verbose` flag:

**Service Logger:**
- Normal mode: Shows INFO, WARN, ERROR
- Verbose mode (`--verbose`): Also shows DEBUG

**Event Bus:**
- Normal mode: Shows task progress, hides stream data
- Verbose mode (`--verbose`): Shows raw Claude stream JSON

## File Structure

```
src/logging/
├── index.ts              # Central export point (use this!)
└── README.md             # This file

src/utils/
├── logger.ts             # Base Logger class
├── event-logger.ts       # EventLogger (extends Logger)
└── global-logger.ts      # Global singleton

src/services/events/
├── execution-event-bus.ts    # Event bus implementation
└── execution-event-consumer.ts # Event filtering/display
```

## Testing

```bash
# Test service logger
pnpm test src/utils/__tests__/logger.test.ts

# Test event bus
pnpm test src/services/events/__tests__/execution-event-bus.test.ts

# Test event consumer
pnpm test src/services/events/__tests__/execution-event-consumer.test.ts
```
