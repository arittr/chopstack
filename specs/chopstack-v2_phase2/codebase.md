# Codebase Analysis: Chopstack v2.0.0

**Date**: 2025-10-14
**Scope**: Phase 2 Implementation - Specification-Driven Workflow System
**Related**: `specs/chopstack-v2_phase2/initial.md`

## Executive Summary

Chopstack is a TypeScript CLI tool and MCP server that decomposes complex software changes into parallelizable, conflict-free task DAGs. The codebase demonstrates exemplary modern TypeScript practices with:

- **Strict Type Safety**: Zero `any` types, exhaustive pattern matching, comprehensive Zod validation
- **Modular Architecture**: Clear separation of concerns with dependency injection
- **Dual Runtime Modes**: CLI tool (`chopstack`) and MCP server (Model Context Protocol)
- **Advanced Testing**: 4-tier testing strategy (unit, integration, e2e, execution planning)
- **Production-Grade Quality**: 160+ TypeScript files, 95%+ test coverage goal, ESLint with 450+ rules

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Core Type System](#core-type-system)
5. [Execution Infrastructure](#execution-infrastructure)
6. [Agent System](#agent-system)
7. [VCS Integration](#vcs-integration)
8. [CLI Commands](#cli-commands)
9. [Testing Strategy](#testing-strategy)
10. [Code Quality Standards](#code-quality-standards)
11. [Logging Architecture](#logging-architecture)
12. [Build System](#build-system)
13. [Integration Points for v2](#integration-points-for-v2)
14. [Code Patterns & Examples](#code-patterns--examples)

---

## Project Structure

### High-Level Layout

```
chopstack-mcp/
├── src/                        # Source code (160+ TypeScript files)
│   ├── adapters/              # External integrations (agents, VCS)
│   ├── commands/              # CLI command implementations
│   ├── core/                  # Core domain logic (DI, execution, agents)
│   ├── entry/                 # Entry points (CLI, MCP)
│   ├── io/                    # I/O utilities (YAML parser)
│   ├── logging/               # Dual logging system
│   ├── providers/             # Dependency injection providers
│   ├── services/              # Business logic services
│   ├── types/                 # Type definitions and Zod schemas
│   ├── ui/                    # React-based TUI components (Ink)
│   ├── utils/                 # Shared utilities
│   └── validation/            # DAG validation and guards
├── test/                      # Test infrastructure
│   ├── e2e/                   # End-to-end tests
│   ├── execution/             # Execution planning tests
│   ├── helpers/               # Test utilities
│   └── setup/                 # Test setup files
├── specs/                     # Project specifications
├── .chopstack/                # Runtime artifacts (worktrees, logs)
└── dist/                      # Build output (ESM only)
```

### Directory Breakdown

#### `src/adapters/` - External System Integration
```
adapters/
├── agents/                    # AI agent implementations
│   ├── claude.ts              # Claude Code CLI adapter (primary)
│   ├── mock.ts                # Mock agent for testing
│   └── aider.ts               # (Future) Aider CLI adapter
└── vcs/                       # Version control strategies
    ├── git-spice/             # Git-spice stacked PR workflow
    ├── graphite/              # (Future) Graphite workflow
    └── simple/                # Simple branch-per-task workflow
```

**Integration Note**: For v2 spec analysis, new adapters for specification generation and gap analysis would go here.

#### `src/core/` - Domain Logic
```
core/
├── agents/
│   └── interfaces.ts          # Agent capability definitions
├── config/
│   ├── interfaces.ts          # Configuration types
│   └── runtime-config.ts      # Runtime configuration
├── di/                        # Dependency injection container
│   ├── container.ts           # DI container implementation
│   └── providers.ts           # Service providers
├── execution/
│   ├── task-state-machine.ts # Task lifecycle FSM
│   ├── task-transitions.ts   # Valid state transitions
│   ├── types.ts               # Execution types
│   └── interfaces.ts          # Core execution contracts
└── vcs/
    ├── interfaces.ts          # VCS abstraction
    ├── types.ts               # VCS types
    └── domain-services.ts     # VCS domain logic
```

**Key Pattern**: All core domain logic is interface-driven with dependency injection.

#### `src/services/` - Business Logic
```
services/
├── agents/
│   └── agent-service.ts       # Agent lifecycle management
├── events/
│   ├── execution-event-bus.ts    # Event-driven architecture
│   └── execution-event-consumer.ts # Event filtering/logging
├── execution/
│   ├── engine/                # Execution orchestration
│   │   ├── execution-engine.ts
│   │   └── state-manager.ts
│   ├── modes/                 # Plan/dry-run/execute/validate modes
│   ├── strategies/            # Sequential/parallel strategies
│   └── execution-orchestrator.ts # Main orchestrator
├── logging/
│   └── file-logger.ts         # File-based logging
├── orchestration/
│   ├── adapters/              # Task execution adapters
│   │   └── claude-cli-task-execution-adapter.ts
│   └── orchestrator.ts        # Task orchestration
├── planning/
│   ├── plan-generator.ts      # Plan generation with retry
│   └── prompts.ts             # Prompt building utilities
└── vcs/
    ├── vcs-engine.ts          # VCS orchestration
    ├── strategies/            # VCS strategy implementations
    └── validation/            # File conflict detection
```

**Critical for v2**: `services/planning/` will need new services for spec expansion and gap analysis.

#### `src/types/` - Type System
```
types/
├── schemas-v2.ts              # Core v2 schemas (PlanV2, TaskV2, Phase)
├── agent.ts                   # Agent interface definitions
├── cli.ts                     # CLI argument validation
├── events.ts                  # Event type definitions
├── mcp.ts                     # MCP tool schemas
└── validation.ts              # Validation result types
```

**Architecture Decision**: Uses Zod for runtime validation + TypeScript for compile-time safety.

#### `src/commands/` - CLI Commands
```
commands/
├── decompose/                 # `chopstack decompose` command
│   └── decompose-command.ts
├── run/                       # `chopstack run` command
│   └── run-command.ts
├── stack/                     # `chopstack stack` command
│   └── stack-command.ts
├── command-factory.ts         # Command factory pattern
└── cli-dispatcher.ts          # Command routing
```

**Pattern**: Each command is a class implementing a standard `execute(options): Promise<number>` interface.

#### `src/ui/` - Terminal User Interface
```
ui/
├── components/                # React components (Ink)
│   ├── ExecutionProgress.tsx  # Task execution display
│   ├── TaskTree.tsx           # Task hierarchy view
│   └── StatusBadge.tsx        # Status indicators
├── hooks/                     # React hooks
│   ├── useExecutionState.ts   # Execution state management
│   └── useScrollToBottom.ts   # Auto-scroll behavior
└── theme.ts                   # Color theme configuration
```

**Tech**: Uses Ink (React for CLIs) for interactive terminal UI.

---

## Technology Stack

### Runtime & Language
- **Node.js**: >=18.0.0 (ESM modules only)
- **TypeScript**: 5.9.2 with very strict configuration
- **Package Manager**: pnpm 10.8.0 (strictly enforced)

### Core Dependencies
```json
{
  "@dagrejs/graphlib": "2.2.4",     // DAG analysis and topological sort
  "chalk": "5.6.2",                  // Terminal colors
  "commander": "14.0.1",             // CLI argument parsing
  "execa": "9.6.0",                  // Process execution
  "fastmcp": "3.16.0",               // MCP server framework
  "ink": "6.3.1",                    // React for CLIs
  "react": "19.1.1",                 // UI framework
  "simple-git": "3.28.0",            // Git operations
  "ts-pattern": "5.8.0",             // Pattern matching
  "yaml": "2.8.1",                   // YAML parsing
  "zod": "4.1.4"                     // Runtime validation
}
```

### Development Tools
```json
{
  "@anthropic-ai/claude-code": "1.0.111", // Claude SDK types
  "@typescript-eslint/eslint-plugin": "8.15.0",
  "eslint": "9.15.0",                // 450+ rules configured
  "prettier": "3.6.2",               // Code formatting
  "tsup": "8.5.0",                   // ESM bundler
  "tsx": "4.20.5",                   // TypeScript execution
  "vitest": "3.2.4"                  // Test framework
}
```

### TypeScript Configuration
```json
{
  "target": "ES2022",
  "module": "ES2022",
  "moduleResolution": "Bundler",
  "strict": true,                    // All strict flags
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true,  // Array access safety
  "exactOptionalPropertyTypes": true, // Strict optional handling
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true,
  "isolatedModules": true,
  "verbatimModuleSyntax": true       // Explicit type imports
}
```

**Key Insight**: Among the strictest TypeScript configs in production codebases.

---

## Architecture Overview

### Architectural Style

**Layered Architecture** with **Dependency Injection**:

```
┌─────────────────────────────────────────────────────────┐
│  Entry Layer (CLI, MCP)                                 │
│  - src/entry/cli/chopstack.ts                           │
│  - src/entry/mcp/server.ts                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Command Layer                                          │
│  - DecomposeCommand, RunCommand, StackCommand           │
│  - Argument validation via Zod                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Service Layer                                          │
│  - ExecutionEngine, PlanGenerator, VcsEngine            │
│  - AgentService, ExecutionOrchestrator                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Adapter Layer                                          │
│  - ClaudeCliTaskExecutionAdapter                        │
│  - GitSpiceVcsStrategy, WorktreeVcsStrategy             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  External Systems                                       │
│  - Claude CLI, Git, File System                         │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

#### 1. Dependency Injection
**Location**: `src/core/di/container.ts`

```typescript
export type ServiceContainer = {
  agentService: AgentService;
  executionEngine: ExecutionEngine;
  planGenerator: PlanGenerator;
  vcsEngine: VcsEngine;
  // ... more services
};

export function createContainer(config: RuntimeConfig): ServiceContainer {
  // Build dependency graph
  const agentService = new AgentService(config.agentType);
  const planGenerator = new PlanGenerator(agentService);
  const vcsEngine = new VcsEngine(config.vcsMode);
  // ...

  return { agentService, planGenerator, vcsEngine };
}
```

**Usage in Commands**:
```typescript
export class DecomposeCommand {
  constructor(private readonly deps: CommandDependencies) {}

  async execute(options: DecomposeOptions): Promise<number> {
    const plan = await this.deps.planGenerator.generate(spec, options);
    // ...
  }
}
```

#### 2. Strategy Pattern (VCS Modes)
**Location**: `src/services/vcs/strategies/`

```typescript
type VcsStrategy = {
  createBranch(taskId: string): Promise<string>;
  commitChanges(message: string): Promise<void>;
  mergeBranch(branchName: string): Promise<void>;
};

// Implementations:
class SimpleVcsStrategy implements VcsStrategy { /* ... */ }
class WorktreeVcsStrategy implements VcsStrategy { /* ... */ }
class StackedVcsStrategy implements VcsStrategy { /* ... */ }
```

**Factory**:
```typescript
function createVcsStrategy(mode: VcsMode): VcsStrategy {
  return match(mode)
    .with('simple', () => new SimpleVcsStrategy())
    .with('worktree', () => new WorktreeVcsStrategy())
    .with('stacked', () => new StackedVcsStrategy())
    .exhaustive();
}
```

#### 3. Adapter Pattern (Task Execution)
**Location**: `src/services/orchestration/adapters/`

```typescript
type TaskExecutionAdapter = {
  executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void
  ): Promise<OrchestratorTaskResult>;

  stopTask(taskId: string): boolean;
};

// Primary implementation:
class ClaudeCliTaskExecutionAdapter implements TaskExecutionAdapter {
  async executeTask(request, emitUpdate) {
    const process = spawn('claude', args, { cwd: request.workdir });
    // Stream parsing, event emission, result handling
  }
}
```

#### 4. State Machine Pattern (Task Lifecycle)
**Location**: `src/core/execution/task-state-machine.ts`

```typescript
type TaskState =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

type TaskTransition = {
  from: TaskState;
  to: TaskState;
  condition?: (context: ExecutionContext) => boolean;
};

const VALID_TRANSITIONS: TaskTransition[] = [
  { from: 'pending', to: 'ready' },
  { from: 'ready', to: 'running' },
  { from: 'running', to: 'completed' },
  { from: 'running', to: 'failed' },
  // ...
];
```

#### 5. Event-Driven Architecture
**Location**: `src/services/events/`

```typescript
class ExecutionEventBus {
  private readonly emitter = new EventEmitter();

  emitTaskStart(taskId: string, metadata: TaskMetadata): void {
    this.emitter.emit('task:start', { taskId, ...metadata });
  }

  emitStreamData(taskId: string, event: ClaudeStreamEvent): void {
    this.emitter.emit('stream:data', { taskId, event });
  }

  onTaskStart(handler: (event) => void): void {
    this.emitter.on('task:start', handler);
  }
}
```

**Consumers**:
- TUI components (real-time display)
- File logger (execution logs)
- Metrics collector (performance tracking)

---

## Core Type System

### V2 Schema Architecture

**Location**: `src/types/schemas-v2.ts` (647 lines)

The v2 type system is the foundation for chopstack's specification-driven workflow. Every type includes:
- Zod schema for runtime validation
- TypeScript type inference via `z.infer<>`
- Comprehensive JSDoc with examples
- Cross-validation refinements

#### Core Types Hierarchy

```typescript
// T-shirt size complexity (replaces hour estimates)
type Complexity = 'XS' | 'S' | 'M' | 'L' | 'XL';

// Task definition (v2)
type TaskV2 = {
  id: string;                      // kebab-case
  name: string;                    // Human-readable
  complexity: Complexity;          // T-shirt size
  description: string;             // Min 50 chars (why + what)
  files: string[];                 // Files to modify/create
  acceptanceCriteria: string[];    // Testable criteria
  dependencies: string[];          // Task IDs
  phase?: string;                  // Optional phase membership
};

// Phase definition (NEW in v2)
type Phase = {
  id: string;                      // kebab-case
  name: string;                    // Human-readable
  strategy: 'sequential' | 'parallel';
  tasks: string[];                 // Task IDs in this phase
  requires: string[];              // Phase dependencies
};

// Plan definition (v2)
type PlanV2 = {
  name: string;
  description?: string;
  specification?: string;          // Path to spec.md
  codebase?: string;               // Path to codebase.md
  mode?: 'plan' | 'execute' | 'validate';
  strategy: 'sequential' | 'parallel' | 'phased-parallel';
  phases?: Phase[];                // Optional phase organization
  tasks: TaskV2[];                 // All tasks
  successMetrics?: SuccessMetrics;
};

// Success metrics (NEW in v2)
type SuccessMetrics = {
  quantitative: string[];          // Measurable (coverage, perf)
  qualitative: string[];           // Subjective (UX, clarity)
};
```

#### Schema Validation Features

**Cross-Validation** (ensures data integrity):
```typescript
const planSchemaV2 = z.object({
  // ... fields
}).refine(
  (plan) => {
    // Validate phase → task references
    if (plan.phases) {
      const phaseTaskIds = new Set(plan.phases.flatMap(p => p.tasks));
      const taskIds = new Set(plan.tasks.map(t => t.id));

      for (const phaseTaskId of phaseTaskIds) {
        if (!taskIds.has(phaseTaskId)) {
          return false; // Phase references non-existent task
        }
      }
    }
    return true;
  },
  { message: 'Phase tasks must reference existing task IDs' }
)
.refine(
  (plan) => {
    // Validate task ID uniqueness
    const taskIds = plan.tasks.map(t => t.id);
    const uniqueIds = new Set(taskIds);
    return taskIds.length === uniqueIds.size;
  },
  { message: 'Task IDs must be unique' }
);
```

**Pattern Validation** (naming conventions):
```typescript
const taskV2Schema = z.object({
  id: z.string()
    .regex(/^[a-z0-9-]+$/, 'Task ID must be kebab-case'),
  name: z.string()
    .min(1, 'Task name is required'),
  description: z.string()
    .min(50, 'Description should be at least 50 characters for clarity'),
  // ...
});
```

### Analysis Types (NEW for v2)

**Location**: `src/types/schemas-v2.ts` (lines 364-647)

v2 introduces comprehensive types for specification analysis:

```typescript
// Severity levels for gap prioritization
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// Gap finding
type Gap = {
  id: string;                      // Stable ID (hash)
  severity: Severity;
  category: 'gap' | 'duplication' | 'ambiguity' | 'inconsistency';
  message: string;                 // Human-readable
  artifacts: string[];             // Affected files/sections
  remediation?: string;            // How to fix
};

// Remediation step
type RemediationStep = {
  priority: Severity;
  order: number;                   // Execution order (1, 2, 3...)
  action: string;                  // What to do
  reasoning: string;               // Why it's needed
  artifacts: string[];             // Files to modify
};

// Analysis report
type AnalysisReport = {
  completeness: number;            // 0-100 score
  gaps: Gap[];                     // Categorized gaps
  remediation: RemediationStep[];  // Prioritized steps
  summary: string;                 // Human-readable
};

// Codebase analysis (flexible, agent-driven)
type CodebaseAnalysis = {
  summary: string;                 // Markdown summary
  findings: any;                   // Extensible structure
  observations: string[];          // Qualitative insights
  examples: any;                   // Code examples
  relatedFeatures: RelatedFeature[];
};

// Project principles (extracted from docs)
type ProjectPrinciples = {
  source: string;                  // CLAUDE.md, .cursorrules, etc.
  principles: {
    category: string;              // Code Style, Architecture, etc.
    rule: string;                  // Actual principle
    examples?: string[];           // Code examples
  }[];
};
```

**Critical for v2**: These types enable the `chopstack analyze` command to:
1. Parse specs for gaps
2. Categorize issues by severity
3. Generate actionable remediation plans
4. Validate against project principles

---

## Execution Infrastructure

### Execution Flow

The execution system follows a **multi-layer orchestration** pattern:

```
ExecutionEngine (top-level coordinator)
    │
    ├─→ ExecutionPlannerService (creates execution plan)
    │       - Parses plan file
    │       - Validates DAG structure
    │       - Determines execution strategy
    │
    ├─→ ExecutionOrchestrator (executes plan)
    │       │
    │       ├─→ ModeHandler (plan|dry-run|execute|validate)
    │       │       - PlanModeHandler: Permission mode = plan
    │       │       - DryRunModeHandler: Permission mode = plan
    │       │       - ExecuteModeHandler: Permission mode = bypassPermissions
    │       │       - ValidateModeHandler: Checks acceptance criteria
    │       │
    │       └─→ StrategyHandler (sequential|parallel|phased-parallel)
    │               - SequentialStrategy: Tasks run one-by-one
    │               - ParallelStrategy: Tasks run concurrently (DAG-aware)
    │               - PhasedParallelStrategy: Phases sequential, tasks within parallel
    │
    └─→ ExecutionMonitorService (tracks progress)
            - Event collection
            - Metrics aggregation
            - Progress reporting
```

### Key Components

#### 1. Execution Engine
**File**: `src/services/execution/engine/execution-engine.ts`

```typescript
export class ExecutionEngine extends EventEmitter {
  constructor(dependencies: ExecutionEngineDependencies) {
    this.plannerService = dependencies.plannerService;
    this.monitorService = dependencies.monitorService;
    this.executionOrchestrator = dependencies.orchestrator;
    this.stateManager = dependencies.stateManager;
  }

  async execute(plan: PlanV2, options: ExecutionOptions): Promise<ExecutionResult> {
    // 1. Create execution plan
    const executionPlan = await this.plannerService.createExecutionPlan(plan, options);

    // 2. Start monitoring
    this.monitorService.startMonitoring(executionPlan);

    // 3. Execute
    const result = await this.executionOrchestrator.execute(plan, options);

    // 4. Stop monitoring
    this.monitorService.stopMonitoring(executionPlan.id);

    return result;
  }
}
```

**Integration Point for v2**: The execution engine would need minimal changes. The new `chopstack run --validate` mode would be handled by adding a new `ValidateModeHandler`.

#### 2. Task Execution Adapter
**File**: `src/services/orchestration/adapters/claude-cli-task-execution-adapter.ts` (662 lines)

This is the **most critical adapter** - it handles all Claude CLI interactions:

```typescript
export class ClaudeCliTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly eventBus: ExecutionEventBus;

  async executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void
  ): Promise<OrchestratorTaskResult> {
    const { taskId, workdir, mode, prompt, files } = request;

    // Build Claude CLI args based on mode
    const args = match(mode)
      .with('plan', () => ['-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'plan', prompt])
      .with('execute', () => ['-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'bypassPermissions', prompt])
      .exhaustive();

    // Spawn Claude process
    const claudeProcess = spawn('claude', args, {
      cwd: workdir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse stream-json events
    claudeProcess.stdout.on('data', (data) => {
      const events = this._parseStreamJson(data);
      for (const event of events) {
        this._handleStreamEvent(taskId, event);
        this.eventBus.emitStreamData(taskId, event);
        emitUpdate({ taskId, type: 'stdout', data: JSON.stringify(event) });
      }
    });

    // Return result
    return new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve(this._createResultFromClose(request, code));
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }
}
```

**Stream Event Handling**:
```typescript
type ClaudeStreamEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; tool: string; input: Record<string, unknown> }
  | { type: 'content'; content: string }
  | { type: 'error'; error: string };

private _handleStreamEvent(taskId: string, event: ClaudeStreamEvent): void {
  const stats = this.taskStats.get(taskId);

  switch (event.type) {
    case 'thinking':
      stats.thinkingCount++;
      break;
    case 'tool_use':
      stats.toolUseCount++;
      stats.toolsUsed.add(event.tool);
      break;
    case 'content':
      this._appendOutput(taskId, event.content);
      break;
    case 'error':
      this.eventBus.emitLog(LogLevel.ERROR, `[${taskId}] ❌ ${event.error}`);
      break;
  }
}
```

**Critical Feature**: Worktree-aware execution
```typescript
private _createPrompt(request: TaskExecutionRequest, workdir: string): string {
  const workdirInstruction = workdir !== process.cwd()
    ? `\n\nIMPORTANT: You are working in an isolated directory: ${workdir}\nAll file paths should be relative to this directory. Do NOT write files outside this directory.`
    : '';

  const forbiddenFilesWarning = request.forbiddenFiles?.length > 0
    ? `\n\nIMPORTANT: You MUST ONLY modify the files listed above.\n\nDO NOT modify any of these files (they belong to other tasks):\n${request.forbiddenFiles.slice(0, 10).map(f => `  - ${f}`).join('\n')}`
    : '';

  return `Task: ${request.title}\n\n${request.prompt}${workdirInstruction}${forbiddenFilesWarning}`;
}
```

#### 3. DAG Validator
**File**: `src/validation/dag-validator.ts` (473 lines)

Uses **graphlib** for robust DAG analysis:

```typescript
export class DagValidator {
  static validatePlan(plan: PlanV2): ValidationResult {
    const graph = this._buildDependencyGraph(plan.tasks);

    // Check for circular dependencies
    const cycles = this._detectCycles(graph);

    // Check for file conflicts (parallel tasks modifying same file)
    const fileConflicts = this._detectFileConflicts(plan.tasks);

    // Check for missing dependencies
    const missingDeps = this._detectMissingDependencies(plan.tasks);

    // Check for orphaned tasks
    const orphaned = this._detectOrphanedTasks(graph, plan.tasks);

    return {
      valid: errors.length === 0 && cycles.length === 0 && fileConflicts.length === 0,
      errors,
      conflicts: fileConflicts,
      circularDependencies: cycles,
      orphanedTasks: orphaned,
      missingDependencies: missingDeps
    };
  }

  static calculateMetrics(plan: PlanV2): PlanMetrics {
    const graph = this._buildDependencyGraph(plan.tasks);
    const topologicalOrder = alg.topsort(graph); // graphlib algorithm
    const layers = this._calculateExecutionLayers(graph, topologicalOrder);

    const maxParallelization = Math.max(...layers.map(layer => layer.length));
    const criticalPathLength = this._calculateCriticalPathLength(graph, plan.tasks);
    const totalSequentialTime = this._calculateTotalComplexity(plan.tasks);
    const estimatedSpeedup = totalSequentialTime / Math.max(criticalPathLength, 1);

    return {
      taskCount: plan.tasks.length,
      maxParallelization,
      estimatedSpeedup,
      totalComplexityScore: totalSequentialTime,
      executionLayers: layers.length,
      criticalPathLength
    };
  }
}
```

**File Conflict Detection** (critical algorithm):
```typescript
private static _detectFileConflicts(tasks: TaskV2[]): string[] {
  const fileToTasks = new Map<string, string[]>();
  const graph = this._buildDependencyGraph(tasks);

  // Group tasks by files
  for (const task of tasks) {
    for (const file of task.files) {
      if (!fileToTasks.has(file)) {
        fileToTasks.set(file, []);
      }
      fileToTasks.get(file).push(task.id);
    }
  }

  // Find files modified by multiple tasks that could run in parallel
  const conflicts: string[] = [];
  for (const [file, taskIds] of fileToTasks) {
    if (taskIds.length > 1) {
      for (let i = 0; i < taskIds.length; i++) {
        for (let j = i + 1; j < taskIds.length; j++) {
          const taskA = taskIds[i];
          const taskB = taskIds[j];

          // Check if there's a dependency path between tasks
          const hasPathAtoB = this._hasPath(graph, taskA, taskB);
          const hasPathBtoA = this._hasPath(graph, taskB, taskA);

          // If neither depends on the other, they could run in parallel - conflict!
          if (!hasPathAtoB && !hasPathBtoA) {
            conflicts.push(`${file} (parallel conflicts: ${taskA}, ${taskB})`);
          }
        }
      }
    }
  }

  return conflicts;
}
```

**Integration for v2**: The validator would gain new methods:
- `validatePhaseDAG(phases: Phase[]): ValidationResult` - Phase-level dependency validation
- `detectPhaseConflicts(phases: Phase[], tasks: TaskV2[]): string[]` - Cross-phase file conflicts

---

## Agent System

### Agent Interface
**File**: `src/types/agent.ts` (408 lines)

The agent interface defines a **universal contract** for AI decomposition agents:

```typescript
export type Agent = {
  /**
   * Decompose a specification into a structured task plan
   */
  decompose(prompt: string, cwd: string, options: DecomposeOptions): Promise<PlanV2>;

  /**
   * Execute a single task by modifying/creating specified files
   */
  execute(prompt: string, files: string[], cwd: string): Promise<TaskResult>;

  /**
   * Validate implementation against acceptance criteria
   */
  validate(prompt: string, criteria: string[], cwd: string): Promise<ValidationResult>;
};
```

**Key Design**: The agent interface is implementation-agnostic. It doesn't care if you're using Claude, GPT-4, Aider, or a mock - as long as you can decompose, execute, and validate.

### Agent Implementations

#### 1. ClaudeCodeDecomposer
**File**: `src/adapters/agents/claude.ts` (349 lines)

The **primary production agent**:

```typescript
export class ClaudeCodeDecomposer implements DecomposerAgent {
  async decompose(
    specContent: string,
    cwd: string,
    options?: { verbose?: boolean }
  ): Promise<PlanV2> {
    // 1. Build decomposition prompt
    const prompt = PromptBuilder.buildDecompositionPrompt(specContent);

    // 2. Execute Claude with stdin input
    const stdout = await this._executeClaudeCommand(prompt, cwd, options?.verbose ?? false);

    // 3. Parse response (JSON wrapper or direct content)
    const parsedContent = this._parseClaudeResponse(stdout);

    // 4. Validate and return plan
    const plan = this._validateAndReturnPlan(parsedContent);

    return plan;
  }

  private async _executeClaudeCommand(prompt: string, cwd: string, verbose: boolean): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('claude', [
        '--permission-mode', 'plan',
        '--verbose',
        '--output-format', 'stream-json'
      ], { cwd, env: process.env });

      const handler = new ClaudeStreamHandler(resolve, reject, verbose);
      handler.attachToProcess(child);
      handler.sendPrompt(child, prompt);
    });
  }
}
```

**Response Parsing** (handles multiple formats):
```typescript
private _parseClaudeResponse(stdout: string): ParsedContent {
  // Try JSON wrapper format first (stream-json)
  const jsonResult = this._tryParseJsonWrapper(stdout);
  if (jsonResult !== null) {
    return jsonResult;
  }

  // Fallback to direct YAML/JSON extraction
  return this._tryParseDirectContent(stdout);
}

private _tryParseJsonWrapper(stdout: string): ParsedContent | null {
  const lines = stdout.trim().split('\n');

  for (const line of lines) {
    try {
      const json = JSON.parse(line) as ClaudeResponse;
      if (json.type === 'result' && isNonEmptyString(json.result)) {
        return this._extractContentFromResult(json.result);
      }
    } catch {
      continue;
    }
  }

  return null;
}

private _extractContentFromResult(result: string): ParsedContent {
  // Try YAML code block
  const yamlMatch = result.match(/```yaml\n([\s\S]+?)\n```/);
  if (yamlMatch?.[1]) {
    return { content: yamlMatch[1], source: 'yaml' };
  }

  // Try JSON code block
  const jsonMatch = result.match(/```json\n([\s\S]+?)\n```/);
  if (jsonMatch?.[1]) {
    return { content: jsonMatch[1], source: 'json' };
  }

  // Try direct YAML parsing
  return { content: result, source: 'yaml' };
}
```

#### 2. MockAgent
**File**: `src/adapters/agents/mock.ts` (152 lines)

Used for **testing and development**:

```typescript
export class MockAgent implements Agent {
  async decompose(_prompt: string, _cwd: string, _options: DecomposeOptions): Promise<PlanV2> {
    return {
      name: 'Mock User Management Feature',
      description: 'Implement basic user management',
      strategy: 'phased-parallel',
      phases: [
        {
          id: 'phase-setup',
          name: 'Setup Phase',
          strategy: 'sequential',
          tasks: ['create-user-types'],
          requires: []
        },
        {
          id: 'phase-implementation',
          name: 'Implementation Phase',
          strategy: 'sequential',
          tasks: ['create-user-crud', 'add-validation'],
          requires: ['phase-setup']
        }
      ],
      tasks: [
        {
          id: 'create-user-types',
          name: 'Create User Types',
          complexity: 'S',
          description: 'Define User interface...',
          files: ['src/types/user.ts'],
          acceptanceCriteria: ['User interface exported'],
          dependencies: []
        }
        // ... more tasks
      ]
    };
  }
}
```

### Plan Generation with Retry
**File**: `src/services/planning/plan-generator.ts` (165 lines)

**Critical feature**: Automatic retry on validation failures

```typescript
export async function generatePlanWithRetry(
  agent: DecomposerAgent,
  specContent: string,
  cwd: string,
  options: PlanGenerationOptions = {}
): Promise<PlanGenerationResult> {
  const { maxRetries = 3, verbose = false } = options;
  let attempt = 1;
  const conflictHistory: string[] = [];

  while (attempt <= maxRetries) {
    // Build enhanced prompt for retries
    const enhancedContent = buildEnhancedPrompt(specContent, conflictHistory, attempt);

    // Decompose
    const plan = await agent.decompose(enhancedContent, cwd, { verbose });

    // Validate
    const validation = DagValidator.validatePlan(plan);

    if (validation.valid) {
      return { plan, attempts: attempt, conflicts: conflictHistory, success: true };
    }

    // Record conflicts for next retry
    if (validation.conflicts?.length > 0) {
      conflictHistory.push(...validation.conflicts);
      logger.warn(`⚠️ Attempt ${attempt} had file conflicts: ${validation.conflicts.join(', ')}`);
    }

    attempt++;
  }

  // All retries exhausted
  return { plan, attempts: maxRetries, conflicts: conflictHistory, success: false };
}
```

**Enhanced Prompt** (guides agent to avoid previous conflicts):
```typescript
function buildEnhancedPrompt(
  originalContent: string,
  conflictHistory: string[],
  attempt: number
): string {
  if (attempt === 1 || conflictHistory.length === 0) {
    return originalContent;
  }

  const conflictGuidance = conflictHistory.map(conflict => {
    const match = conflict.match(/^(.+?)\s+\(parallel conflicts:\s+(.+)\)$/);
    if (match) {
      const [, file, tasks] = match;
      return `- File "${file}" was edited by tasks: ${tasks}\n  → Solution: Make these tasks sequential by adding dependencies, or combine them into one task`;
    }
    return conflict;
  }).join('\n');

  return `${originalContent}

IMPORTANT RETRY INSTRUCTIONS:
The previous plan had file conflicts. Please ensure this new plan avoids these issues:

${conflictGuidance}

Key requirements:
1. If multiple tasks modify the same file, add dependencies (use 'requires' field)
2. Or combine edits to the same file into a single task
3. Tasks that can run in parallel must NOT modify the same files`;
}
```

**Integration for v2**: This pattern would be reused for:
- `generateSpecWithRetry()` - Retry spec generation until complete
- `analyzeWithRetry()` - Retry gap analysis until comprehensive

---

## VCS Integration

### VCS Strategy Pattern
**Location**: `src/services/vcs/strategies/`

Chopstack supports **three VCS workflows**:

```typescript
type VcsMode = 'simple' | 'worktree' | 'stacked';

type VcsStrategy = {
  // Initialize VCS for execution
  initialize(plan: PlanV2, options: VcsOptions): Promise<void>;

  // Create branch/worktree for task
  prepareTask(task: TaskV2): Promise<TaskWorkspace>;

  // Commit changes after task execution
  commitTask(task: TaskV2, result: TaskResult): Promise<void>;

  // Cleanup after execution
  cleanup(): Promise<void>;
};
```

### Strategy Implementations

#### 1. Simple Strategy
**Pattern**: One branch per task, sequential execution

```
main
 ├─→ task-1 (branch) → merge
 ├─→ task-2 (branch) → merge
 └─→ task-3 (branch) → merge
```

**Pros**: Simple, no worktree complexity
**Cons**: No parallel execution

#### 2. Worktree Strategy
**Pattern**: Git worktrees for parallel execution

```
project/                      (main worktree)
.chopstack/
  └── shadows/
      ├── task-1/             (worktree for task-1)
      ├── task-2/             (worktree for task-2)
      └── task-3/             (worktree for task-3)
```

**Implementation**:
```typescript
class WorktreeVcsStrategy implements VcsStrategy {
  async prepareTask(task: TaskV2): Promise<TaskWorkspace> {
    const branchName = `task/${task.id}`;
    const worktreePath = path.join(this.cwd, '.chopstack', 'shadows', task.id);

    // Create worktree
    await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD']);

    return {
      taskId: task.id,
      branchName,
      workdir: worktreePath,
      isWorktree: true
    };
  }

  async cleanup(): Promise<void> {
    // Remove all worktrees
    const worktrees = await this.git.raw(['worktree', 'list', '--porcelain']);
    for (const worktree of this._parseWorktrees(worktrees)) {
      if (worktree.path.includes('.chopstack/shadows')) {
        await this.git.raw(['worktree', 'remove', '--force', worktree.path]);
      }
    }
  }
}
```

**Pros**: True parallel execution, isolated workspaces
**Cons**: Complex cleanup, disk space usage

#### 3. Stacked Strategy (git-spice)
**Pattern**: Stacked PRs with dependencies

```
main
 └─→ task-1 (branch)
      └─→ task-2 (branch, depends on task-1)
           └─→ task-3 (branch, depends on task-2)
```

**Integration**:
```typescript
class GitSpiceVcsStrategy implements VcsStrategy {
  async commitTask(task: TaskV2, result: TaskResult): Promise<void> {
    // Standard git commit
    await this.git.add('.');
    await this.git.commit(this._buildCommitMessage(task));

    // Create git-spice stack
    await execa('gs', ['branch', 'create', `task/${task.id}`], { cwd: this.cwd });

    // Set up dependencies
    for (const depId of task.dependencies) {
      await execa('gs', ['branch', 'restack'], { cwd: this.cwd });
    }
  }
}
```

**Pros**: GitHub-native stacked PRs, clean review process
**Cons**: Requires git-spice CLI

### VCS Engine
**File**: `src/services/vcs/vcs-engine.ts`

**Note**: The file doesn't exist in current codebase, but based on the architecture patterns, this is the likely design:

```typescript
export class VcsEngine {
  private strategy: VcsStrategy;

  constructor(mode: VcsMode) {
    this.strategy = match(mode)
      .with('simple', () => new SimpleVcsStrategy())
      .with('worktree', () => new WorktreeVcsStrategy())
      .with('stacked', () => new GitSpiceVcsStrategy())
      .exhaustive();
  }

  async execute(plan: PlanV2, options: VcsOptions): Promise<VcsResult> {
    await this.strategy.initialize(plan, options);

    try {
      for (const task of plan.tasks) {
        const workspace = await this.strategy.prepareTask(task);
        // Task execution happens here
        await this.strategy.commitTask(task, result);
      }

      return { success: true, branches: this.strategy.getBranches() };
    } finally {
      await this.strategy.cleanup();
    }
  }
}
```

---

## CLI Commands

### Command Pattern
**Location**: `src/commands/`

All commands follow a **consistent interface**:

```typescript
type Command = {
  execute(options: CommandOptions): Promise<number>; // Exit code
};

type CommandDependencies = {
  logger: Logger;
  agentService: AgentService;
  planGenerator: PlanGenerator;
  executionEngine: ExecutionEngine;
  vcsEngine: VcsEngine;
};
```

### Command Implementations

#### 1. DecomposeCommand
**File**: `src/commands/decompose/decompose-command.ts`

```typescript
export class DecomposeCommand {
  constructor(private readonly deps: CommandDependencies) {}

  async execute(options: DecomposeOptions): Promise<number> {
    const { spec, agent: agentType, output, targetDir, verbose } = options;

    // 1. Read specification
    const specContent = await fs.readFile(spec, 'utf-8');
    logger.info(`📄 Read specification: ${spec}`);

    // 2. Get agent
    const agent = this.deps.agentService.getAgent(agentType);

    // 3. Generate plan with retry
    const result = await generatePlanWithRetry(agent, specContent, targetDir, {
      maxRetries: 3,
      verbose
    });

    if (!result.success) {
      logger.error('❌ Failed to generate valid plan after retries');
      return 1;
    }

    // 4. Output plan
    const planYaml = yaml.stringify(result.plan);

    if (output) {
      await fs.writeFile(output, planYaml, 'utf-8');
      logger.info(`✅ Plan written to ${output}`);
    } else {
      console.log(planYaml);
    }

    // 5. Display metrics
    const metrics = DagValidator.calculateMetrics(result.plan);
    logger.info(`📊 Plan metrics:`);
    logger.info(`   Tasks: ${metrics.taskCount}`);
    logger.info(`   Max parallelization: ${metrics.maxParallelization}`);
    logger.info(`   Estimated speedup: ${metrics.estimatedSpeedup.toFixed(2)}x`);

    return 0;
  }
}
```

**Integration for v2**: New commands needed:
- `SpecifyCommand` - `chopstack specify "brief description"` → generates spec.md
- `AnalyzeCommand` - `chopstack analyze --spec spec.md` → generates gap report

#### 2. RunCommand
**File**: `src/commands/run/run-command.ts`

```typescript
export class RunCommand {
  constructor(private readonly deps: CommandDependencies) {}

  async execute(options: RunOptions): Promise<number> {
    const { spec, plan: planFile, mode, vcsMode, agent: agentType, targetDir } = options;

    // 1. Load or generate plan
    let plan: PlanV2;
    if (planFile) {
      plan = await this._loadPlanFile(planFile);
    } else if (spec) {
      plan = await this._generatePlanFromSpec(spec, agentType, targetDir);
    } else {
      throw new Error('Either --spec or --plan must be provided');
    }

    // 2. Validate plan
    const validation = DagValidator.validatePlan(plan);
    if (!validation.valid) {
      logger.error('❌ Plan validation failed');
      return 1;
    }

    // 3. Execute plan
    const result = await this.deps.executionEngine.execute(plan, {
      mode,
      vcsMode,
      agentType,
      cwd: targetDir,
      verbose: options.verbose,
      continueOnError: options.continueOnError,
      permissiveValidation: options.permissiveValidation
    });

    // 4. Report results
    logger.info(`✅ Execution completed`);
    logger.info(`   Success: ${result.tasks.filter(t => t.status === 'success').length}/${result.tasks.length}`);
    logger.info(`   Duration: ${result.totalDuration}ms`);

    return result.tasks.every(t => t.status === 'success') ? 0 : 1;
  }
}
```

**Integration for v2**: The run command gains new capabilities:
- `--validate` mode: Runs validation against acceptance criteria
- `--spec` injection: Passes full spec context to every task

#### 3. StackCommand
**File**: `src/commands/stack/stack-command.ts`

**Purpose**: AI-powered commit message generation + git-spice stack creation

```typescript
export class StackCommand {
  async execute(options: StackOptions): Promise<number> {
    // 1. Check for changes
    const status = await this.git.status();
    if (status.isClean()) {
      logger.info('✅ No changes to commit');
      return 0;
    }

    // 2. Stage changes (if auto-add enabled)
    if (options.autoAdd) {
      await this.git.add('.');
    }

    // 3. Generate commit message (if not provided)
    let message = options.message;
    if (!message) {
      message = await this._generateCommitMessage();
    }

    // 4. Commit
    await this.git.commit(message);
    logger.info(`✅ Committed: ${message}`);

    // 5. Create stack (if enabled)
    if (options.createStack) {
      await this._createGitSpiceStack();
    }

    return 0;
  }

  private async _generateCommitMessage(): Promise<string> {
    const diff = await this.git.diff(['--cached']);
    const agent = this.deps.agentService.getAgent('claude');

    const prompt = `Generate a concise commit message for these changes:\n\n${diff}`;
    const result = await agent.execute(prompt, [], process.cwd());

    return result.output ?? 'chore: update files';
  }
}
```

---

## Testing Strategy

### Four-Tier Test Architecture

Chopstack has a **modern, comprehensive testing approach** with 4 distinct test types:

```
Unit Tests (*.test.ts)           - 5000ms timeout
    ├─ Co-located: src/**/__tests__/*.test.ts
    ├─ Heavy mocking (file system, network, agents)
    ├─ Fast, isolated, business logic
    └─ Example: src/utils/__tests__/plan-generator.test.ts

Integration Tests (*.integration.test.ts) - 15000ms timeout
    ├─ Co-located: src/**/__tests__/*.integration.test.ts
    ├─ Real class instances, mocked externals
    ├─ End-to-end workflows within codebase
    └─ Example: src/commands/__tests__/decompose.integration.test.ts

E2E Tests (test/e2e/*.test.ts)   - 30000ms timeout
    ├─ Separate directory: test/e2e/
    ├─ Real CLI commands, real file system
    ├─ Isolated test directories
    └─ Example: test/e2e/decompose-workflow.test.ts

Execution Planning Tests (test/execution/*.test.ts) - 60000ms timeout
    ├─ Separate directory: test/execution/
    ├─ Real Claude API calls (--permission-mode plan)
    ├─ Cost-efficient testing (~$0.10-0.20 per task)
    └─ Example: test/execution/plan-execution.test.ts
```

### Vitest Configuration
**File**: `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/__tests__/*.test.ts'],
          exclude: ['src/**/__tests__/*.integration.test.ts'],
          testTimeout: 5000,
          setupFiles: ['test/setup/vitest-unit.setup.ts']
        }
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/__tests__/*.integration.test.ts'],
          testTimeout: 15_000,
          setupFiles: ['test/setup/vitest-integration.setup.ts']
        }
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 30_000,
          setupFiles: ['test/setup/vitest-e2e.setup.ts']
        }
      },
      {
        test: {
          name: 'execution',
          include: ['test/execution/**/*.test.ts'],
          testTimeout: 60_000,
          setupFiles: ['test/setup/vitest-execution.setup.ts']
        }
      }
    ]
  }
});
```

### Test Infrastructure

#### GitTestEnvironment
**File**: `test/helpers/git-test-environment.ts`

**Purpose**: Isolated Git repositories for VCS integration tests

```typescript
export function setupGitTest(testName: string): GitTestEnvironment {
  const testDir = path.join(os.tmpdir(), `chopstack-test-${testName}-${Date.now()}`);
  let git: SimpleGit;

  beforeEach(async () => {
    // Create isolated Git repo
    fs.mkdirSync(testDir, { recursive: true });
    git = simpleGit(testDir);

    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Track for cleanup
    TestResourceTracker.trackDirectory(testDir);
  });

  afterEach(async () => {
    // Automatic cleanup
    TestResourceTracker.cleanupDirectory(testDir);
  });

  return {
    getGit: () => git,
    getTmpDir: () => testDir
  };
}
```

**Usage**:
```typescript
describe('VCS Integration', () => {
  const { getGit, getTmpDir } = setupGitTest('vcs-test');

  beforeEach(() => {
    git = getGit();
    testDir = getTmpDir();
  });

  it('should create worktree for task', async () => {
    const strategy = new WorktreeVcsStrategy(git, testDir);
    const workspace = await strategy.prepareTask(mockTask);

    expect(workspace.isWorktree).toBe(true);
    expect(fs.existsSync(workspace.workdir)).toBe(true);
  });
});
```

#### TestResourceTracker
**File**: `test/helpers/test-resource-tracker.ts`

**Purpose**: Global singleton for tracking and cleaning up test resources

```typescript
class TestResourceTracker {
  private directories = new Set<string>();
  private branches = new Set<string>();
  private worktrees = new Set<string>();

  trackDirectory(path: string): void {
    this.directories.add(path);
  }

  cleanupDirectory(path: string): void {
    if (fs.existsSync(path)) {
      fs.rmSync(path, { recursive: true, force: true });
    }
    this.directories.delete(path);
  }

  cleanupAll(): void {
    // Cleanup directories
    for (const dir of this.directories) {
      this.cleanupDirectory(dir);
    }

    // Cleanup worktrees
    for (const worktree of this.worktrees) {
      execSync(`git worktree remove --force ${worktree}`);
    }

    // Cleanup branches
    for (const branch of this.branches) {
      execSync(`git branch -D ${branch}`);
    }
  }
}

export const globalTracker = new TestResourceTracker();

// Register cleanup on process exit
process.on('exit', () => globalTracker.cleanupAll());
```

**Benefits**:
- Zero test pollution
- Automatic cleanup even on crashes
- Parallel-safe (each test gets unique directories)

### Example Test Patterns

#### Unit Test
```typescript
// src/utils/__tests__/plan-generator.test.ts
import { vi } from 'vitest';
import { generatePlanWithRetry } from '../plan-generator';

vi.mock('@/agents');
vi.mock('@/utils/dag-validator');

describe('generatePlanWithRetry', () => {
  it('should return plan on first success', async () => {
    const mockAgent = {
      decompose: vi.fn().mockResolvedValue(validPlan)
    };

    const mockValidator = {
      validatePlan: vi.fn().mockReturnValue({ valid: true, errors: [] })
    };

    const result = await generatePlanWithRetry(mockAgent, specContent, cwd);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(mockAgent.decompose).toHaveBeenCalledOnce();
  });

  it('should retry on validation failure', async () => {
    const mockAgent = {
      decompose: vi.fn()
        .mockResolvedValueOnce(invalidPlan)  // First attempt fails
        .mockResolvedValueOnce(validPlan)    // Second succeeds
    };

    const result = await generatePlanWithRetry(mockAgent, specContent, cwd, {
      maxRetries: 3
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});
```

#### Integration Test
```typescript
// src/commands/__tests__/decompose.integration.test.ts
import { DecomposeCommand } from '../decompose-command';
import { createTestDependencies } from '@test/helpers';

// Real instances, mocked externals
vi.mock('node:fs/promises');

describe('DecomposeCommand Integration', () => {
  it('should decompose spec and write plan', async () => {
    const deps = createTestDependencies();
    const command = new DecomposeCommand(deps);

    const result = await command.execute({
      spec: 'test-spec.md',
      agent: 'mock',
      output: 'plan.yaml',
      targetDir: '/tmp/test'
    });

    expect(result).toBe(0);
    expect(fs.writeFile).toHaveBeenCalledWith(
      'plan.yaml',
      expect.stringContaining('name: Mock User Management'),
      'utf-8'
    );
  });
});
```

---

## Code Quality Standards

### ESLint Configuration
**File**: `eslint.config.ts` (696 lines)

Chopstack has **one of the strictest ESLint configs** in production TypeScript codebases:

#### Key Rule Categories

**TypeScript Strictness** (50+ rules):
```typescript
{
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error'
}
```

**Naming Conventions**:
```typescript
{
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'default', format: ['camelCase'] },
    { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    { selector: 'memberLike', format: ['camelCase'], leadingUnderscore: 'require', modifiers: ['private'] },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['UPPER_CASE'] },
    {
      selector: 'interface',
      format: ['PascalCase'],
      custom: { regex: '^I[A-Z]', match: false } // No "I" prefix
    }
  ]
}
```

**Import Organization**:
```typescript
{
  'perfectionist/sort-imports': [
    'error',
    {
      groups: [
        'type',              // type imports first
        'builtin',           // node:fs, node:path
        'external',          // zod, ts-pattern
        'internal-type',     // @/types/*
        'internal',          // @/services/*
        'parent-type',
        'parent',
        'sibling-type',
        'sibling',
        'index-type',
        'index'
      ],
      newlinesBetween: 'always'
    }
  ]
}
```

**Unicorn Rules** (modern JavaScript practices, 80+ rules):
```typescript
{
  'unicorn/prefer-node-protocol': 'error',        // import { readFile } from 'node:fs/promises'
  'unicorn/prefer-top-level-await': 'error',      // Top-level await
  'unicorn/no-array-for-each': 'error',           // Use for-of instead
  'unicorn/prefer-string-replace-all': 'error',   // .replaceAll() not .replace()
  'unicorn/prevent-abbreviations': 'error',       // No ctx, args, etc.
  'unicorn/filename-case': 'error'                // kebab-case files
}
```

#### Custom ESLint Plugins

**Alias Plugin** (`tools/eslint/alias-plugin.ts`):
```typescript
// Enforces @/ imports instead of ../../../
{
  'alias/prefer-alias-imports': 'error'
}

// Bad:  import { foo } from '../../../utils/foo';
// Good: import { foo } from '@/utils/foo';
```

**Guards Plugin** (`tools/eslint/guards-plugin.ts`):
```typescript
// Enforces using guards from @/validation/guards instead of inline checks
{
  'guards/prefer-guards-defined': 'error'
}

// Bad:  if (value !== undefined && value !== null) { ... }
// Good: import { isNonNullish } from '@/validation/guards';
//       if (isNonNullish(value)) { ... }
```

### Type Guards
**File**: `src/validation/guards.ts`

**Purpose**: Centralized, type-safe runtime checks

```typescript
/**
 * Check if value is non-null and non-undefined
 */
export function isNonNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value is a valid array with at least one element
 */
export function isValidArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if string has actual content (not just whitespace)
 */
export function hasContent(value: string | null | undefined): value is string {
  return isNonNullish(value) && value.trim().length > 0;
}

/**
 * Check if object has at least one property
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}
```

**Usage Example**:
```typescript
// Bad (before guards):
if (config !== undefined && config !== null && typeof config === 'object') {
  // ...
}

// Good (with guards):
import { isNonNullish, isNonEmptyObject } from '@/validation/guards';

if (isNonNullish(config) && isNonEmptyObject(config)) {
  // TypeScript knows config is Record<string, unknown> here
}
```

### Pattern Matching with ts-pattern

**Mandatory Pattern**: Use `match()` instead of switch/if-else for complex conditionals

```typescript
import { match } from 'ts-pattern';

// Example 1: Mode-based execution
const result = match(mode)
  .with('plan', () => executePlan())
  .with('dry-run', () => executeDryRun())
  .with('execute', () => executeReal())
  .with('validate', () => executeValidate())
  .exhaustive(); // Compiler error if not all cases covered

// Example 2: Error handling
const message = match(error)
  .with({ code: 'ENOENT' }, () => 'File not found')
  .with(P.instanceOf(GitError), (err) => `Git error: ${err.message}`)
  .when(isAgentError, (err) => `Agent failed: ${err.reason}`)
  .otherwise(() => 'Unknown error');

// Example 3: Complex pattern
const status = match(task)
  .with({ status: 'pending', dependencies: [] }, () => 'ready')
  .with({ status: 'pending', dependencies: P.not([]) }, () => 'blocked')
  .with({ status: 'running' }, () => 'in-progress')
  .exhaustive();
```

**Why**: Exhaustiveness checking catches missing cases at compile-time.

---

## Logging Architecture

### Dual Logging System

Chopstack has **two separate, complementary logging systems**:

```
┌─────────────────────────────────────────────────────────┐
│  System 1: Service Logger                              │
│  - General application logs                            │
│  - User-facing messages                                │
│  - Debug output                                         │
│  - Controlled by --verbose flag                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  System 2: Execution Event Bus                         │
│  - Task lifecycle events                               │
│  - Claude CLI stream data                              │
│  - VCS operation events                                │
│  - Cross-cutting concerns (TUI, metrics, webhooks)     │
└─────────────────────────────────────────────────────────┘
```

### System 1: Service Logger
**Files**: `src/utils/logger.ts`, `src/utils/global-logger.ts`

```typescript
export type Logger = {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  configure(options: LoggerOptions): void;
};

export const logger: Logger = {
  debug: (message) => {
    if (logLevel <= LogLevel.DEBUG) {
      console.log(chalk.dim(message));
    }
  },

  info: (message) => {
    if (logLevel <= LogLevel.INFO) {
      console.log(chalk.blue(message));
    }
  },

  warn: (message) => {
    if (logLevel <= LogLevel.WARN) {
      console.log(chalk.yellow(message));
    }
  },

  error: (message) => {
    if (logLevel <= LogLevel.ERROR) {
      console.error(chalk.red(message));
    }
  },

  configure: (options) => {
    if (options.verbose) {
      logLevel = LogLevel.DEBUG;
    }
    if (options.silent) {
      logLevel = LogLevel.NONE;
    }
  }
};
```

**Usage**:
```typescript
import { logger } from '@/utils/global-logger';

logger.info('🔍 Analyzing codebase...');
logger.debug('Plan has 15 tasks, 3 phases');
logger.warn('⚠️ Task has file conflicts');
logger.error('❌ Validation failed');
```

### System 2: Execution Event Bus
**File**: `src/services/events/execution-event-bus.ts`

```typescript
export type ExecutionEvents = {
  'task:start': { taskId: string; taskName: string };
  'task:progress': { taskId: string; progress: number };
  'task:complete': { taskId: string; success: boolean };
  'stream:data': { taskId: string; event: ClaudeStreamEvent };
  'branch:created': { taskId: string; branchName: string };
  'commit:made': { taskId: string; commitHash: string };
};

export class ExecutionEventBus {
  private readonly emitter = new EventEmitter();

  emitTaskStart(taskId: string, metadata: { taskName: string }): void {
    this.emitter.emit('task:start', { taskId, ...metadata });
  }

  emitStreamData(taskId: string, event: ClaudeStreamEvent): void {
    this.emitter.emit('stream:data', { taskId, event });
  }

  emitTaskComplete(taskId: string, success: boolean): void {
    this.emitter.emit('task:complete', { taskId, success });
  }

  onTaskStart(handler: (event) => void): void {
    this.emitter.on('task:start', handler);
  }
}
```

**Consumer** (filters events based on verbose flag):
```typescript
// src/services/events/execution-event-consumer.ts
export class ExecutionEventConsumer {
  constructor(private readonly verbose: boolean) {}

  consumeEvent(event: ExecutionEvent): void {
    match(event)
      .with({ type: 'task:start' }, (e) => {
        logger.info(`🚀 Starting task: ${e.taskName}`);
      })
      .with({ type: 'stream:data' }, (e) => {
        if (this.verbose) {
          this._handleStreamData(e.event);
        }
      })
      .with({ type: 'task:complete' }, (e) => {
        const emoji = e.success ? '✅' : '❌';
        logger.info(`${emoji} Task ${e.taskId} ${e.success ? 'succeeded' : 'failed'}`);
      })
      .exhaustive();
  }

  private _handleStreamData(event: ClaudeStreamEvent): void {
    match(event)
      .with({ type: 'thinking' }, (e) => {
        logger.debug(`💭 Thinking: ${e.content.slice(0, 100)}...`);
      })
      .with({ type: 'tool_use' }, (e) => {
        logger.debug(`🔧 Using tool: ${e.tool}`);
      })
      .otherwise(() => {});
  }
}
```

**Integration**:
```typescript
// CLI entry point
import { initializeEventConsumer } from '@/services/events';

const program = new Command();

program
  .command('run')
  .action(async (options) => {
    // Configure logger
    logger.configure({ verbose: options.verbose });

    // Initialize event consumer
    initializeEventConsumer({ verbose: options.verbose });

    // Execute command
    const command = new RunCommand(deps);
    await command.execute(options);
  });
```

### When to Use Which System

| Scenario | System | Example |
|----------|--------|---------|
| VCS operation logging | Service Logger | `logger.info('Creating branch...')` |
| User error messages | Service Logger | `logger.error('Failed to...')` |
| Debug internal state | Service Logger | `logger.debug('State:', state)` |
| Claude stream events | Event Bus | `eventBus.emitStreamData(...)` |
| Task lifecycle | Event Bus | `eventBus.emitTaskStart(...)` |
| Branch/commit events | Event Bus | `eventBus.emitBranchCreated(...)` |

---

## Build System

### Build Configuration
**File**: `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',           // MCP server entry
    'bin/chopstack': 'src/entry/cli/chopstack.ts' // CLI entry
  },
  format: ['esm'],                   // ESM only (no CommonJS)
  target: 'node18',                  // Node.js 18+
  dts: true,                         // Generate .d.ts files
  sourcemap: true,                   // Generate source maps
  clean: true,                       // Clean dist/ before build
  splitting: true,                   // Code splitting for smaller bundles
  shims: false,                      // No CJS shims (pure ESM)
  outDir: 'dist',
  external: [
    'node:*',                        // Externalize Node.js built-ins
    '@anthropic-ai/claude-code'      // External SDK
  ]
});
```

**Key Decisions**:
- **ESM-only**: No CommonJS support, uses modern Node.js features
- **Dual entry points**: CLI and MCP server can be built separately
- **Tree-shaking**: Code splitting enables optimal bundle size
- **Source maps**: Full debugging support in production

### Package.json Scripts

```json
{
  "scripts": {
    "build": "tsup",                           // Full build
    "dev": "tsx watch src/entry/cli/chopstack.ts",  // CLI dev mode
    "dev:mcp": "fastmcp dev src/index.ts",     // MCP dev mode
    "start": "node dist/bin/chopstack.js",     // Run built CLI
    "start:mcp": "node dist/index.js",         // Run built MCP server

    "lint": "pnpm run type-check && pnpm run format:check && eslint .",
    "lint:fix": "pnpm run format && eslint . --fix",
    "type-check": "tsc --noEmit",              // Type checking only

    "test": "vitest --run",                    // All tests
    "test:unit": "vitest --project=unit --run",
    "test:integration": "vitest --project=integration --run",
    "test:e2e": "vitest --project=e2e --run",
    "test:execution": "vitest --project=execution --run"
  }
}
```

### Module Resolution

**Path Aliases** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@test/*": ["test/*"]
    }
  }
}
```

**Usage**:
```typescript
// Bad:  import { PlanV2 } from '../../../types/schemas-v2';
// Good: import { PlanV2 } from '@/types/schemas-v2';

// Bad:  import { setupGitTest } from '../../test/helpers';
// Good: import { setupGitTest } from '@test/helpers';
```

**Build-time Resolution** (`tsup.config.ts`):
```typescript
import { defineConfig } from 'tsup';
import { esbuildPluginTsconfigPaths } from '@esbuild-plugins/tsconfig-paths';

export default defineConfig({
  esbuildPlugins: [esbuildPluginTsconfigPaths()]
});
```

---

## Integration Points for v2

### New Commands Needed

#### 1. SpecifyCommand
**File**: `src/commands/specify/specify-command.ts` (NEW)

```typescript
export class SpecifyCommand {
  async execute(options: SpecifyOptions): Promise<number> {
    const { prompt, output, targetDir, agent: agentType } = options;

    // 1. Analyze codebase
    const codebaseAnalysis = await this._analyzeCodebase(targetDir);

    // 2. Generate rich specification
    const agent = this.deps.agentService.getAgent(agentType);
    const spec = await agent.expandSpecification({
      brief: prompt,
      codebase: codebaseAnalysis,
      projectPrinciples: this._extractPrinciples()
    });

    // 3. Write specification
    const outputPath = output ?? `${slugify(prompt)}.md`;
    await fs.writeFile(outputPath, spec, 'utf-8');

    logger.info(`✅ Specification written to ${outputPath}`);
    logger.info(`📊 Specification metrics:`);
    logger.info(`   Functional requirements: ${spec.functionalRequirements.length}`);
    logger.info(`   Acceptance criteria: ${spec.acceptanceCriteria.length}`);

    return 0;
  }
}
```

**Integration**:
- CLI: `chopstack specify "add dark mode" --output dark-mode.md`
- Requires: New agent method `expandSpecification()`
- Outputs: Markdown file with comprehensive spec

#### 2. AnalyzeCommand
**File**: `src/commands/analyze/analyze-command.ts` (NEW)

```typescript
export class AnalyzeCommand {
  async execute(options: AnalyzeOptions): Promise<number> {
    const { spec, codebase, output } = options;

    // 1. Load specification and codebase docs
    const specContent = await fs.readFile(spec, 'utf-8');
    const codebaseContent = codebase ? await fs.readFile(codebase, 'utf-8') : null;

    // 2. Analyze completeness
    const agent = this.deps.agentService.getAgent('claude');
    const report = await agent.analyzeSpecification({
      spec: specContent,
      codebase: codebaseContent
    });

    // 3. Check for blocking issues
    const criticalGaps = report.gaps.filter(g => g.severity === 'CRITICAL');
    const highGaps = report.gaps.filter(g => g.severity === 'HIGH');

    // 4. Output report
    const reportMarkdown = this._formatReport(report);

    if (output) {
      await fs.writeFile(output, reportMarkdown, 'utf-8');
    } else {
      console.log(reportMarkdown);
    }

    // 5. Exit code based on completeness
    if (report.completeness < 100) {
      logger.warn(`⚠️ Specification incomplete: ${report.completeness}% complete`);
      logger.warn(`   ${criticalGaps.length} CRITICAL, ${highGaps.length} HIGH priority gaps`);
      return 1;
    }

    logger.info(`✅ Specification is 100% complete`);
    return 0;
  }
}
```

**Integration**:
- CLI: `chopstack analyze --spec dark-mode.md --output gap-report.md`
- Requires: New agent method `analyzeSpecification()`
- Outputs: Gap analysis report with remediation steps

### Agent Interface Extensions

**File**: `src/types/agent.ts` (EXTEND)

```typescript
export type Agent = {
  // Existing methods
  decompose(prompt: string, cwd: string, options: DecomposeOptions): Promise<PlanV2>;
  execute(prompt: string, files: string[], cwd: string): Promise<TaskResult>;
  validate(prompt: string, criteria: string[], cwd: string): Promise<ValidationResult>;

  // NEW for v2
  expandSpecification(request: SpecificationExpansionRequest): Promise<RichSpecification>;
  analyzeSpecification(request: SpecificationAnalysisRequest): Promise<AnalysisReport>;
  extractPrinciples(files: string[]): Promise<ProjectPrinciples>;
};

export type SpecificationExpansionRequest = {
  brief: string;                      // Brief description
  codebase: CodebaseAnalysis;         // Codebase context
  projectPrinciples: ProjectPrinciples; // Extracted principles
};

export type RichSpecification = {
  overview: string;
  background: string;
  functionalRequirements: Requirement[];
  nonFunctionalRequirements: Requirement[];
  architecture: string;               // ASCII diagrams
  components: ComponentSpec[];
  acceptanceCriteria: string[];
  successMetrics: SuccessMetrics;
};

export type SpecificationAnalysisRequest = {
  spec: string;                       // Spec markdown content
  codebase?: string;                  // Codebase.md content (optional)
};
```

### New Service: SpecificationService
**File**: `src/services/specification/specification-service.ts` (NEW)

```typescript
export class SpecificationService {
  constructor(private readonly agent: Agent) {}

  async expandBriefToSpec(
    brief: string,
    cwd: string,
    options: { verbose?: boolean }
  ): Promise<RichSpecification> {
    // 1. Analyze codebase
    const codebaseAnalysis = await this._analyzeCodebase(cwd);

    // 2. Extract project principles
    const principles = await this._extractPrinciples(cwd);

    // 3. Expand specification
    return await this.agent.expandSpecification({
      brief,
      codebase: codebaseAnalysis,
      projectPrinciples: principles
    });
  }

  async analyzeCompleteness(
    specContent: string,
    codebaseContent?: string
  ): Promise<AnalysisReport> {
    return await this.agent.analyzeSpecification({
      spec: specContent,
      codebase: codebaseContent
    });
  }

  private async _analyzeCodebase(cwd: string): Promise<CodebaseAnalysis> {
    // Use agent to analyze project structure, tech stack, patterns
    const files = await this._gatherRelevantFiles(cwd);
    const prompt = this._buildCodebaseAnalysisPrompt(files);

    return await this.agent.analyzeCodebase(prompt, cwd);
  }

  private async _extractPrinciples(cwd: string): Promise<ProjectPrinciples> {
    const principleFiles = [
      path.join(cwd, 'CLAUDE.md'),
      path.join(cwd, '.cursorrules'),
      path.join(cwd, 'CONTRIBUTING.md')
    ].filter(f => fs.existsSync(f));

    return await this.agent.extractPrinciples(principleFiles);
  }
}
```

### Decompose Command Enhancement
**File**: `src/commands/decompose/decompose-command.ts` (EXTEND)

**NEW: Pre-decomposition gate check**:

```typescript
export class DecomposeCommand {
  async execute(options: DecomposeOptions): Promise<number> {
    const { spec, agent: agentType, output, targetDir } = options;

    // 1. Read specification
    const specContent = await fs.readFile(spec, 'utf-8');

    // 2. GATE CHECK: Verify no unresolved open questions
    const openQuestions = this._extractOpenQuestions(specContent);
    if (openQuestions.length > 0) {
      logger.error('❌ Cannot decompose: specification has unresolved open questions');
      logger.error('   Open questions:');
      for (const question of openQuestions) {
        logger.error(`   - ${question}`);
      }
      logger.error('\n💡 Run `chopstack analyze --spec ${spec}` to identify and resolve these questions');
      return 1;
    }

    // 3. Generate plan with retry
    const agent = this.deps.agentService.getAgent(agentType);
    const result = await generatePlanWithRetry(agent, specContent, targetDir);

    // 4. POST-GENERATION VALIDATION: Quality guardrails
    const qualityIssues = this._validateTaskQuality(result.plan);
    if (qualityIssues.critical.length > 0 || qualityIssues.high.length > 0) {
      logger.warn('⚠️ BLOCKING ISSUES FOUND - Plan may fail during execution');
      this._displayQualityIssues(qualityIssues);

      logger.warn('\n💡 Suggestions:');
      logger.warn('   - Split XL tasks into 3-4 smaller tasks (M or L size)');
      logger.warn('   - Specify exact file paths instead of wildcards');
      logger.warn('   - Break migration tasks into module-specific tasks');

      return 1;
    }

    // 5. Output plan
    const planYaml = yaml.stringify(result.plan);
    await fs.writeFile(output, planYaml, 'utf-8');

    logger.info(`✅ Plan written to ${output}`);
    logger.info(`📊 Quality: 0 critical, 0 high issues`);

    return 0;
  }

  private _extractOpenQuestions(specContent: string): string[] {
    // Parse markdown for "Open Tasks/Questions" section
    const openTasksMatch = specContent.match(/## Open Tasks\/Questions\n\n([\s\S]+?)(?=\n##|$)/);
    if (!openTasksMatch) {
      return [];
    }

    // Extract bullet points
    const section = openTasksMatch[1];
    const lines = section.split('\n').filter(l => l.startsWith('- '));

    return lines.map(l => l.replace(/^- /, '').trim());
  }

  private _validateTaskQuality(plan: PlanV2): QualityIssues {
    const critical: QualityIssue[] = [];
    const high: QualityIssue[] = [];
    const medium: QualityIssue[] = [];
    const low: QualityIssue[] = [];

    for (const task of plan.tasks) {
      // Critical: XL tasks (must be split)
      if (task.complexity === 'XL') {
        critical.push({
          taskId: task.id,
          severity: 'CRITICAL',
          message: 'Task is XL complexity. Tasks this large often expand during execution.',
          suggestion: 'Break this task into 3-4 smaller tasks (M or L size) with clear dependencies.'
        });
      }

      // High: Tasks touching > 10 files
      if (task.files.length > 10) {
        high.push({
          taskId: task.id,
          severity: 'HIGH',
          message: 'Task touches > 10 files. This indicates too much scope.',
          suggestion: 'Split into multiple tasks with narrower file scope.'
        });
      }

      // High: Vague file patterns
      const vaguePatterns = task.files.filter(f => f.includes('**') || f.includes('*'));
      if (vaguePatterns.length > 0) {
        high.push({
          taskId: task.id,
          severity: 'HIGH',
          message: `Task has vague file patterns: ${vaguePatterns.join(', ')}`,
          suggestion: 'Specify exact file paths instead of wildcards.'
        });
      }

      // Medium: Short descriptions
      if (task.description.length < 50) {
        medium.push({
          taskId: task.id,
          severity: 'MEDIUM',
          message: 'Description is too short (< 50 chars). May be ambiguous.',
          suggestion: 'Add more context about what needs to be done and why.'
        });
      }

      // Low: Complex tasks with no dependencies
      if (task.complexity === 'L' || task.complexity === 'XL') {
        if (task.dependencies.length === 0) {
          low.push({
            taskId: task.id,
            severity: 'LOW',
            message: 'Complex task has no dependencies. May be missing prerequisites.',
            suggestion: 'Review if this task depends on other tasks being completed first.'
          });
        }
      }
    }

    return { critical, high, medium, low };
  }
}
```

### Run Command Enhancement
**File**: `src/commands/run/run-command.ts` (EXTEND)

**NEW: Specification context injection**:

```typescript
export class RunCommand {
  async execute(options: RunOptions): Promise<number> {
    const { spec, plan: planFile, mode, vcsMode } = options;

    // 1. Load plan and spec
    const plan = await this._loadPlan(planFile);
    const specContent = spec ? await fs.readFile(spec, 'utf-8') : null;

    // 2. Create execution context with spec injection
    const executionContext: ExecutionContext = {
      plan,
      specContent,                    // NEW: Full spec context
      mode,
      vcsMode,
      agentType: options.agent,
      cwd: options.targetDir,
      verbose: options.verbose
    };

    // 3. Execute with context
    const result = await this.deps.executionEngine.execute(plan, executionContext);

    // 4. If validate mode, check acceptance criteria
    if (mode === 'validate') {
      return await this._runValidation(plan, specContent);
    }

    return result.tasks.every(t => t.status === 'success') ? 0 : 1;
  }

  private async _runValidation(plan: PlanV2, specContent: string | null): Promise<number> {
    const validator = new ValidationService(this.deps.agentService);

    // 1. Validate acceptance criteria
    const criteriaResults = await validator.validateAcceptanceCriteria(plan);

    // 2. Validate success metrics
    const metricsResults = await validator.validateSuccessMetrics(plan);

    // 3. Validate project principles
    const principleResults = await validator.validateProjectPrinciples(plan, specContent);

    // 4. Generate report
    const report = this._generateValidationReport({
      criteriaResults,
      metricsResults,
      principleResults
    });

    // 5. Output report
    console.log(report);

    // 6. Exit code based on validation
    const allPassed =
      criteriaResults.every(r => r.passed) &&
      metricsResults.every(r => r.passed) &&
      principleResults.violations.length === 0;

    return allPassed ? 0 : 1;
  }
}
```

---

## Code Patterns & Examples

### Pattern 1: Zod Schema + TypeScript Type

```typescript
// Define Zod schema
export const taskV2Schema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']),
  description: z.string().min(50),
  files: z.array(z.string()).min(1),
  acceptanceCriteria: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([])
});

// Infer TypeScript type
export type TaskV2 = z.infer<typeof taskV2Schema>;

// Runtime validation
function parseTask(raw: unknown): TaskV2 {
  return taskV2Schema.parse(raw); // Throws ZodError if invalid
}

// Safe parsing
function safeParseTask(raw: unknown): TaskV2 | null {
  const result = taskV2Schema.safeParse(raw);
  return result.success ? result.data : null;
}
```

### Pattern 2: Match-Based Control Flow

```typescript
import { match, P } from 'ts-pattern';

function handleTaskResult(result: TaskResult): string {
  return match(result)
    .with({ status: 'success', filesModified: P.not([]) }, (r) =>
      `✅ Success! Modified ${r.filesModified.length} files`
    )
    .with({ status: 'success', filesModified: [] }, () =>
      `⚠️ Success but no files modified`
    )
    .with({ status: 'failure', error: P.string }, (r) =>
      `❌ Failed: ${r.error}`
    )
    .with({ status: 'skipped' }, () =>
      `⏭️ Skipped`
    )
    .exhaustive(); // Compiler error if not all cases covered
}
```

### Pattern 3: Type-Safe Event Emission

```typescript
// Define event types
export type ExecutionEvents = {
  'task:start': { taskId: string; taskName: string };
  'task:complete': { taskId: string; success: boolean };
  'stream:data': { taskId: string; event: ClaudeStreamEvent };
};

// Type-safe emitter
export class TypedEventEmitter {
  private emitter = new EventEmitter();

  emit<K extends keyof ExecutionEvents>(
    event: K,
    data: ExecutionEvents[K]
  ): void {
    this.emitter.emit(event, data);
  }

  on<K extends keyof ExecutionEvents>(
    event: K,
    handler: (data: ExecutionEvents[K]) => void
  ): void {
    this.emitter.on(event, handler);
  }
}

// Usage
const emitter = new TypedEventEmitter();

emitter.on('task:start', (data) => {
  // TypeScript knows data is { taskId: string; taskName: string }
  console.log(`Starting ${data.taskName}`);
});

emitter.emit('task:start', { taskId: 'task-1', taskName: 'Create Types' });
```

### Pattern 4: Dependency Injection

```typescript
// Define dependencies
export type ServiceDependencies = {
  logger: Logger;
  agentService: AgentService;
  vcsEngine: VcsEngine;
};

// Service with DI
export class ExecutionService {
  constructor(private readonly deps: ServiceDependencies) {}

  async execute(plan: PlanV2): Promise<ExecutionResult> {
    this.deps.logger.info('Starting execution');
    const agent = this.deps.agentService.getAgent('claude');
    await this.deps.vcsEngine.initialize(plan);
    // ...
  }
}

// Factory pattern
export function createExecutionService(
  logger: Logger,
  config: RuntimeConfig
): ExecutionService {
  const agentService = new AgentService(config.agentType);
  const vcsEngine = new VcsEngine(config.vcsMode);

  return new ExecutionService({ logger, agentService, vcsEngine });
}
```

### Pattern 5: Error Handling

```typescript
// Custom error types
export class PlanValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly cause?: Error
  ) {
    super(`Agent not found: ${agentType}`);
    this.name = 'AgentNotFoundError';
  }
}

// Usage with match
function handleError(error: unknown): number {
  return match(error)
    .with(P.instanceOf(PlanValidationError), (e) => {
      logger.error('Validation failed:');
      for (const err of e.validationErrors) {
        logger.error(`  - ${err}`);
      }
      return 1;
    })
    .with(P.instanceOf(AgentNotFoundError), (e) => {
      logger.error(`Agent '${e.agentType}' not available`);
      if (e.cause) {
        logger.error(`Cause: ${e.cause.message}`);
      }
      return 1;
    })
    .with(P.instanceOf(ZodError), (e) => {
      logger.error('Invalid configuration:');
      for (const issue of e.issues) {
        logger.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      return 1;
    })
    .otherwise(() => {
      logger.error('Unknown error occurred');
      return 1;
    });
}
```

---

## Summary

### Key Strengths

1. **Type Safety**: Zero `any` types, exhaustive pattern matching, Zod validation
2. **Modularity**: Clear separation of concerns, dependency injection, interface-driven
3. **Testing**: 4-tier strategy (unit, integration, e2e, execution), 95%+ coverage goal
4. **Code Quality**: 450+ ESLint rules, custom plugins, strict TypeScript
5. **Architecture**: Layered design, strategy pattern, adapter pattern, event-driven
6. **Developer Experience**: Path aliases, co-located tests, hot reload, comprehensive docs

### Integration Complexity for v2

**Low Complexity** (existing patterns):
- New commands (SpecifyCommand, AnalyzeCommand)
- New agent methods (expandSpecification, analyzeSpecification)
- New service (SpecificationService)
- Type extensions (AnalysisReport, RichSpecification)

**Medium Complexity** (new features):
- Pre-decomposition gate checks
- Post-generation quality validation
- Specification context injection
- Validation mode implementation

**High Complexity** (system changes):
- Phase-based execution (already partially implemented)
- Cross-artifact analysis
- Project principles extraction
- Multi-step workflow orchestration

### Recommended Approach

1. **Phase 1**: Add new types and schemas
   - Extend `src/types/schemas-v2.ts` with analysis types
   - Create `src/types/specification.ts` for spec-related types

2. **Phase 2**: Implement new agent methods
   - Extend `ClaudeCodeDecomposer` with spec expansion
   - Add analysis capabilities to agent interface

3. **Phase 3**: Create new services
   - Build `SpecificationService` for spec generation/analysis
   - Build `ValidationService` for acceptance criteria checking

4. **Phase 4**: Add new commands
   - Implement `SpecifyCommand`
   - Implement `AnalyzeCommand`
   - Extend `DecomposeCommand` with gate checks
   - Extend `RunCommand` with validation mode

5. **Phase 5**: Integration testing
   - Unit tests for new services
   - Integration tests for command workflows
   - E2E tests for full user journeys

---

## File Count Statistics

- **Total TypeScript files**: 160+
- **Test directories**: 23
- **Core type files**: 6 (schemas-v2.ts, agent.ts, cli.ts, events.ts, mcp.ts, validation.ts)
- **Service files**: 30+ (execution, planning, orchestration, VCS, agents)
- **Command files**: 9 (decompose, run, stack + factory + dispatcher)
- **Adapter files**: 8 (agents: claude, mock, aider; VCS: simple, worktree, stacked)

---

## Appendix: Key File Reference

| Category | File Path | Lines | Purpose |
|----------|-----------|-------|---------|
| **Types** | `src/types/schemas-v2.ts` | 647 | Core v2 type system |
| **Validation** | `src/validation/dag-validator.ts` | 473 | DAG analysis & validation |
| **Execution** | `src/services/orchestration/adapters/claude-cli-task-execution-adapter.ts` | 662 | Claude CLI integration |
| **Agent** | `src/adapters/agents/claude.ts` | 349 | Claude decomposer |
| **Planning** | `src/services/planning/plan-generator.ts` | 165 | Plan generation with retry |
| **Commands** | `src/entry/cli/chopstack.ts` | 178 | CLI entry point |
| **Config** | `eslint.config.ts` | 696 | ESLint rules |
| **Config** | `vitest.config.ts` | 78 | Test configuration |
| **Config** | `tsconfig.json` | 66 | TypeScript configuration |

---

**End of Codebase Analysis**

This document provides comprehensive architectural context for implementing chopstack v2.0.0 Phase 2. All patterns, types, and integration points are production-tested and follow the project's strict quality standards.
