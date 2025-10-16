# Codebase Architecture Analysis

## Executive Summary

This document provides comprehensive architectural context for implementing VCS-agnostic worktree management as an MCP server. The analysis identifies key components, integration points, and patterns that should be leveraged or modified.

**Key Finding**: chopstack has a well-structured VCS layer with strategy patterns, domain services, and event-driven architecture. The implementation should extract and adapt these components into a slim MCP server while maintaining the existing abstractions.

---

## 1. Technology Stack

### Runtime & Build

- **Runtime**: Node.js >=18.0.0 with ESM-only modules
- **Language**: TypeScript 5.9.2 with very strict configuration
- **Package Manager**: pnpm 10.8.0 (strictly enforced)
- **Build Tool**: tsup for fast ESM builds with dual entry points
- **Dev Tools**: tsx for development, vitest for testing

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `simple-git` | ^3.28.0 | Git operations wrapper |
| `execa` | ^9.6.0 | Process execution (CLI spawning) |
| `fastmcp` | ^3.16.0 | MCP server framework |
| `zod` | ^4.1.4 | Runtime schema validation |
| `ts-pattern` | ^5.8.0 | Pattern matching for control flow |
| `chalk` | ^5.6.2 | Terminal colors (logging) |
| `commander` | ^14.0.1 | CLI framework |

### TypeScript Configuration Highlights

```json
{
  "strict": true,
  "noImplicitReturns": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "module": "ES2022",
  "moduleResolution": "Bundler"
}
```

**Critical**: All code must satisfy very strict TypeScript checks. Use type guards from `@/validation/guards` instead of inline checks.

---

## 2. VCS Infrastructure Analysis

### 2.1 Existing VCS Services (`src/services/vcs/`)

#### Core Services

**`WorktreeServiceImpl`** (`worktree-service.ts`)
- **Purpose**: Manages worktree lifecycle (create, remove, cleanup)
- **Pattern**: Domain service with EventEmitter for lifecycle events
- **Key Features**:
  - Unique branch name generation with timestamp suffixes
  - Commit hash resolution to avoid checkout conflicts
  - Event emission: `worktree_created`, `worktree_cleanup`, `worktree_error`
  - Automatic cleanup of shadows directory
- **Dependencies**: GitWrapper, global-logger
- **Reusability**: 95% - Direct integration into MCP server

**`VcsEngineServiceImpl`** (`vcs-engine-service.ts`)
- **Purpose**: Orchestrates all VCS domain services (facade pattern)
- **Pattern**: Dependency injection with service composition
- **Key Services Coordinated**:
  - WorktreeService
  - CommitService
  - RepositoryService
  - AnalysisService
  - ConflictResolutionService
  - StackBuildService
- **Key Features**:
  - GitOperationQueue for serializing index-conflicting operations
  - Event forwarding from child services
  - Stack state initialization and incremental building
- **Reusability**: 60% - Too heavyweight for MCP, but strategy pattern is valuable

**`StackBuildServiceImpl`** (`stack-build-service.ts`)
- **Purpose**: Builds git-spice stacks from completed tasks
- **Backend**: GitSpiceBackend for native git-spice operations
- **Key Features**:
  - Incremental stack building (addTaskToStack)
  - Dependency-order task reordering
  - Stack submission via `gs stack submit`
  - Cumulative commit stacking
- **Reusability**: 80% - Core stacking logic reusable, needs VCS abstraction

#### VCS Strategies (`src/services/vcs/strategies/`)

**`VcsStrategyFactory`** (`vcs-strategy-factory.ts`)
```typescript
create(mode: VcsMode): VcsStrategy {
  switch (mode) {
    case 'simple': return new SimpleVcsStrategy();
    case 'worktree': return new WorktreeVcsStrategy(this._vcsEngine);
    case 'stacked': return new StackedVcsStrategy(this._vcsEngine);
  }
}
```

**Existing Strategies**:
- **SimpleVcsStrategy**: No worktrees, commits directly to main
- **WorktreeVcsStrategy**: Creates isolated worktrees per task
- **StackedVcsStrategy**: Worktrees + git-spice stacking

**Gap Analysis**: No strategies for merge-commit or graphite workflows.

#### Adapters (`src/adapters/vcs/`)

**`GitWrapper`** (`git-wrapper.ts`)
- **Purpose**: Typed interface over simple-git with worktree support
- **Key Methods**:
  - `createWorktree(path, ref, branch?)` - Handles branch creation
  - `removeWorktree(path, force?)` - With automatic retry logic
  - `listWorktrees()` - Parses porcelain output
  - `branchExists(name)` - Branch validation
- **Reusability**: 100% - Already stable and well-tested

**`GitSpiceBackend`** (`git-spice/backend.ts`)
- **Purpose**: Native git-spice operations via `gs` CLI
- **Key Methods**:
  - `createStackBranch(branchName, parentBranch, workdir)` - `gs branch create`
  - `commitInStack(message, workdir, options)` - `gs commit create`
  - `restack(workdir)` - `gs upstack restack`
  - `submitStack(workdir, options)` - `gs stack submit`
  - `trackBranch(branchName, parentBranch, workdir)` - `gs branch track`
- **Key Features**:
  - Detailed error extraction from execa errors
  - Worktree detection and path handling
  - Timeout handling (120s for branch ops, 30s for commits)
- **Reusability**: 90% - Core logic reusable, needs interface adaptation

### 2.2 Core Interfaces (`src/core/vcs/`)

**Domain Services** (`domain-services.ts`)
```typescript
export type WorktreeService = {
  createWorktree(options: WorktreeCreateOptions): Promise<WorktreeContext>;
  removeWorktree(taskId: string): Promise<void>;
  cleanupWorktrees(taskIds: string[]): Promise<void>;
  getActiveWorktrees(): WorktreeContext[];
  hasWorktree(taskId: string): boolean;
}

export type StackBuildService = {
  initializeStackState(parentRef: string): void;
  addTaskToStack(task, workdir, worktreeContext?): Promise<string | null>;
  buildStack(tasks, workdir, options): Promise<StackInfo>;
  restack(workdir): Promise<void>;
  submitStack(workdir): Promise<string[]>;
  // ...and more
}
```

**VCS Backend Interface** (`interfaces.ts`)
```typescript
export type VcsBackend = {
  isAvailable(): Promise<boolean>;
  initialize(workdir, trunk?): Promise<void>;
  createStackBranch(branchName, parentBranch, workdir): Promise<void>;
  commitInStack(message, workdir, options): Promise<string>;
  restack(workdir): Promise<void>;
  submitStack(workdir, options): Promise<string[]>;
  trackBranch(branchName, parentBranch, workdir): Promise<void>;
}
```

**Key Insight**: The `VcsBackend` interface is already VCS-agnostic and can be extended to support merge-commit and graphite workflows.

### 2.3 Event Architecture (`src/services/events/`)

**`ExecutionEventBus`** (`execution-event-bus.ts`)
- **Purpose**: Centralized event bus for execution lifecycle
- **Pattern**: EventEmitter with type-safe event emission
- **Event Categories**:
  - Task events: `task:start`, `task:progress`, `task:complete`, `task:failed`
  - Stream events: `stream:data` (Claude CLI streaming)
  - Log events: `log` (general logging)
  - VCS events: `vcs:branch-created`, `vcs:commit`
- **Max Listeners**: 50 (for parallel execution)
- **Reusability**: 100% - MCP tools should emit events for TUI integration

**`ExecutionEventConsumer`** (`execution-event-consumer.ts`)
- **Purpose**: Filters and consumes events based on verbose flag
- **Integration**: Connects event bus to logger and TUI
- **Reusability**: 70% - MCP server may need simpler consumer

---

## 3. MCP Server Structure

### Current MCP Server (`src/entry/mcp/server.ts`)

**Framework**: FastMCP (built on official MCP SDK)

**Current Tools**:
- `execute_task` - Single task execution (serial/parallel)
- `execute_parallel_tasks` - DISABLED, needs VcsEngine integration
- `create_worktree` - GitWorkflowManager.createWorktree
- `create_stack_branch` - GitWorkflowManager.createStackBranch
- `merge_parallel_work` - GitWorkflowManager.mergeParallelWork
- `cleanup_worktree` - GitWorkflowManager.cleanupWorktree
- `list_worktrees` - GitWorkflowManager.listWorktrees
- `list_running_tasks` - TaskOrchestrator status
- `stop_task` - TaskOrchestrator.stopTask
- `get_task_output` - TaskOrchestrator.getTaskOutput
- `get_task_updates` - Streaming updates

**GitWorkflowManager Class** (inline implementation)
```typescript
class GitWorkflowManager {
  async createWorktree(params): Promise<...> {
    // Uses raw execa('git', ['worktree', 'add', ...])
    // Supports gs branch create fallback
  }

  async createStackBranch(params): Promise<...> {
    // Checks for gs availability
    // Falls back to git checkout -b
  }

  async mergeParallelWork(params): Promise<...> {
    // Supports merge vs rebase strategies
  }
}
```

**Gap Analysis**:
- GitWorkflowManager duplicates WorktreeService functionality
- No VCS strategy abstraction
- Tightly coupled to git-spice
- Missing VCS mode configuration
- No integration with existing VCS services

**Recommendation**: Replace GitWorkflowManager with VCS strategy pattern using existing services.

### MCP Tool Schemas (`src/entry/mcp/schemas/`)

**`execute-task.ts`**: ExecuteTaskSchema (Zod)
- taskId, title, prompt, files, strategy, workdir

**`git-workflow.ts`**: CreateWorktreeSchema, CreateStackBranchSchema, MergeParallelWorkSchema
- Basic schemas, need VCS mode support

---

## 4. Orchestration Layer (`src/services/orchestration/`)

### Task Orchestration (`task-orchestrator.ts`)

**Purpose**: Manages parallel task execution with Claude CLI adapters

**Key Components**:
- `TaskExecutionAdapter` interface (abstraction)
- `ClaudeCliTaskExecutionAdapter` (default implementation)
- `MockTaskExecutionAdapter` (testing)
- `DynamicTaskExecutionAdapter` (agent switching)

**Integration Points**:
- Emits events via ExecutionEventBus
- Tracks task statuses and outputs
- Supports plan mode vs execute mode

**Reusability**: 100% - MCP server already uses TaskOrchestrator

---

## 5. Type System (`src/types/`)

### Core Schemas (`schemas-v2.ts`)

**Plan Schema** (Zod):
```typescript
export const planSchemaV2 = z.object({
  name: z.string(),
  strategy: z.enum(['sequential', 'parallel', 'phased-parallel']),
  phases: z.array(phaseSchema).optional(),
  tasks: z.array(taskV2Schema),
  successMetrics: successMetricsSchema.optional(),
});
```

**Task Schema** (Zod):
```typescript
export const taskV2Schema = z.object({
  id: z.string().regex(/^[\da-z-]+$/),
  name: z.string(),
  complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']),
  description: z.string(),
  files: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
});
```

**Phase Schema** (Zod):
```typescript
export const phaseSchema = z.object({
  id: z.string().regex(/^[\da-z-]+$/),
  name: z.string(),
  strategy: z.enum(['sequential', 'parallel']),
  tasks: z.array(z.string()),
  requires: z.array(z.string()).default([]),
});
```

**Key Validation**: Cross-references validated via `.refine()` (phase tasks → task IDs, phase dependencies → phase IDs).

---

## 6. Logging Architecture

### Dual Logging Systems

**System 1: Service Logger** (`src/utils/global-logger.ts`)
- **Purpose**: General application logging (VCS, orchestration, planning)
- **When to Use**: User-facing messages, debug logs, service operations
- **Examples**: `logger.info('Creating worktree...')`, `logger.error('Failed to commit')`
- **Features**: Color-coded console output, TUI integration, file logging
- **Control**: `--verbose` flag and `LOG_LEVEL` env var

**System 2: Execution Event Bus** (`src/services/events/`)
- **Purpose**: Task execution lifecycle and Claude stream events
- **When to Use**: Task start/complete, stream data, VCS operations
- **Examples**: `eventBus.emitTaskStart()`, `eventBus.emitBranchCreated()`
- **Features**: Type-safe events, multiple consumers (TUI, metrics, webhooks)

**Integration Points**:
- CLI entry point configures both systems
- Task execution adapters emit events
- VCS services use logger for internal ops

---

## 7. Testing Infrastructure

### Test Types

| Type | Location | Pattern | Timeout | Purpose |
|------|----------|---------|---------|---------|
| Unit | `src/**/__tests__/*.test.ts` | Heavy mocking | 5s | Isolated logic tests |
| Integration | `src/**/__tests__/*.integration.test.ts` | Real classes, mocked externals | 15s | Real class interactions |
| E2E | `test/e2e/**/*.test.ts` | Real CLI commands | 30s | User-facing behavior |
| Execution | `test/execution/**/*.test.ts` | Claude plan mode | 60s | Execution planning validation |

### Test Helpers (`test/helpers/`)

**`GitTestEnvironment`** (`git-test-environment.ts`)
```typescript
const { env, getGit, getTmpDir } = setupGitTest('my-test');
// Auto-cleanup of worktrees, branches, temp directories
```

**`TestResourceTracker`** (`test-resource-tracker.ts`)
- Global singleton for tracking test resources
- Process exit handlers for guaranteed cleanup
- Orphaned resource cleanup

**Key Pattern**: Use `setupGitTest()` for all VCS integration tests to prevent pollution.

### Vitest Configuration

```typescript
// vitest.config.ts
projects: [
  { name: 'unit', include: ['src/**/__tests__/*.test.ts'], testTimeout: 5000 },
  { name: 'integration', include: ['src/**/__tests__/*.integration.test.ts'], testTimeout: 15000 },
  { name: 'e2e', include: ['test/e2e/**/*.test.ts'], testTimeout: 30000 },
  { name: 'execution', include: ['test/execution/**/*.test.ts'], testTimeout: 60000 },
]
```

**Run Commands**:
```bash
pnpm test:unit          # Fast unit tests only
pnpm test:integration   # Integration tests
pnpm test:e2e           # End-to-end CLI tests
pnpm test               # All tests
```

---

## 8. Code Style & Patterns

### Mandatory Patterns

**1. Pattern Matching with ts-pattern**
```typescript
import { match, P } from 'ts-pattern';

const result = match(vcsMode)
  .with('git-spice', () => new GitSpiceStrategy())
  .with('merge-commit', () => new MergeCommitStrategy())
  .exhaustive(); // MUST be exhaustive
```

**2. Type Guards from `@/validation/guards`**
```typescript
import { isNonEmptyString, isNonNullish, hasContent } from '@/validation/guards';

// NEVER use inline checks like `=== undefined`, `!== null`
if (isNonEmptyString(branchName)) { ... }
if (isNonNullish(options)) { ... }
```

**3. Named Exports Only**
```typescript
// ❌ WRONG
export default function createWorktree() { ... }

// ✅ CORRECT
export function createWorktree() { ... }
```

**4. Explicit Return Types**
```typescript
// ❌ WRONG
async function commitInStack(message: string) { ... }

// ✅ CORRECT
async function commitInStack(message: string): Promise<string> { ... }
```

### Import Organization

```typescript
// 1. Node.js built-ins (with node: protocol)
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';

// 2. External dependencies
import { execa } from 'execa';
import { z } from 'zod';

// 3. Internal imports (use @/ alias)
import { logger } from '@/utils/global-logger';
import type { VcsBackend } from '@/core/vcs/interfaces';
```

**Critical**: ALWAYS use extensionless imports. Build system handles resolution.

### Naming Conventions

- **Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Files**: `kebab-case.ts`
- **Private Members**: Leading underscore (`_workdir`)
- **Constants**: `UPPER_SNAKE_CASE`

---

## 9. Integration Points for VCS-Agnostic MCP

### 9.1 Reusable Components

**High Priority** (Direct Integration):
1. `WorktreeServiceImpl` - Worktree lifecycle (95% reusable)
2. `GitWrapper` - Git operations abstraction (100% reusable)
3. `GitSpiceBackend` - git-spice native operations (90% reusable)
4. `ExecutionEventBus` - Event-driven logging (100% reusable)
5. `setupGitTest()` - Test infrastructure (100% reusable)

**Medium Priority** (Adapt with Abstraction):
1. `StackBuildServiceImpl` - Core stacking logic (80% reusable, needs VCS abstraction)
2. `VcsStrategyFactory` - Strategy pattern (70% reusable, needs new strategies)
3. Domain service interfaces - Clean separation (90% reusable)

**Low Priority** (Reference Only):
1. `VcsEngineServiceImpl` - Too heavyweight for MCP (30% reusable)
2. CLI orchestration - Different architecture (20% reusable)

### 9.2 New Components Needed

**VCS Strategy Implementations**:
```
src/services/vcs/strategies/
  merge-commit-strategy.ts   # NEW: Simple merge workflow
  graphite-strategy.ts       # NEW: Graphite stacking
  sapling-strategy.ts        # NEW: Sapling (placeholder)
```

**MCP Tool Definitions**:
```
src/entry/mcp/tools/
  vcs-tools.ts               # NEW: MCP tool implementations
  vcs-config.ts              # NEW: VCS mode configuration
```

**VCS Orchestrator Facade**:
```
src/services/vcs/
  vcs-orchestrator.ts        # NEW: Slim facade for MCP tools
```

### 9.3 Modified Components

**`src/entry/mcp/server.ts`**:
- Replace `GitWorkflowManager` with `VcsOrchestrator`
- Add VCS mode configuration tool
- Update tool schemas to include VCS mode

**`src/services/vcs/strategies/vcs-strategy-factory.ts`**:
- Add `merge-commit`, `graphite`, `sapling` cases
- Add VCS backend factory logic

**`src/core/vcs/interfaces.ts`**:
- Extend `VcsBackend` interface for merge-commit operations
- Add VCS mode type union

### 9.4 Event Flow

```
MCP Tool Call (create_task_worktree)
  ↓
VcsOrchestrator.createWorktree(taskId, baseRef)
  ↓
VcsStrategyFactory.create(vcsMode) → Strategy
  ↓
WorktreeService.createWorktree(options)
  ↓
GitWrapper.createWorktree(path, ref, branch)
  ↓
EventBus.emitBranchCreated(branchName, parentBranch)
  ↓
Logger.info("Worktree created") + TUI Update
```

---

## 10. Configuration Strategy

### Current Configuration

**None** - VCS mode is hardcoded in strategy selection.

### Proposed Configuration

**1. CLI Flags** (highest priority):
```bash
chopstack execute --vcs-mode git-spice --worktree-path /tmp/chopstack
```

**2. Project Config** (`.chopstack/config.yaml`):
```yaml
vcs:
  mode: git-spice
  worktree_path: .chopstack/shadows
  cleanup_on_success: true
  cleanup_on_failure: false
```

**3. Global Config** (`~/.chopstack/config.yaml`):
```yaml
vcs:
  default_mode: git-spice
```

**4. Auto-Detection** (lowest priority):
- Check for `gs` binary → git-spice
- Check for `gt` binary → graphite
- Check for `sl` binary → sapling
- Fallback → merge-commit

### Configuration Service

```typescript
// src/services/vcs/vcs-config.ts
export type VcsConfig = {
  mode: VcsMode;
  worktreePath: string;
  cleanupOnSuccess: boolean;
  cleanupOnFailure: boolean;
}

export class VcsConfigService {
  static loadConfig(cwd: string, flags: CliFlags): VcsConfig {
    // Priority: flags > project > global > auto-detect
  }
}
```

---

## 11. Architecture Recommendations

### Design Principles

1. **Slash Commands = Orchestration**: Task sequencing, agent spawning, validation
2. **MCP = VCS Primitives**: Worktree lifecycle, branch management, conflict handling
3. **VCS-Agnostic**: Strategy pattern for git-spice, merge-commit, graphite, sapling
4. **Optional MCP**: Fallback to same-directory execution with warning

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  Slash Commands (Orchestration Layer)  │
│  - /execute-phase                       │
│  - /build-plan                          │
│  - /build-spec                          │
└─────────────────┬───────────────────────┘
                  │ (calls MCP tools)
┌─────────────────▼───────────────────────┐
│  MCP Server (VCS Primitives)            │
│  - configure_vcs()                      │
│  - create_task_worktree()               │
│  - integrate_task_stack()               │
│  - cleanup_task_worktree()              │
└─────────────────┬───────────────────────┘
                  │ (delegates to)
┌─────────────────▼───────────────────────┐
│  VCS Orchestrator (Facade)              │
│  - VcsStrategyFactory                   │
│  - VcsConfigService                     │
└─────────────────┬───────────────────────┘
                  │ (creates strategy)
┌─────────────────▼───────────────────────┐
│  VCS Strategies (Strategy Pattern)      │
│  - GitSpiceStrategy                     │
│  - MergeCommitStrategy                  │
│  - GraphiteStrategy                     │
│  - SaplingStrategy                      │
└─────────────────┬───────────────────────┘
                  │ (uses services)
┌─────────────────▼───────────────────────┐
│  Domain Services                        │
│  - WorktreeService                      │
│  - StackBuildService                    │
│  - CommitService                        │
└─────────────────┬───────────────────────┘
                  │ (uses adapters)
┌─────────────────▼───────────────────────┐
│  VCS Adapters                           │
│  - GitWrapper (simple-git)              │
│  - GitSpiceBackend (gs CLI)             │
│  - GraphiteBackend (gt CLI)             │
└─────────────────────────────────────────┘
```

### Strategy Interface Design

```typescript
// src/core/vcs/vcs-strategy.ts
export type VcsMode = 'git-spice' | 'merge-commit' | 'graphite' | 'sapling';

export type VcsStrategy = {
  readonly name: VcsMode;

  // VCS tool availability check
  isAvailable(): Promise<boolean>;

  // Initialize VCS backend
  initialize(workdir: string): Promise<void>;

  // Worktree lifecycle
  createWorktree(taskId: string, baseRef: string, workdir: string): Promise<WorktreeInfo>;
  cleanupWorktree(taskId: string, keepBranch?: boolean): Promise<void>;

  // Commit command for agent prompts
  getCommitCommand(): string;

  // Stack integration (mode-specific behavior)
  integrateStack(
    taskIds: string[],
    targetBranch: string,
    workdir: string,
    options?: IntegrationOptions
  ): Promise<IntegrationResult>;
}

export type WorktreeInfo = {
  taskId: string;
  path: string;
  branch: string;
  baseRef: string;
}

export type IntegrationResult = {
  success: boolean;
  conflicts: string[];
  mergedBranches: string[];
  prUrls?: string[];
}
```

### MCP Tool Design

```typescript
// src/entry/mcp/tools/vcs-tools.ts

// Tool 1: Configure VCS mode
mcp.addTool({
  name: 'configure_vcs',
  parameters: z.object({
    mode: z.enum(['git-spice', 'merge-commit', 'graphite', 'sapling']),
    workdir: z.string().optional(),
  }),
  execute: async (params) => {
    const orchestrator = new VcsOrchestrator();
    await orchestrator.configure(params.mode, params.workdir);
    return { mode: params.mode, available: true };
  },
});

// Tool 2: Create task worktree
mcp.addTool({
  name: 'create_task_worktree',
  parameters: z.object({
    taskId: z.string(),
    baseRef: z.string(),
    workdir: z.string().optional(),
  }),
  execute: async (params) => {
    const orchestrator = new VcsOrchestrator();
    const worktree = await orchestrator.createWorktree(
      params.taskId,
      params.baseRef,
      params.workdir
    );
    return worktree;
  },
});

// Tool 3: Integrate task stack
mcp.addTool({
  name: 'integrate_task_stack',
  parameters: z.object({
    taskIds: z.array(z.string()),
    targetBranch: z.string(),
    submit: z.boolean().optional(),
    workdir: z.string().optional(),
  }),
  execute: async (params) => {
    const orchestrator = new VcsOrchestrator();
    const result = await orchestrator.integrateStack(
      params.taskIds,
      params.targetBranch,
      params.workdir,
      { submit: params.submit }
    );
    return result;
  },
});

// Tool 4: Cleanup task worktree
mcp.addTool({
  name: 'cleanup_task_worktree',
  parameters: z.object({
    taskId: z.string(),
    keepBranch: z.boolean().optional(),
    workdir: z.string().optional(),
  }),
  execute: async (params) => {
    const orchestrator = new VcsOrchestrator();
    await orchestrator.cleanupWorktree(
      params.taskId,
      params.workdir,
      params.keepBranch
    );
    return { taskId: params.taskId, cleaned: true };
  },
});

// Tool 5: List task worktrees
mcp.addTool({
  name: 'list_task_worktrees',
  parameters: z.object({
    workdir: z.string().optional(),
  }),
  execute: async (params) => {
    const orchestrator = new VcsOrchestrator();
    const worktrees = await orchestrator.listWorktrees(params.workdir);
    return { worktrees };
  },
});
```

---

## 12. Testing Strategy

### Test Coverage Targets

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| VCS Strategies | >90% | >80% | N/A |
| MCP Tools | >80% | >90% | >70% |
| VCS Orchestrator | >90% | >80% | N/A |
| WorktreeService (reuse) | Existing | Existing | N/A |
| GitWrapper (reuse) | Existing | Existing | N/A |

### Test Organization

```
src/services/vcs/strategies/
  __tests__/
    merge-commit-strategy.test.ts           # Unit tests
    merge-commit-strategy.integration.test.ts  # Integration tests
    graphite-strategy.test.ts
    graphite-strategy.integration.test.ts

test/e2e/
  vcs-modes/
    git-spice-workflow.test.ts              # E2E tests
    merge-commit-workflow.test.ts
    graphite-workflow.test.ts

src/entry/mcp/tools/
  __tests__/
    vcs-tools.test.ts                       # MCP tool tests
    vcs-tools.integration.test.ts
```

### Test Helpers

Use existing `setupGitTest()` for all VCS tests:
```typescript
describe('MergeCommitStrategy', () => {
  const { getGit, getTmpDir } = setupGitTest('merge-commit-strategy');

  beforeEach(() => {
    git = getGit();
    testDir = getTmpDir();
  });

  // Tests auto-cleanup worktrees, branches, temp directories
});
```

---

## 13. Migration Path

### Phase 1: Foundation (Week 1)
- [ ] Create `VcsStrategy` interface
- [ ] Implement `MergeCommitStrategy` (baseline)
- [ ] Refactor `GitSpiceBackend` → `GitSpiceStrategy`
- [ ] Add `VcsConfigService` (mode detection)
- [ ] Add unit tests (>90% coverage)

### Phase 2: MCP Integration (Week 2)
- [ ] Create `VcsOrchestrator` facade
- [ ] Implement MCP tools (configure_vcs, create_worktree, etc.)
- [ ] Add integration tests (>80% coverage)
- [ ] Update MCP server to use new tools

### Phase 3: Slash Command Integration (Week 3)
- [ ] Update `/execute-phase` to detect MCP
- [ ] Add worktree creation for parallel phases
- [ ] Add stack integration after agents complete
- [ ] Add fallback to no-MCP execution
- [ ] Add E2E tests (>70% coverage)

### Phase 4: Additional VCS Support (Week 4)
- [ ] Implement `GraphiteStrategy`
- [ ] Add `SaplingStrategy` placeholder
- [ ] Document VCS mode configuration
- [ ] Add examples for each VCS mode

---

## 14. Related Features & Constraints

### Related Features

**Existing Worktree Service**:
- Location: `src/services/vcs/worktree-service.ts`
- Usage: Already handles worktree lifecycle
- Integration: Event emission for TUI updates
- Constraint: Tightly coupled to git-spice (needs abstraction)

**Existing Stack Build Service**:
- Location: `src/services/vcs/stack-build-service.ts`
- Usage: Builds git-spice stacks from tasks
- Integration: Uses GitSpiceBackend for native operations
- Constraint: git-spice specific (needs VCS abstraction)

**Event Bus Integration**:
- Location: `src/services/events/execution-event-bus.ts`
- Usage: Cross-cutting event emission
- Integration: TUI, logging, metrics
- Constraint: None (fully reusable)

### Constraints

**1. TypeScript Strictness**:
- All strict flags enabled
- Explicit return types required
- No `any` types allowed
- Must use type guards from `@/validation/guards`

**2. ESM-Only**:
- No CommonJS support
- Extensionless imports
- Build system handles resolution

**3. Testing Requirements**:
- Co-located tests in `__tests__` directories
- Use `setupGitTest()` for Git operations
- Separate unit vs integration tests
- >90% coverage for new code

**4. Code Style**:
- Use ts-pattern for complex conditionals
- Named exports only
- camelCase functions, PascalCase types, kebab-case files
- Import organization: built-ins → external → internal

**5. Event-Driven Architecture**:
- Emit events for all VCS operations
- Use ExecutionEventBus for cross-cutting concerns
- Log via global-logger for user messages

---

## 15. File Structure Proposal

```
src/
  services/
    vcs/
      strategies/
        git-spice-strategy.ts       # Refactored from existing
        merge-commit-strategy.ts    # NEW: Simple merge workflow
        graphite-strategy.ts        # NEW: Graphite stacking
        sapling-strategy.ts         # NEW: Sapling (placeholder)
        vcs-strategy-factory.ts     # Updated with new strategies
      vcs-orchestrator.ts           # NEW: Facade for MCP tools
      vcs-config.ts                 # NEW: VCS mode configuration
      worktree-service.ts           # Existing (reuse)
      stack-build-service.ts        # Existing (adapt for abstraction)
      commit-service.ts             # Existing (reuse)
      repository-service.ts         # Existing (reuse)
      vcs-engine-service.ts         # Existing (reference only)
  adapters/
    vcs/
      git-wrapper.ts                # Existing (reuse)
      git-spice/
        backend.ts                  # Existing (reuse)
        helpers.ts                  # Existing (reuse)
        errors.ts                   # Existing (reuse)
      graphite/
        backend.ts                  # NEW: Graphite CLI operations
      sapling/
        backend.ts                  # NEW: Sapling CLI operations
  core/
    vcs/
      interfaces.ts                 # Updated with new VCS modes
      domain-services.ts            # Existing (reuse)
      vcs-strategy.ts               # NEW: VcsStrategy interface
  entry/
    mcp/
      tools/
        vcs-tools.ts                # NEW: MCP tool definitions
      schemas/
        vcs-config.ts               # NEW: VCS config schemas
      server.ts                     # Updated to use new tools
  types/
    vcs.ts                          # NEW: VCS mode types
```

---

## 16. Key Risks & Mitigations

### Risk 1: Tight Coupling to git-spice
**Impact**: Hard to add new VCS modes
**Mitigation**:
- Extract VCS-agnostic interfaces first
- Test with merge-commit strategy (no external deps)
- Implement graphite as proof of flexibility

### Risk 2: Event Bus Overhead
**Impact**: Performance degradation with parallel execution
**Mitigation**:
- Use existing ExecutionEventBus (already handles 50 listeners)
- Batch events where possible
- Add performance tests

### Risk 3: Test Pollution
**Impact**: Flaky tests due to leftover worktrees/branches
**Mitigation**:
- Use existing `setupGitTest()` infrastructure
- Leverage TestResourceTracker for automatic cleanup
- Add orphaned resource detection in CI

### Risk 4: Breaking Existing CLI Commands
**Impact**: User workflows disrupted
**Mitigation**:
- Keep existing VCS services intact
- Add new MCP tools without removing old code
- Extensive E2E tests before deprecation

### Risk 5: MCP Tool Complexity
**Impact**: Hard to maintain if tools do too much
**Mitigation**:
- Keep MCP tools as thin wrappers
- Delegate to VcsOrchestrator facade
- Single responsibility per tool

---

## 17. Success Metrics

### Functional Success

- [ ] Parallel agents work in isolated worktrees when MCP available
- [ ] Support git-spice stacking (primary workflow)
- [ ] Support merge-commit workflow (simple fallback)
- [ ] Support graphite stacking (alternative)
- [ ] Parallel execution without MCP (same directory with warning)
- [ ] Clean worktree/branch cleanup after integration

### Non-Functional Success

- [ ] Simple MCP API (4-5 tools max)
- [ ] Reuses existing chopstack VCS infrastructure
- [ ] Testable (unit + integration tests for each strategy)
- [ ] Configurable (via config file or CLI flags)
- [ ] Observable (events for TUI/logging)

### Quality Gates

- [ ] All existing tests pass
- [ ] New VCS strategies have >90% test coverage
- [ ] MCP tools validated with chopstack-mcp-inspector
- [ ] Works with example plan.yaml (parallel phase execution)
- [ ] Documentation updated (README, CLAUDE.md)

---

## 18. References

### Existing Code to Study

| File | Purpose | Reusability |
|------|---------|-------------|
| `src/services/vcs/worktree-service.ts` | Worktree lifecycle | 95% |
| `src/adapters/vcs/git-wrapper.ts` | Git operations | 100% |
| `src/adapters/vcs/git-spice/backend.ts` | git-spice native ops | 90% |
| `src/services/vcs/stack-build-service.ts` | Stack building logic | 80% |
| `src/services/events/execution-event-bus.ts` | Event-driven arch | 100% |
| `src/services/vcs/strategies/stacked-vcs-strategy.ts` | Strategy pattern | 70% |
| `test/helpers/git-test-environment.ts` | Test infrastructure | 100% |

### External References

- **git-spice docs**: https://abhinav.github.io/git-spice/
- **graphite CLI**: https://graphite.dev/docs/graphite-cli
- **sapling**: https://sapling-scm.com/docs/introduction/getting-started
- **FastMCP**: https://github.com/jlowin/fastmcp
- **MCP SDK**: https://github.com/modelcontextprotocol/sdk

### Documentation to Update

- [ ] `README.md` - VCS mode configuration
- [ ] `CLAUDE.md` - MCP tool usage
- [ ] `.chopstack/specs/simplify-arch-from-cli/spec.md` - Implementation details
- [ ] `docs/vcs-modes.md` - VCS mode comparison guide (NEW)

---

## 19. Glossary

| Term | Definition |
|------|------------|
| **VCS** | Version Control System (git, mercurial, etc.) |
| **MCP** | Model Context Protocol (Anthropic's protocol for AI tool integration) |
| **Worktree** | Git worktree (isolated working directory for parallel work) |
| **Stack** | Series of dependent branches (e.g., main → task-1 → task-2) |
| **git-spice** | Stacked PR tool by Abhinav Gupta (default VCS mode) |
| **graphite** | Alternative stacked PR tool |
| **sapling** | Meta's VCS (Mercurial fork) |
| **Slash Command** | Commitment framework slash command (e.g., `/execute-phase`) |
| **Strategy Pattern** | Design pattern for swapping algorithms at runtime |
| **Domain Service** | Service that encapsulates business logic |
| **Facade Pattern** | Simplified interface to complex subsystems |

---

## Appendix A: Example VCS Strategy Implementation

```typescript
// src/services/vcs/strategies/merge-commit-strategy.ts

import type { VcsStrategy, WorktreeInfo, IntegrationResult } from '@/core/vcs/vcs-strategy';
import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { WorktreeServiceImpl } from '@/services/vcs/worktree-service';
import { logger } from '@/utils/global-logger';
import { getGlobalEventBus } from '@/services/events/execution-event-bus';

export class MergeCommitStrategy implements VcsStrategy {
  readonly name = 'merge-commit' as const;

  private worktreeService: WorktreeServiceImpl;

  constructor() {
    this.worktreeService = new WorktreeServiceImpl({
      branchPrefix: 'task',
      shadowPath: '.chopstack/shadows',
      cleanupOnSuccess: true,
      cleanupOnFailure: false,
    });
  }

  async isAvailable(): Promise<boolean> {
    // Merge-commit strategy only needs git
    try {
      const git = new GitWrapper(process.cwd());
      await git.git.version();
      return true;
    } catch {
      return false;
    }
  }

  async initialize(workdir: string): Promise<void> {
    logger.info(`Initializing merge-commit strategy in ${workdir}`);
    // No special initialization needed for merge-commit
  }

  async createWorktree(
    taskId: string,
    baseRef: string,
    workdir: string
  ): Promise<WorktreeInfo> {
    const branchName = `task/${taskId}`;
    const worktreePath = `.chopstack/shadows/${taskId}`;

    const context = await this.worktreeService.createWorktree({
      taskId,
      branchName,
      worktreePath,
      baseRef,
      workdir,
    });

    const eventBus = getGlobalEventBus();
    eventBus.emitBranchCreated(branchName, baseRef);

    return {
      taskId,
      path: context.absolutePath,
      branch: branchName,
      baseRef,
    };
  }

  getCommitCommand(): string {
    return 'git commit -m "your commit message"';
  }

  async integrateStack(
    taskIds: string[],
    targetBranch: string,
    workdir: string,
    options?: { submit?: boolean }
  ): Promise<IntegrationResult> {
    logger.info(`Integrating ${taskIds.length} tasks into ${targetBranch}`);

    const git = new GitWrapper(workdir);
    const conflicts: string[] = [];
    const mergedBranches: string[] = [];

    // Checkout target branch
    await git.checkout(targetBranch);

    // Merge each task branch with --no-ff
    for (const taskId of taskIds) {
      const branchName = `task/${taskId}`;

      try {
        await git.mergeFromTo(branchName, targetBranch, { '--no-ff': true });
        mergedBranches.push(branchName);

        const eventBus = getGlobalEventBus();
        eventBus.emitLog('info', `Merged ${branchName} into ${targetBranch}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Merge conflict for ${branchName}: ${errorMessage}`);
        conflicts.push(branchName);
      }
    }

    return {
      success: conflicts.length === 0,
      conflicts,
      mergedBranches,
    };
  }

  async cleanupWorktree(
    taskId: string,
    keepBranch?: boolean
  ): Promise<void> {
    await this.worktreeService.removeWorktree(taskId);

    if (!keepBranch) {
      // Also delete the branch after merge
      logger.info(`Deleting merged branch task/${taskId}`);
      // Implementation: git branch -d task/${taskId}
    }
  }
}
```

---

## Appendix B: Example MCP Tool Test

```typescript
// src/entry/mcp/tools/__tests__/vcs-tools.integration.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { setupGitTest } from '@test/helpers/git-test-environment';
import { mcp } from '@/entry/mcp/server';

describe('VCS MCP Tools Integration', () => {
  const { getGit, getTmpDir } = setupGitTest('vcs-mcp-tools');

  beforeEach(async () => {
    const git = getGit();
    const testDir = getTmpDir();

    // Initialize git repo
    await git.init();
    await git.config('user.name', 'Test User');
    await git.config('user.email', 'test@example.com');

    // Create initial commit
    await git.git.raw(['commit', '--allow-empty', '-m', 'Initial commit']);
  });

  it('should configure VCS mode', async () => {
    const result = await mcp.callTool('configure_vcs', {
      mode: 'merge-commit',
      workdir: getTmpDir(),
    });

    expect(result).toMatchObject({
      mode: 'merge-commit',
      available: true,
    });
  });

  it('should create task worktree', async () => {
    const result = await mcp.callTool('create_task_worktree', {
      taskId: 'task-1',
      baseRef: 'HEAD',
      workdir: getTmpDir(),
    });

    expect(result).toMatchObject({
      taskId: 'task-1',
      path: expect.stringContaining('task-1'),
      branch: 'task/task-1',
      baseRef: 'HEAD',
    });
  });

  it('should integrate task stack with merge-commit', async () => {
    // Setup: Create worktree and make a commit
    await mcp.callTool('create_task_worktree', {
      taskId: 'task-1',
      baseRef: 'HEAD',
      workdir: getTmpDir(),
    });

    // Simulate agent committing in worktree
    // (In real scenario, agent would do this)
    const git = getGit();
    const worktreePath = `${getTmpDir()}/.chopstack/shadows/task-1`;
    await git.git.raw(['commit', '--allow-empty', '-m', 'Task 1 work'], { cwd: worktreePath });

    // Integrate stack
    const result = await mcp.callTool('integrate_task_stack', {
      taskIds: ['task-1'],
      targetBranch: 'main',
      workdir: getTmpDir(),
    });

    expect(result).toMatchObject({
      success: true,
      conflicts: [],
      mergedBranches: ['task/task-1'],
    });
  });

  it('should cleanup task worktree', async () => {
    // Setup: Create worktree
    await mcp.callTool('create_task_worktree', {
      taskId: 'task-1',
      baseRef: 'HEAD',
      workdir: getTmpDir(),
    });

    // Cleanup
    const result = await mcp.callTool('cleanup_task_worktree', {
      taskId: 'task-1',
      keepBranch: false,
      workdir: getTmpDir(),
    });

    expect(result).toMatchObject({
      taskId: 'task-1',
      cleaned: true,
    });

    // Verify worktree removed
    const git = getGit();
    const worktrees = await git.listWorktrees();
    const taskWorktree = worktrees.find(w => w.path.includes('task-1'));
    expect(taskWorktree).toBeUndefined();
  });
});
```

---

**END OF CODEBASE ANALYSIS**
