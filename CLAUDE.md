# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**chopstack** is a TypeScript CLI tool and MCP (Model Context Protocol) server that helps chop massive AI changes into clean, reviewable PR stacks using AI-powered parallel Git workflows with intelligent task decomposition.

## Development Commands

### Building and Development

```bash
# Build the project
pnpm run build

# Watch mode development (CLI)
pnpm run dev

# Watch mode development (library)
pnpm run dev:lib

# MCP server development
pnpm run dev:mcp

# Inspect MCP server
pnpm run inspect:mcp
```

### Code Quality and Testing

```bash
# Run linting
pnpm run lint

# Fix linting issues automatically
pnpm run lint:fix

# Type checking
pnpm run type-check

# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Tests
pnpm run test           # All tests (unit + E2E + execution)
pnpm run test:unit      # Unit tests only
pnpm run test:e2e       # E2E integration tests
pnpm run test:execution # Execution planning tests
```

### Running the CLI

```bash
# Run built CLI
pnpm run start

# Run MCP server
pnpm run start:mcp

# Clean build artifacts
pnpm run clean
```

## Architecture Overview

This project has a dual-purpose architecture:

1. **CLI Tool** (`src/bin/chopstack.ts`): Standalone command-line interface for chopstack operations
2. **MCP Server** (`src/index.ts`): Model Context Protocol server for AI integration

### Core Components

- **Parser** (`src/parser/spec-parser.ts`): Parses markdown specifications into structured tasks with dependencies, files, priorities, and complexity estimates
- **Types** (`src/types/decomposer.ts`): Core type definitions for tasks, DAG nodes, conflict resolution, and specifications
- **MCP Server** (`src/mcp/server.ts`): FastMCP server with task orchestration tools
- **Task Orchestrator** (`src/mcp/orchestrator.ts`): Manages parallel task execution using Claude Code CLI in plan mode
- **Execution Testing** (`test/execution/`): Tests Claude's execution planning using `--permission-mode plan`
- **Build System**: Uses `tsup` for ESM-only builds targeting Node.js 18+ with dual entry points

### Key Design Patterns

The codebase follows these architectural patterns:

1. **Functional Pattern Matching**: Uses `ts-pattern` extensively for control flow instead of switch/if-else chains
2. **Type-First Design**: Leverages Zod schemas for runtime validation, especially for MCP integration
3. **ESM-Only**: Built as ESM modules using latest TypeScript and Node.js features
4. **Strict TypeScript**: All strict compiler options enabled with comprehensive type safety

### Technology Stack

- **Runtime**: Node.js >=18.0.0 with ESM modules
- **Language**: TypeScript with very strict configuration
- **Package Manager**: pnpm (required)
- **Build Tool**: tsup for fast ESM builds
- **MCP Framework**: FastMCP (built on official MCP SDK)
- **Pattern Matching**: ts-pattern for functional control flow
- **Validation**: Zod for schema validation and runtime type checking
- **External Types**: Official Claude Code SDK types from `@anthropic-ai/claude-code`
- **Testing**: Vitest for all testing, custom execution testing framework

### Logging Architecture

**IMPORTANT**: This codebase has TWO SEPARATE logging systems that serve different purposes. Understanding which to use is critical.

#### System 1: Service Logger (General Application Logs)

**Location**: `src/logging/` - Import via `import { logger } from '@/logging'`

**Purpose**: General application logging for services, debugging, and user-facing messages

**When to Use**:
- Internal service operations (VCS, orchestration, planning, decomposition)
- User-facing error/warning/info messages
- Debug logging for development
- Any non-streaming operational log

**Examples**:
```typescript
import { logger } from '@/logging';

// User-facing messages
logger.info('Creating worktree for task-1');
logger.warn('Branch already exists, retrying...');
logger.error('Failed to commit changes');

// Debug logging (only shown with --verbose)
logger.debug('VCS engine initialized with config:', { config });
logger.debug('Task execution state:', { taskId, status });
```

**Features**:
- Automatic log level filtering (DEBUG, INFO, WARN, ERROR)
- Color-coded console output via chalk
- TUI integration via EventLogger
- File logging support
- Controlled by `--verbose` flag and LOG_LEVEL env var

#### System 2: Execution Event Bus (Task Execution Events)

**Location**: `src/services/events/` - Import via `import { getGlobalEventBus, initializeEventConsumer } from '@/logging'`

**Purpose**: Event-driven architecture for task execution lifecycle and Claude CLI stream data

**When to Use**:
- Task lifecycle events (start, progress, complete, failed)
- Claude CLI streaming output (thinking, tool_use, content, error)
- VCS operation events (branch created, commit made)
- Cross-cutting concerns that need multiple consumers (TUI, metrics, webhooks)

**Examples**:
```typescript
import { getGlobalEventBus, initializeEventConsumer, EventLogLevel } from '@/logging';

// In task execution adapters - emit events
const eventBus = getGlobalEventBus();

eventBus.emitTaskStart(task, { taskId: 'task-1', taskName: 'My Task' });
eventBus.emitStreamData('task-1', { type: 'thinking', content: '...' });
eventBus.emitTaskComplete('task-1', { success: true });
eventBus.emitLog(EventLogLevel.INFO, 'Task completed successfully');

// In CLI entry point - initialize consumer
initializeEventConsumer({ verbose: options.verbose });
```

**Features**:
- Type-safe event emission with `ExecutionEvents` type
- Centralized event bus (singleton pattern)
- Filtering via `ExecutionEventConsumer` based on verbose flag
- Decouples event emission from consumption
- Supports multiple consumers (TUI, file logger, metrics)

#### Quick Reference: Which System to Use?

| Scenario | System | Import |
|----------|--------|--------|
| VCS operation logging | Service Logger | `logger.info('Creating branch...')` |
| User error messages | Service Logger | `logger.error('Failed to...')` |
| Debug internal state | Service Logger | `logger.debug('State:', state)` |
| Claude stream events | Event Bus | `eventBus.emitStreamData(...)` |
| Task lifecycle | Event Bus | `eventBus.emitTaskStart(...)` |
| Branch/commit events | Event Bus | `eventBus.emitBranchCreated(...)` |

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Service Logger (logger.ts + global-logger.ts)          │
│  - General app logs (INFO, WARN, ERROR, DEBUG)          │
│  - Console output with colors                           │
│  - File logging support                                 │
│  - TUI integration via EventLogger                      │
│  - Used by: VCS, orchestration, planning services       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Execution Event Bus (event-bus + event-consumer)       │
│  - Task execution events                                │
│  - Claude stream data filtering                         │
│  - Type-safe event emission                             │
│  - VCS operation events                                 │
│  - Used by: Task adapters, VCS strategies               │
└─────────────────────────────────────────────────────────┘
```

#### Integration Points

1. **CLI Entry Point** (`src/entry/cli/chopstack.ts`):
   - Configures service logger: `logger.configure({ verbose: options.verbose })`
   - Initializes event consumer: `initializeEventConsumer({ verbose: options.verbose })`

2. **Task Execution Adapter** (`src/services/orchestration/adapters/claude-cli-task-execution-adapter.ts`):
   - Uses service logger for internal operations
   - Emits events via event bus for stream data

3. **VCS Services** (`src/services/vcs/*`):
   - Use service logger for operational logs
   - Can emit VCS events via event bus for cross-cutting concerns

#### Testing

Both systems have comprehensive unit tests:
- **Service Logger**: `src/utils/__tests__/logger.test.ts`
- **Event Bus**: `src/services/events/__tests__/execution-event-bus.test.ts`
- **Event Consumer**: `src/services/events/__tests__/execution-event-consumer.test.ts`

## Code Style Requirements

### Pattern Matching with ts-pattern

**ALWAYS use ts-pattern for complex conditional logic** instead of switch statements or if/else chains:

```typescript
import { match, P } from 'ts-pattern';

// For command handling
const result = match(command)
  .with({ type: 'init' }, (cmd) => handleInit(cmd))
  .with({ type: 'stack' }, (cmd) => handleStack(cmd))
  .exhaustive();

// For error handling
const response = match(error)
  .with({ code: 'ENOENT' }, () => 'File not found')
  .with(P.instanceOf(GitError), (err) => `Git error: ${err.message}`)
  .otherwise(() => 'Unknown error');
```

### TypeScript Guidelines

- Use `type` over `interface` for simple shapes
- All public functions must have explicit return types
- Use `const assertions` and `as const` for immutable data
- Import file extensions are omitted (handled by build system)
- Strict naming: camelCase for functions, PascalCase for types, kebab-case for files
- **ALWAYS use `utils/guards.ts`** for type guards instead of inline checks (e.g. `=== undefined`):
  - `isNonEmptyString()` for non-empty string checks
  - `isNonNullish()` for null/undefined checks
  - `hasContent()` for strings with actual content
  - `isValidArray()` for non-empty arrays
  - `isNonEmptyObject()` for objects with properties
- Follow `@typescript-eslint/naming-convention` including leading underscore for private members
- Avoid non-null assertions (`!`) and use `isNonNullish()` instead

### Import Organization

Always use extensionless imports; do not specify the file extension in imports.

The ESLint configuration enforces this import order:

1. Node.js built-ins (using `node:` protocol)
2. External dependencies
3. Internal imports

### Code Quality Standards

- **Very Strict TypeScript**: All strict flags enabled, no `any`, explicit function return types required
- **No Default Exports**: Use named exports throughout (except for config files)
- **Pattern Exhaustiveness**: All pattern matches must be exhaustive
- **Modern JavaScript**: Prefer modern APIs, avoid legacy patterns
- **Functional Approach**: Pure functions preferred, avoid mutations where possible

## MCP Integration

The project uses FastMCP for simplified MCP server development:

- Leverages Zod schemas with FastMCP's Standard Schema support
- Use `fastmcp dev src/index.ts` for development
- Use `fastmcp inspect src/index.ts` to inspect the server
- Built-in session management and error handling

## File Structure

```
src/
├── bin/           # CLI entry points
├── agents/        # Agent implementations (Claude, Aider, Mock)
├── commands/      # CLI command implementations
├── mcp/           # MCP server and task orchestration
├── parser/        # Spec parsing logic
├── types/         # TypeScript type definitions
├── utils/         # Utility functions and guards
└── index.ts       # Main MCP server export

src/
├── **/__tests__/  # Co-located unit and integration tests
│   ├── *.test.ts           # Unit tests (fast, heavily mocked)
│   └── *.integration.test.ts # Integration tests (real classes, mocked externals)

test/
├── e2e/           # End-to-end integration tests
├── execution/     # Execution planning tests (using --permission-mode plan)
├── integration/   # Legacy integration tests
├── unit/          # Legacy unit tests
└── setup/         # Test setup and utilities
```

## Testing Strategy

The project follows a modern, comprehensive testing approach with four distinct types of tests organized by purpose and isolation level.

### Test Types

#### 1. Unit Tests (`*.test.ts`)
**Purpose**: Fast, isolated testing of individual functions and classes
**Location**: Co-located in `src/**/__tests__/*.test.ts`
**Characteristics**:
- Heavy mocking of external dependencies (file system, network, subprocesses)
- Tests business logic in isolation
- Very fast execution (< 5000ms timeout)
- High test coverage of edge cases and error conditions

**Example**:
```typescript
// src/utils/__tests__/plan-generator.test.ts
vi.mock('@/agents');
vi.mock('@/utils/dag-validator');

// Tests generatePlanWithRetry logic with mocked agent and validator
expect(mockAgent.decompose).toHaveBeenCalledWith(expectedPrompt, cwd, options);
```

#### 2. Integration Tests (`*.integration.test.ts`)
**Purpose**: Test real class interactions while mocking only truly external operations
**Location**: Co-located in `src/**/__tests__/*.integration.test.ts`
**Characteristics**:
- Uses real instances of our classes (DagValidator, PlanGenerator, etc.)
- Mocks only external dependencies (file I/O, network, git operations)
- Tests end-to-end workflows within our codebase
- Medium execution time (< 10000ms timeout)
- Validates that our classes work together correctly

**Example**:
```typescript
// src/commands/__tests__/decompose.integration.test.ts
// Real generatePlanWithRetry, real DagValidator, real PlanOutputter
// Mocked: file system, agent API calls, git operations
const result = await decomposeCommand(options); // Uses real command flow
expect(result).toBe(0); // Real success/failure
```

#### 3. E2E Tests (`test/e2e/*.test.ts`)
**Purpose**: Test complete CLI workflows in controlled environment
**Location**: `test/e2e/`
**Characteristics**:
- Tests actual CLI commands end-to-end
- Real file system operations in isolated test directories
- Real subprocess execution where safe
- Long execution time (< 30000ms timeout)
- Validates user-facing behavior

#### 4. Execution Planning Tests (`test/execution/*.test.ts`)
**Purpose**: Validate Claude's task execution planning without expensive implementation
**Location**: `test/execution/`
**Characteristics**:
- Uses `claude --permission-mode plan` for fast execution planning
- Real API calls to Claude (with rate limiting)
- Cost-efficient testing (~$0.10-0.20 per task vs $2-5+ for full implementation)
- Very long execution time (< 60000ms timeout)
- Quality analysis of execution plans

### Test Commands

```bash
# All tests
pnpm test

# By type
pnpm test:unit                  # Fast unit tests only
pnpm test:integration          # Integration tests only
pnpm test:e2e                  # End-to-end CLI tests
pnpm test:execution            # Execution planning tests

# Development
pnpm test:watch                # Watch mode
pnpm test:coverage             # Coverage report
pnpm test:ui                   # Interactive UI
```

### Test Organization Principles

1. **Co-location**: Unit and integration tests live next to the code they test
2. **Clear Separation**: Different file patterns for different test types
3. **Pyramid Structure**: Many unit tests, fewer integration tests, minimal E2E tests
4. **Real Class Testing**: Integration tests use real instances of our classes
5. **External Mocking**: Mock only what we don't control (file system, network, external APIs)
6. **Cost Efficiency**: Execution planning tests provide high value at low cost

### Test Cleanup and Migration

We recently modernized the test suite by:
- **Removing 2000+ lines** of problematic tests that tested external dependencies instead of our business logic
- **Adding comprehensive unit tests** for CLI commands and core utilities
- **Creating integration tests** that validate real class interactions
- **Adopting hybrid test layout** with co-located tests for better maintainability
- **Migrating from Jest to Vitest** for better performance and modern features

The result is a clean, focused test suite that tests our actual functionality rather than external dependencies.

## Test Infrastructure

The project includes robust test infrastructure designed to prevent test pollution and ensure proper isolation between tests. This infrastructure was created to solve issues with leftover Git branches, worktrees, and temporary directories that were causing tests to interfere with each other.

### Core Components

#### GitTestEnvironment (`test/helpers/git-test-environment.ts`)
Creates isolated, temporary Git repositories for testing Git operations:

```typescript
import { setupGitTest } from '@test/helpers';

describe('My Git Test', () => {
  const { env, getGit, getTmpDir } = setupGitTest('my-test');

  beforeEach(() => {
    // Test environment is automatically created and cleaned up
    git = getGit();
    testDir = getTmpDir();
  });

  // Tests automatically get:
  // - Fresh temporary directory
  // - Initialized Git repository
  // - Proper Git configuration
  // - Automatic cleanup on completion/failure
});
```

#### TestResourceTracker (`test/helpers/test-resource-tracker.ts`)
Global singleton that tracks and cleans up all test resources:

- **Automatic tracking**: Git branches, worktrees, and directories
- **Process exit handlers**: Guaranteed cleanup even on crashes
- **Orphaned resource cleanup**: Removes leftover artifacts from previous runs
- **Statistics**: Track resource usage across test runs

#### Test Utilities (`test/helpers/test-utils.ts`)
Common utilities for creating test data and managing test lifecycle:

```typescript
import { createTestTask, createTestPlan, waitFor } from '@test/helpers';

// Type-safe test data generators
const task = createTestTask({ id: 'my-task', dependencies: ['other-task'] });
const plan = createTestPlan({ tasks: [task1, task2] });

// Async test utilities
await waitFor(() => condition(), { timeout: 5000, message: 'Custom error' });
```

### Usage Patterns

#### For Git Operations (VCS Integration Tests)
```typescript
import { setupGitTest } from '@test/helpers';

describe('VCS Integration', () => {
  const { getGit, getTmpDir } = setupGitTest('vcs-test');

  beforeEach(() => {
    git = getGit();        // Isolated Git instance
    testDir = getTmpDir(); // Unique temporary directory
  });

  // No afterEach needed - automatic cleanup
});
```

#### For Complex Test Data
```typescript
import { createTestPlan, createTestTask } from '@test/helpers';

const complexPlan = createTestPlan({
  tasks: [
    createTestTask({ id: 'task-1', files: ['src/component.tsx'] }),
    createTestTask({ id: 'task-2', dependencies: ['task-1'] }),
  ]
});
```

### Global Cleanup Hooks

The infrastructure includes global cleanup that runs:

- **Before tests**: Clean up orphaned resources from previous runs
- **After tests**: Ensure all tracked resources are cleaned up
- **On process exit**: Emergency cleanup for crashes or interruptions

```typescript
// Automatically imported in test setup files
import './test-infrastructure-cleanup';
```

### Benefits

- ✅ **Zero test pollution**: Each test runs in complete isolation
- ✅ **Automatic cleanup**: No manual resource management needed
- ✅ **Crash safety**: Resources cleaned up even on test failures
- ✅ **Performance**: Parallel tests don't interfere with each other
- ✅ **Debugging**: Clear error messages when resources leak

### Migration Guide

**Before (manual cleanup)**:
```typescript
describe('My Test', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    // ... manual git setup
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // ... manual git cleanup
  });
});
```

**After (using infrastructure)**:
```typescript
import { setupGitTest } from '@test/helpers';

describe('My Test', () => {
  const { getGit, getTmpDir } = setupGitTest('my-test');

  beforeEach(() => {
    git = getGit();
    testDir = getTmpDir();
  });

  // No afterEach needed!
});
```

## Execution Testing Framework

The project includes a unique execution testing framework that validates Claude's task execution approach without expensive API calls:

### How It Works

1. **Plan Generation**: Uses `chopstack decompose` to generate task DAGs from markdown specs
2. **Execution Planning**: Tests each task using `claude --permission-mode plan` to get execution plans
3. **Quality Analysis**: Analyzes plans for complexity, file operations, technical accuracy, and completeness
4. **Cost Efficiency**: ~$0.10-0.20 per task vs $2-5+ for full implementation testing

### Key Components

- **ExecutionPlanAnalyzer** (`src/utils/execution-plan-analyzer.ts`): Uses official Claude Code SDK types
- **TaskOrchestrator** (`src/mcp/orchestrator.ts`): Enhanced with `planMode` parameter
- **Test Suite** (`test/execution/plan-execution.test.ts`): Comprehensive execution planning validation

### Usage

```bash
# Run execution tests only
pnpm run test:execution

# Tests validate:
# - Plan structure and quality (0-100 score)
# - Technical detail accuracy
# - File operation mapping
# - Technology detection (React, TypeScript, etc.)
# - Comparative analysis across tasks
```

## Development Notes

- Package manager is strictly pnpm (not npm or yarn)
- Build targets Node.js 18+ with ESM-only output
- Uses incremental TypeScript builds for performance
- ESLint configuration is very strict with comprehensive rules for TypeScript, imports, and code quality
- Uses official Claude Code SDK types from `@anthropic-ai/claude-code` package
- README.md is minimal (placeholder), main documentation is in .cursorrules
- Always run `lint:fix` before committing.
