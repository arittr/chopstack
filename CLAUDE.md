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

## VCS Backend Abstraction

chopstack uses a VCS-agnostic architecture that supports multiple version control workflows through a strategy pattern and backend abstraction layer.

### Supported VCS Modes

| Mode | Status | Description | Prerequisites |
|------|--------|-------------|---------------|
| `git-spice` | ✅ Implemented | Stacked PR workflow with native git-spice operations | `gs` binary |
| `merge-commit` | ✅ Implemented | Simple merge workflow without parent tracking | `git` only |
| `graphite` | 🚧 Stub | Alternative stacked PR workflow (placeholder) | `gt` binary |
| `sapling` | 🚧 Stub | Sapling workflow (placeholder) | `sl` binary |

### VCS Backend Interface

The `VcsBackend` interface abstracts VCS tool operations (CLI wrappers):

```typescript
// src/core/vcs/interfaces.ts
export type VcsBackend = {
  // Detection & Setup
  isAvailable(): Promise<boolean>;
  initialize(workdir: string, trunk?: string): Promise<void>;

  // Branch Operations (generalized for all backends)
  createBranch(branchName: string, options: {
    parent?: string;      // For stacking backends (git-spice, graphite)
    base?: string;        // For merge-commit
    track?: boolean;      // For stack tracking
  }): Promise<void>;

  deleteBranch(branchName: string): Promise<void>;

  // Commit Operations
  commit(message: string, options: {
    files?: string[];
    allowEmpty?: boolean;
  }): Promise<string>; // Returns commit hash

  // Stack Operations (optional - only for stacking backends)
  trackBranch?(branchName: string, parent: string): Promise<void>;
  restack?(): Promise<void>;
  getStackInfo?(): Promise<StackInfo>;

  // Submission (generalized for PR/MR creation)
  submit(options: {
    branches: string[];
    draft?: boolean;
    autoMerge?: boolean;
  }): Promise<string[]>; // Returns PR URLs

  // Conflict Resolution
  hasConflicts(): Promise<boolean>;
  getConflictedFiles(): Promise<string[]>;
  abortMerge(): Promise<void>;
};
```

**Key Design Decisions**:
- Branch operations are generalized (not stack-specific)
- Optional methods (`trackBranch?`, `restack?`, `getStackInfo?`) for stacking backends only
- Conflict resolution primitives for all backends
- Submit method supports multiple backends (git-spice, graphite, GitHub API)

### VCS Strategy Pattern

The `VcsStrategy` interface defines VCS mode implementations:

```typescript
// src/core/vcs/vcs-strategy.ts
export type VcsMode = 'git-spice' | 'merge-commit' | 'graphite' | 'sapling';

export type VcsStrategy = {
  readonly name: VcsMode;

  // Lifecycle hooks
  initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void>;
  prepareExecution(tasks: ExecutionTask[], context: VcsStrategyContext): Promise<Map<string, WorktreeContext>>;
  handleTaskCompletion(task: TaskV2, executionTask: ExecutionTask, context: WorktreeContext): Promise<TaskCommitResult>;
  finalize(results: TaskCommitResult[], context: VcsStrategyContext): Promise<{ branches: string[]; commits: string[] }>;
  cleanup(): Promise<void>;

  // Capability queries
  supportsParallelExecution(): boolean;
  requiresWorktrees(): boolean;
  supportsStacking(): boolean;
};

export type VcsStrategyContext = {
  cwd: string;
  baseRef?: string;
  backend: VcsBackend;  // Explicit backend selection
};

export type WorktreeContext = {
  taskId: string;
  branchName: string;
  worktreePath: string;
  absolutePath: string;
  baseRef: string;
  created: string; // ISO timestamp
};

export type TaskCommitResult = {
  taskId: string;
  commitHash?: string;
  branchName?: string;
  error?: string;
};
```

**Strategy Selection**:
```typescript
// src/services/vcs/vcs-strategy-factory.ts
import { match } from 'ts-pattern';

const strategy = match(mode)
  .with('git-spice', () => new GitSpiceStrategy(vcsEngine))
  .with('merge-commit', () => new MergeCommitStrategy(vcsEngine))
  .with('graphite', () => new GraphiteStrategy(vcsEngine))
  .with('sapling', () => new SaplingStrategy(vcsEngine))
  .exhaustive();
```

### VCS Mode Configuration

**Configuration Priority**: CLI args > config file > defaults

**1. Explicit Mode** (user configured):
```yaml
# ~/.chopstack/config.yaml
vcs:
  mode: git-spice  # Tool MUST be available (no fallback)
  trunk: main
  worktree_path: .chopstack/shadows
  auto_restack: true
  submit_on_complete: false
```

**2. Default Mode** (no configuration):
- Uses `merge-commit` (requires only git)
- Always succeeds if git is available
- User can configure explicit mode for stacking workflows

**Configuration Service**:
```typescript
// src/services/vcs/vcs-config.ts
export class VcsConfigServiceImpl implements VcsConfigService {
  async loadConfig(workdir: string, cliMode?: VcsMode): Promise<VcsConfig> {
    // Priority: CLI args > file > defaults
    const fileConfig = await this._loadConfigFile();

    return {
      mode: cliMode ?? fileConfig?.vcs?.mode,
      workdir,
      trunk: fileConfig?.vcs?.trunk ?? 'main',
      worktreePath: fileConfig?.vcs?.worktree_path ?? '.chopstack/shadows',
      branchPrefix: fileConfig?.vcs?.branch_prefix ?? 'task',
      autoRestack: fileConfig?.vcs?.auto_restack ?? true,
      submitOnComplete: fileConfig?.vcs?.submit_on_complete ?? false,
    };
  }

  async validateMode(mode: VcsMode, explicitMode: boolean): Promise<VcsMode> {
    const backend = await this.createBackend(mode, this.config?.workdir ?? process.cwd());
    const available = await backend.isAvailable();

    if (!available && explicitMode) {
      // Explicit mode MUST be available - fail with installation instructions
      throw new Error(`VCS mode '${mode}' is not available. Install required tools...`);
    }

    if (!available) {
      // Auto-detected mode - fallback to merge-commit
      logger.warn(`VCS mode '${mode}' not available, falling back to merge-commit`);
      return 'merge-commit';
    }

    return mode;
  }

  async createBackend(mode: VcsMode, workdir: string): Promise<VcsBackend> {
    return match(mode)
      .with('git-spice', () => new GitSpiceBackend(workdir))
      .with('merge-commit', () => new MergeCommitBackend(workdir))
      .with('graphite', () => new GraphiteBackend(workdir))
      .with('sapling', () => new SaplingBackend(workdir))
      .exhaustive();
  }
}
```

### Backend Implementations

#### GitSpiceBackend (Existing)

**Location**: `src/adapters/vcs/git-spice/backend.ts`

**Features**:
- Native git-spice operations via `gs` CLI
- Stack branch creation with parent tracking
- Automatic restacking (`gs upstack restack`)
- Stack submission (`gs stack submit`)

**Example Usage**:
```typescript
const backend = new GitSpiceBackend('/path/to/repo');
await backend.initialize('/path/to/repo', 'main');

// Create stacked branch
await backend.createBranch('task/feature-1', {
  parent: 'main',
  track: true,
});

// Commit in stack
const hash = await backend.commit('[task-1] Implement feature', {
  files: ['src/feature.ts'],
});

// Restack after changes
await backend.restack?.();

// Submit stack for review
const prUrls = await backend.submit({
  branches: ['task/feature-1'],
  draft: false,
});
```

#### MergeCommitBackend (New)

**Location**: `src/adapters/vcs/merge-commit/backend.ts`

**Features**:
- Simple merge workflow without parent tracking
- Branch creation from merge-base
- Merge completed branches with `--no-ff` flag
- No stack-specific operations

**Example Usage**:
```typescript
const backend = new MergeCommitBackend('/path/to/repo');
await backend.initialize('/path/to/repo', 'main');

// Create branch from base
await backend.createBranch('task/feature-1', {
  base: 'main',
});

// Commit changes
const hash = await backend.commit('[task-1] Implement feature', {
  files: ['src/feature.ts'],
});

// No restack needed (not a stacking backend)
// Manual merge or PR submission required
```

#### GraphiteBackend (Stub)

**Location**: `src/adapters/vcs/graphite/backend.ts`

**Status**: Placeholder for future implementation

**Example**:
```typescript
export class GraphiteBackend implements VcsBackend {
  async isAvailable(): Promise<boolean> {
    logger.warn('GraphiteBackend not yet implemented');
    return false;
  }

  async initialize(): Promise<void> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }
  // ...other methods throw similar errors
}
```

**Future Implementation Notes**:
- Use `gt` CLI via execa (similar to GitSpiceBackend pattern)
- Commands: `gt branch create`, `gt commit create`, `gt restack`, `gt stack submit`
- Estimated complexity: M (600-800 lines, 4-6 days)
- Reusability: 70% from git-spice patterns

#### SaplingBackend (Stub)

**Location**: `src/adapters/vcs/sapling/backend.ts`

**Status**: Placeholder documenting worktree incompatibility

**Note**: Sapling uses a different model incompatible with git worktrees. Future implementation would require significant architecture changes.

## MCP VCS Tools

chopstack exposes VCS operations through 5 MCP tools that enable worktree-based parallel execution.

### Tool 1: configure_vcs

**Purpose**: Configure VCS mode and verify tool availability

**Parameters**:
```typescript
{
  mode?: 'git-spice' | 'merge-commit' | 'graphite' | 'sapling',
  workdir: string,
  trunk?: string
}
```

**Response**:
```typescript
{
  status: 'success' | 'failed',
  mode?: VcsMode,
  available?: boolean,
  capabilities?: {
    supportsStacking: boolean,
    supportsParallel: boolean
  },
  error?: string
}
```

**Example**:
```typescript
// Explicit mode (must be available)
const result = await mcp.callTool('configure_vcs', {
  mode: 'git-spice',
  workdir: '/path/to/repo',
  trunk: 'main'
});
// Result: { status: 'success', mode: 'git-spice', available: true, capabilities: {...} }

// Default mode (merge-commit)
const result = await mcp.callTool('configure_vcs', {
  workdir: '/path/to/repo'
});
// Result: { status: 'success', mode: 'merge-commit', available: true, capabilities: {...} }
```

**Error Behavior**:
- Explicit mode: Fails if tool unavailable (no fallback)
- Default mode: Uses merge-commit (requires only git)

### Tool 2: create_task_worktree

**Purpose**: Create isolated worktree for task execution

**Parameters**:
```typescript
{
  taskId: string,           // Regex: ^[a-z0-9-]+$
  baseRef: string,          // Git reference to branch from
  workdir?: string,
  task?: {
    name: string,
    files?: string[]
  }
}
```

**Response**:
```typescript
{
  status: 'success' | 'failed',
  taskId: string,
  path?: string,           // Relative path
  absolutePath?: string,   // Absolute path
  branch?: string,         // Created branch name
  baseRef?: string,        // Base git reference
  error?: string
}
```

**Example**:
```typescript
const result = await mcp.callTool('create_task_worktree', {
  taskId: 'task-1-implement-auth',
  baseRef: 'main',
  workdir: '/path/to/repo',
  task: {
    name: 'Implement authentication',
    files: ['src/auth/login.ts']
  }
});
// Result: {
//   status: 'success',
//   taskId: 'task-1-implement-auth',
//   path: '.chopstack/shadows/task-1-implement-auth',
//   absolutePath: '/path/to/repo/.chopstack/shadows/task-1-implement-auth',
//   branch: 'task/task-1-implement-auth',
//   baseRef: 'main'
// }
```

**Error Handling**:
- Branch name collisions: Retry with unique suffixes
- Path conflicts: Cleanup and retry

### Tool 3: integrate_task_stack

**Purpose**: Integrate completed task branches based on VCS mode

**Parameters**:
```typescript
{
  tasks: Array<{
    id: string,
    name: string,
    branchName?: string
  }>,
  targetBranch: string,
  submit?: boolean,
  workdir?: string
}
```

**Response**:
```typescript
{
  status: 'success' | 'failed',
  branches: string[],
  conflicts?: Array<{
    taskId: string,
    files: string[],
    resolution: string
  }>,
  prUrls?: string[],
  error?: string
}
```

**Example (Sequential Stack)**:
```typescript
const result = await mcp.callTool('integrate_task_stack', {
  tasks: [{ id: 'task-1', name: 'Setup types', branchName: 'task/task-1' }],
  targetBranch: 'main',
  submit: false,
  workdir: '/path/to/repo'
});
// Result: {
//   status: 'success',
//   branches: ['task/task-1'],
//   conflicts: []
// }
```

**Example (Parallel Stack with PRs)**:
```typescript
const result = await mcp.callTool('integrate_task_stack', {
  tasks: [
    { id: 'task-2a', name: 'Component A', branchName: 'task/task-2a' },
    { id: 'task-2b', name: 'Component B', branchName: 'task/task-2b' }
  ],
  targetBranch: 'main',
  submit: true,
  workdir: '/path/to/repo'
});
// Result: {
//   status: 'success',
//   branches: ['task/task-2a', 'task/task-2b'],
//   conflicts: [],
//   prUrls: ['https://github.com/org/repo/pull/123', 'https://github.com/org/repo/pull/124']
// }
```

**Mode-Specific Behavior**:
- **git-spice**: Creates stacked branches with parent tracking, optionally submits via `gs stack submit`
- **merge-commit**: Merges branches to target with `--no-ff`, manual PR creation
- **graphite**: Restacks and optionally submits via `gt stack submit`

### Tool 4: cleanup_task_worktree

**Purpose**: Remove worktree from filesystem and optionally delete branch

**Parameters**:
```typescript
{
  taskId: string,
  keepBranch?: boolean,  // Default: false
  workdir?: string
}
```

**Response**:
```typescript
{
  status: 'success' | 'failed',
  taskId: string,
  cleaned: boolean,
  branchDeleted?: boolean,
  error?: string
}
```

**Example**:
```typescript
// Delete worktree and branch
const result = await mcp.callTool('cleanup_task_worktree', {
  taskId: 'task-1-implement-auth',
  keepBranch: false,
  workdir: '/path/to/repo'
});
// Result: { status: 'success', taskId: 'task-1-implement-auth', cleaned: true, branchDeleted: true }

// Delete worktree, keep branch (useful for git-spice stacks)
const result = await mcp.callTool('cleanup_task_worktree', {
  taskId: 'task-1-implement-auth',
  keepBranch: true,
  workdir: '/path/to/repo'
});
// Result: { status: 'success', taskId: 'task-1-implement-auth', cleaned: true, branchDeleted: false }
```

### Tool 5: list_task_worktrees

**Purpose**: List all active worktrees for repository

**Parameters**:
```typescript
{
  workdir?: string,
  includeOrphaned?: boolean  // Default: false
}
```

**Response**:
```typescript
{
  status: 'success' | 'failed',
  worktrees?: Array<{
    taskId: string,
    path: string,
    absolutePath: string,
    branch: string,
    baseRef: string,
    created: string,        // ISO 8601 timestamp
    status?: 'active' | 'orphaned'
  }>,
  error?: string
}
```

**Example**:
```typescript
const result = await mcp.callTool('list_task_worktrees', {
  workdir: '/path/to/repo',
  includeOrphaned: true
});
// Result: {
//   status: 'success',
//   worktrees: [
//     {
//       taskId: 'task-1-implement-auth',
//       path: '.chopstack/shadows/task-1-implement-auth',
//       absolutePath: '/path/to/repo/.chopstack/shadows/task-1-implement-auth',
//       branch: 'task/task-1-implement-auth',
//       baseRef: 'main',
//       created: '2025-10-16T10:30:00Z',
//       status: 'active'
//     }
//   ]
// }
```

### MCP Tool Implementation Pattern

All VCS MCP tools follow a thin adapter pattern:

```typescript
// src/entry/mcp/tools/vcs-tools.ts
export function registerVcsTools(
  mcp: FastMCP,
  vcsEngine: VcsEngineService
): void {
  mcp.addTool({
    name: 'configure_vcs',
    description: 'Configure VCS mode and verify tool availability',
    parameters: ConfigureVcsSchema,
    execute: async (params) => {
      try {
        const mode = params.mode ?? 'merge-commit';
        const explicitMode = params.mode !== undefined;

        const backend = await createBackend(mode, params.workdir);
        const available = await backend.isAvailable();

        if (!available && explicitMode) {
          return JSON.stringify({
            status: 'failed',
            mode,
            available: false,
            error: `VCS tool for mode '${mode}' not found. Install required tools...`,
          });
        }

        await backend.initialize(params.workdir, params.trunk);

        return JSON.stringify({
          status: 'success',
          mode,
          available: true,
          capabilities: {
            supportsStacking: ['git-spice', 'graphite', 'sapling'].includes(mode),
            supportsParallel: true,
          },
        });
      } catch (error) {
        return JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  // Additional tools registered similarly...
}
```

**Key Principles**:
- Tools are thin wrappers with no business logic
- All operations delegated to VcsEngineService or VcsStrategy
- Return `JSON.stringify()` responses per FastMCP convention
- Emit events via ExecutionEventBus for TUI integration
- Use Zod schemas for comprehensive parameter validation

### Slash Command Integration

Slash commands use MCP VCS tools for worktree-based execution:

**Sequential Execution Flow**:
```markdown
1. Call: configure_vcs(mode)
2. For each task:
   a. Call: create_task_worktree(task-id, current_branch)
   b. Spawn agent with worktree-specific prompt
   c. Wait for completion
   d. Call: integrate_task_stack([task-id], current_branch)
   e. Call: cleanup_task_worktree(task-id)
   f. Update current_branch (mode-specific)
3. Result: Linear stack (main → task-1 → task-2)
```

**Parallel Execution Flow**:
```markdown
1. Call: configure_vcs(mode)
2. Bulk create worktrees:
   For each task: create_task_worktree(task-id, main)
3. Spawn ALL agents concurrently (isolated worktrees)
4. Wait for all completions
5. Call: integrate_task_stack([all-task-ids], main)
6. Handle conflicts if reported
7. Cleanup all worktrees
8. Result: Parallel stack (main → [task-a, task-b, task-c])
```

### Extension Guide

**Adding a New VCS Backend**:

1. Create backend implementation:
```typescript
// src/adapters/vcs/my-vcs/backend.ts
export class MyVcsBackend implements VcsBackend {
  async isAvailable(): Promise<boolean> {
    // Check for binary (e.g., 'my-vcs')
  }

  async initialize(workdir: string, trunk?: string): Promise<void> {
    // Initialize VCS backend
  }

  async createBranch(branchName: string, options: {...}): Promise<void> {
    // Use execa to call VCS CLI
  }

  // Implement remaining methods...
}
```

2. Add to VcsConfigService:
```typescript
// src/services/vcs/vcs-config.ts
async createBackend(mode: VcsMode, workdir: string): Promise<VcsBackend> {
  return match(mode)
    .with('git-spice', () => new GitSpiceBackend(workdir))
    .with('merge-commit', () => new MergeCommitBackend(workdir))
    .with('graphite', () => new GraphiteBackend(workdir))
    .with('my-vcs', () => new MyVcsBackend(workdir))  // Add here
    .exhaustive();
}
```

3. Update VcsMode type:
```typescript
// src/core/vcs/vcs-strategy.ts
export type VcsMode = 'git-spice' | 'merge-commit' | 'graphite' | 'sapling' | 'my-vcs';
```

4. Add comprehensive tests:
```typescript
// src/adapters/vcs/my-vcs/__tests__/backend.test.ts (unit tests)
// src/adapters/vcs/my-vcs/__tests__/backend.integration.test.ts (integration)
```

**Testing Pattern**:
```typescript
import { setupGitTest } from '@test/helpers';

describe('MyVcsBackend', () => {
  const { getGit, getTmpDir } = setupGitTest('my-vcs-backend');

  beforeEach(() => {
    git = getGit();
    testDir = getTmpDir();
  });

  it('should create branch with VCS-specific command', async () => {
    const backend = new MyVcsBackend(testDir);
    await backend.createBranch('feature-1', { parent: 'main' });
    // Assertions...
  });
});
```

## Development Notes

- Package manager is strictly pnpm (not npm or yarn)
- Build targets Node.js 18+ with ESM-only output
- Uses incremental TypeScript builds for performance
- ESLint configuration is very strict with comprehensive rules for TypeScript, imports, and code quality
- Uses official Claude Code SDK types from `@anthropic-ai/claude-code` package
- README.md is minimal (placeholder), main documentation is in .cursorrules
- Always run `lint:fix` before committing.
