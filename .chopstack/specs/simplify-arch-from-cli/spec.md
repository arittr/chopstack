# Specification: VCS-Agnostic Worktree Management via MCP

**Status**: Draft v1.0
**Created**: 2025-10-16
**Epic**: Architecture Simplification
**Related Issues**: git-spice coupling, parallel execution isolation, MCP integration

## Overview

This specification describes the implementation of VCS-agnostic worktree management through the chopstack MCP server, enabling parallel task execution with complete isolation, automatic stack integration, and support for multiple version control workflows (git-spice, merge-commit, graphite, sapling). The implementation extracts existing VCS infrastructure into a slim, focused MCP server that slash commands require for execution.

The implementation replaces the current CLI/TUI execution model with Claude Code slash commands that orchestrate parallel agents in isolated worktrees, automatically integrate completed branches into stacks, and support different stacking workflows based on user preference or repository configuration.

## Background

### Current State

**Strengths**:
- Well-structured VCS layer with strategy patterns (`src/services/vcs/strategies/`)
- Comprehensive domain services for worktrees, commits, and stack building
- Event-driven architecture with ExecutionEventBus
- Existing MCP server with 11 tools for task execution and monitoring
- Robust test infrastructure with GitTestEnvironment
- Strong TypeScript configuration with strict safety

**Limitations**:
1. **Hard-coded git-spice**: All stacking operations assume git-spice backend
2. **No parallel isolation**: Parallel agents work in same directory causing file conflicts
3. **MCP duplication**: GitWorkflowManager in MCP server duplicates VCS domain logic
4. **Manual orchestration**: `/execute-phase` requires user to run per phase, no stack integration
5. **Backend coupling**: VcsBackend interface assumes stacking model unsuitable for merge-commit

**Infrastructure Assets**:
- **VCS Domain Services**: 95% reusable (WorktreeService, CommitService, RepositoryService)
- **Git Abstractions**: 100% reusable (GitWrapper, GitSpiceBackend patterns)
- **Event System**: 100% reusable (ExecutionEventBus for cross-cutting concerns)
- **Test Helpers**: 100% reusable (setupGitTest, TestResourceTracker)
- **Strategy Pattern**: 70% reusable (lifecycle hooks, context management)

### Problems

**Problem 1: Parallel Execution Conflicts**
When `/execute-phase` spawns parallel agents, they all work in the same directory, causing:
- Git index conflicts when agents commit simultaneously
- File overwrites when tasks touch same files
- No isolation between task implementations
- Manual conflict resolution required

**Problem 2: VCS Backend Coupling**
Current implementation is tightly coupled to git-spice:
- StackBuildService only implements git-spice operations
- VcsBackend interface assumes parent/child branch relationships
- No support for alternative workflows (merge-commit, graphite)
- Adding new backends requires extensive refactoring

**Problem 3: MCP Architecture Duplication**
GitWorkflowManager class in MCP server (lines 60-209 of `src/entry/mcp/server.ts`):
- Duplicates WorktreeService functionality with direct `execa` calls
- Reimplements git operations that exist in domain services
- No integration with VcsEngineService
- Maintenance burden across two implementations

**Problem 4: Manual Phase Progression**
Current execution model requires:
- User manually runs `/execute-phase` per phase
- Manual verification of completions between phases
- No automatic stack integration or branch management
- Manual restacking required after parallel execution

### Goals

**Goal 1: VCS-Agnostic Architecture**
Extract VCS primitives into slim MCP server supporting multiple backends:
- git-spice (primary, existing)
- merge-commit (simple fallback, implemented)
- graphite (alternative stacking, stubbed for future)
- sapling (future support, stubbed)

**Goal 2: Parallel Execution with Isolation**
Enable true parallel execution through isolated worktrees:
- Each agent works in dedicated worktree on unique branch
- Zero file conflicts between concurrent agents
- Automatic cleanup after integration
- Configurable worktree paths and branch naming

**Goal 3: Automatic Stack Integration**
Orchestrate stack building after task completion:
- Sequential: Linear stacks (main → task-1 → task-2 → task-3)
- Parallel: Fan-out stacks (main → [task-a, task-b, task-c])
- Mode-specific: git-spice restacking, merge-commit merges, graphite submission

**Goal 4: Clean Architecture**
Establish maintainable patterns for future extensions:
- Replace GitWorkflowManager with VCS domain services
- Thin MCP tool adapters with no business logic
- Clear separation: orchestration (slash commands) vs primitives (MCP)
- Comprehensive test coverage (unit + integration + E2E)
- Isolate reusable components from deprecated CLI/TUI infrastructure

## Requirements

### Functional Requirements

#### FR1: VCS Backend Abstraction

**FR1.1: Merge-Commit Backend**
- Implement `MergeCommitBackend` with standard git operations
- Support branch creation from merge-base
- Merge completed branches with `--no-ff` flag
- No parent/child tracking (flat branch structure)
- PR submission via GitHub/GitLab API

**FR1.2: Graphite Backend (Placeholder)**
- Stub implementation for future Graphite support
- Implement interface methods with "not implemented" errors
- Document integration approach and CLI commands
- Provide migration path notes for future implementation
- Return clear guidance when user attempts to use graphite mode

**FR1.3: Sapling Backend (Placeholder)**
- Stub implementation for future Sapling support
- Document incompatibility with worktree strategy
- Provide migration path notes
- Return "not implemented" errors with clear guidance

**FR1.4: VCS Mode Configuration**
- Support explicit configuration via CLI flag or config file
- When mode explicitly specified: Fail if tool unavailable (no fallback)
- When mode NOT specified: Default to merge-commit (requires only git)
- No auto-detection of VCS tools (explicit configuration required for non-default modes)
- Clear error messages with installation instructions when tool unavailable

**FR1.5: Enhanced VcsBackend Interface**
- Extend interface to support non-stacking workflows
- Add optional methods for stack operations (trackBranch, restack)
- Separate branch creation from parent tracking
- Add conflict detection and resolution primitives

#### FR2: MCP VCS Tools

**FR2.1: configure_vcs Tool**
- Validate VCS mode (git-spice, merge-commit, graphite, sapling)
- Check tool availability (binary exists, correct version)
- Explicit mode: Fail if tool unavailable (no fallback)
- Default mode: Use merge-commit (requires only git)
- Initialize VCS backend for repository
- Return configuration status and capabilities

**FR2.2: create_task_worktree Tool**
- Create isolated worktree for task at configured path
- Generate unique branch name (task/{task-id} or chopstack/{run-id}/{task-id})
- Return worktree path, branch name, base reference
- Handle collisions with retry logic

**FR2.3: integrate_task_stack Tool**
- Integrate completed task branches based on VCS mode
- For git-spice: Create stacked branches with parent tracking
- For merge-commit: Merge branches to target with --no-ff
- For graphite: Restack and optionally submit
- Handle merge conflicts with detailed reporting

**FR2.4: cleanup_task_worktree Tool**
- Remove worktree from filesystem
- Optionally preserve branch (git-spice) or delete (merge-commit)
- Prune worktree references from git config
- Handle cleanup failures gracefully

**FR2.5: list_task_worktrees Tool**
- List all active worktrees for repository
- Include task IDs, paths, branches, status
- Filter by chopstack worktrees only
- Support cleanup of orphaned worktrees

**FR2.6: Tool Validation**
- All tools use Zod schemas for parameter validation
- Return JSON.stringify() responses per FastMCP convention
- Emit events via ExecutionEventBus for TUI integration
- Follow existing MCP server patterns and naming conventions

#### FR3: Slash Command Integration

**FR3.1: MCP Requirement**
- Slash commands require chopstack MCP server (no fallback)
- Verify MCP server availability at command start
- Fail fast with clear error message if MCP unavailable
- Detect VCS mode from config or auto-detection
- Store VCS mode for agent prompt injection
- Provide installation instructions in error message

**FR3.2: Sequential Execution with Worktrees**
- Create worktree before each task execution
- Inject worktree path and VCS-specific commit command into agent prompt
- Wait for agent completion
- Integrate single-task stack (linear stacking)
- Cleanup worktree and update base reference for next task
- Result: Sequential stack (main → task-1 → task-2 → task-3)

**FR3.3: Parallel Execution with Worktrees**
- Create all worktrees upfront (bulk operation)
- Spawn all agents concurrently with task-specific worktree paths
- Wait for all agents to complete
- Integrate entire task stack in dependency order
- Handle merge conflicts with detailed reporting
- Cleanup all worktrees after integration
- Result: Parallel stack (main → [task-a, task-b, task-c])

**FR3.4: Agent Prompt Modification**
- Inject WORKTREE SETUP section with path, branch, base reference
- Include VCS-specific commit command based on detected mode
- Add critical rules (ALWAYS work in worktree, use correct commit command)
- Maintain existing task extraction and quality gate sections

#### FR4: Error Handling

**FR4.1: Worktree Creation Failures**
- Handle branch name collisions with retry and unique suffixes
- Handle path conflicts with cleanup and retry
- Show actionable error messages with resolution steps
- Fail execution if worktree creation cannot recover

**FR4.2: Integration Conflicts**
- Detect merge conflicts during stack integration
- Report conflicting tasks and files
- Keep worktrees intact for manual resolution
- Provide clear resolution instructions

**FR4.3: Cleanup Failures**
- Log warnings but don't block execution
- Suggest manual cleanup commands (git worktree prune)
- Track orphaned worktrees for next run cleanup
- Continue with next task or report at end

**FR4.4: VCS Tool Unavailability**
- Detect missing VCS binaries (gs, gt, sl)
- If mode explicitly specified: Fail immediately with installation instructions
- If mode auto-detected: Fallback to next available mode (git-spice → merge-commit)
- Show clear error indicating requested mode vs fallback used
- Validate tool version compatibility
- Fail with clear error if no VCS backend available (git itself missing)

### Non-Functional Requirements

#### NFR1: Performance

**NFR1.1: Worktree Creation**
- Worktree creation completes in < 2 seconds per task
- Parallel worktree creation uses concurrent operations
- No performance degradation vs current sequential execution

**NFR1.2: Stack Integration**
- Integration time scales linearly with task count
- Bulk operations preferred over sequential API calls
- Event emission overhead < 5ms per event

**NFR1.3: Validation Overhead**
- Zod schema validation adds < 5ms per MCP tool call
- Schemas compiled once and reused
- No unnecessary re-validation in hot paths

#### NFR2: Code Quality

**NFR2.1: Type Safety**
- All public functions have explicit return types
- No `any` types in production code
- Strict TypeScript with no warnings
- All Zod schemas follow single source of truth pattern

**NFR2.2: Test Coverage**
- Unit tests: >90% coverage for new VCS strategies and MCP tools
- Integration tests: All VCS modes tested with real git operations
- E2E tests: Full phase execution tested per VCS mode
- Test infrastructure: Use setupGitTest for all VCS tests

**NFR2.3: Code Standards**
- Follow ts-pattern for complex conditionals (exhaustive matching)
- Use type guards from @/validation/guards (no inline checks)
- Named exports only (no default exports)
- Import organization: node: → external → internal (@/)

#### NFR3: Error Quality

**NFR3.1: Error Message Standards**
- Every error must include: What failed, why it failed, how to fix it
- Include contextual information: task ID, file paths, branch names, commit hashes
- Provide exact commands to resolve issue (copy-pasteable)
- Use progressive disclosure: summary first, details on request
- Format errors for both humans (Claude) and automation

**NFR3.2: Error Context Requirements**
- VCS errors: Include working directory, current branch, operation attempted
- Worktree errors: Include task ID, worktree path, branch name, collision details
- Tool unavailability: Include binary name, search paths checked, installation commands
- Conflict errors: Include conflicting files list, branch names involved, resolution steps
- Integration errors: Include task IDs involved, dependency chain, what succeeded/failed

**NFR3.3: Actionable Guidance**
- Every error must provide at least one concrete next step
- Link to relevant documentation when available
- Suggest alternatives when primary action fails
- Include examples of successful resolution
- Provide debug commands for investigation

**NFR3.4: Error Examples**
All error messages must follow this pattern:
```
❌ {What Failed}

Context:
- {Relevant contextual information}
- {More context}

Cause:
{Why it failed - specific reason}

Resolution:
1. {Exact command or action}
2. {Alternative if step 1 doesn't work}
3. {How to get more help}

Debug:
{Optional: commands to investigate further}
```

#### NFR4: Documentation

**NFR4.1: Specification Completeness**
- All VCS backends documented with capabilities matrix
- MCP tools documented with parameter schemas and examples
- Slash command integration documented with flow diagrams
- Error messages documented with resolution steps

**NFR4.2: Code Documentation**
- All Zod schemas have TSDoc comments with examples
- All MCP tools have clear descriptions for MCP clients
- All VCS strategies document supported operations
- CLAUDE.md updated with new architecture patterns

**NFR3.3: Migration Guide**
- Clear steps for upgrading to MCP-enabled execution
- VCS mode configuration instructions with explicit vs auto-detect behavior
- Troubleshooting guide for common issues
- Examples for each VCS mode
- Document explicit mode failures (no silent fallbacks)

#### NFR4: Maintainability

**NFR4.1: Single Source of Truth**
- Zod schemas define all types (infer TypeScript types)
- VCS strategies follow consistent lifecycle pattern
- MCP tools follow thin adapter pattern (no business logic)
- Domain services remain unchanged (95% reuse)

**NFR4.2: Extensibility**
- Easy to add new VCS backends (follow existing pattern)
- Easy to add new MCP tools (registration function pattern)
- Easy to add new strategies (implement VcsStrategy interface)
- Clear extension points documented

**NFR4.3: Testing Strategy**
- Co-located tests in __tests__ directories
- Separate unit (.test.ts) and integration (.integration.test.ts)
- Use GitTestEnvironment for all VCS tests
- No test pollution (automatic cleanup)

#### NFR5: Code Isolation

**NFR5.1: Component Separation**
- Clearly separate reusable VCS components from deprecated CLI/TUI code
- VCS domain services (WorktreeService, CommitService, etc.) remain in src/services/vcs/
- New MCP tools isolated in src/entry/mcp/tools/
- No dependencies from new code to deprecated CLI entry points

**NFR5.2: Deprecation Strategy**
- Mark deprecated code paths with clear comments
- Document which components are deprecated vs reusable
- Plan for future removal (Phase 6+)
- No new features in deprecated CLI infrastructure

## Design

### Key Design Decisions

**1. Explicit vs Default VCS Mode**

The system supports two configuration approaches:

**Explicit Mode** (user configured):
- User sets `vcs.mode` in `~/.chopstack/config.yaml` or via CLI flag
- Tool MUST be available - no fallback
- Error immediately with installation instructions if tool missing
- Respects user intent - if they want git-spice, they get git-spice or an error

**Default Mode** (no configuration):
- No explicit mode configured
- Use merge-commit (requires only git)
- Always succeeds (git is always available)
- User can configure explicit mode for stacking workflows

**Rationale**: Simplifies configuration - merge-commit works everywhere git works. Users who want stacking (git-spice, graphite) must explicitly configure it, ensuring they understand the behavior change.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Layered Architecture                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 1: Orchestration (Slash Commands)          │  │
│  │                                                      │  │
│  │  - /execute-phase: Task sequencing, validation     │  │
│  │  - /build-plan: Plan generation from spec          │  │
│  │  - Agent spawning with worktree-aware prompts      │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │ (calls MCP tools)                      │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 2: MCP Server (VCS Primitives)             │  │
│  │                                                      │  │
│  │  - configure_vcs: VCS mode detection/config        │  │
│  │  - create_task_worktree: Worktree lifecycle        │  │
│  │  - integrate_task_stack: Stack building            │  │
│  │  - cleanup_task_worktree: Cleanup operations       │  │
│  │  - list_task_worktrees: Status queries             │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │ (delegates to)                         │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 3: VCS Orchestrator (Facade)                │  │
│  │                                                      │  │
│  │  - VcsStrategyFactory: Create mode-specific strategy│  │
│  │  - VcsConfigService: Load configuration            │  │
│  │  - Thin facade over domain services                 │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │ (creates strategies)                   │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 4: VCS Strategies (Strategy Pattern)        │  │
│  │                                                      │  │
│  │  - GitSpiceStrategy: git-spice stacking (existing) │  │
│  │  - MergeCommitStrategy: Simple merge workflow      │  │
│  │  - GraphiteStrategy: Graphite stacking             │  │
│  │  - SaplingStrategy: Sapling (placeholder)          │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │ (uses services)                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 5: Domain Services (Reused 95%)             │  │
│  │                                                      │  │
│  │  - WorktreeService: Worktree lifecycle (reuse)     │  │
│  │  - StackBuildService: Stack creation (adapt)       │  │
│  │  - CommitService: Commit operations (reuse)        │  │
│  │  - RepositoryService: Repository queries (reuse)   │  │
│  └─────────────────┬────────────────────────────────────┘  │
│                    │ (uses adapters)                        │
│                    ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Layer 6: VCS Adapters (CLI Wrappers)              │  │
│  │                                                      │  │
│  │  - GitWrapper: simple-git abstraction (reuse)      │  │
│  │  - GitSpiceBackend: gs CLI wrapper (reuse)         │  │
│  │  - GraphiteBackend: gt CLI wrapper (new)           │  │
│  │  - SaplingBackend: sl CLI wrapper (future)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component Specifications

#### 1. VCS Strategy Interface (`src/core/vcs/vcs-strategy.ts`)

**Purpose**: Define contract for VCS mode implementations

**Enhanced Interface**:

```typescript
import type { TaskV2, ExecutionTask } from '@/types/schemas-v2';

export type VcsMode = 'git-spice' | 'merge-commit' | 'graphite' | 'sapling';

export type VcsStrategy = {
  readonly name: VcsMode;

  // Lifecycle hooks (existing pattern)
  initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void>;
  prepareExecution(tasks: ExecutionTask[], context: VcsStrategyContext): Promise<Map<string, WorktreeContext>>;
  handleTaskCompletion(task: TaskV2, executionTask: ExecutionTask, context: WorktreeContext): Promise<TaskCommitResult>;
  finalize(results: TaskCommitResult[], context: VcsStrategyContext): Promise<{ branches: string[]; commits: string[] }>;
  cleanup(): Promise<void>;

  // New capability queries
  supportsParallelExecution(): boolean;
  requiresWorktrees(): boolean;
  supportsStacking(): boolean;
};

export type VcsStrategyContext = {
  cwd: string;
  baseRef?: string;
  backend: VcsBackend;
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

**Changes from Current**:
- Consolidated preparation hooks (removed duplication)
- Added `backend: VcsBackend` to context (explicit backend selection)
- Added capability queries for strategy selection
- Removed validation config (separate concern)

#### 2. Enhanced VcsBackend Interface (`src/core/vcs/interfaces.ts`)

**Purpose**: Abstract VCS tool operations (CLI wrappers)

**Enhanced Interface**:

```typescript
export type VcsBackend = {
  // Detection & Setup
  isAvailable(): Promise<boolean>;
  initialize(workdir: string, trunk?: string): Promise<void>;

  // Branch Operations (generalized)
  createBranch(branchName: string, options: {
    parent?: string;      // For stacking backends
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

  // Submission (generalized)
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

**Changes from Current**:
- Generalized branch operations (not stack-specific)
- Optional stack operations (trackBranch?, restack?, getStackInfo?)
- Added conflict resolution primitives
- Submit method generalized for multiple backends

#### 3. MergeCommitBackend (`src/adapters/vcs/merge-commit/backend.ts` - NEW)

**Purpose**: Simple merge workflow without parent tracking

**Implementation Pattern**:

```typescript
import type { VcsBackend } from '@/core/vcs/interfaces';
import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';

export class MergeCommitBackend implements VcsBackend {
  private git: GitWrapper;

  constructor(workdir: string) {
    this.git = new GitWrapper(workdir);
  }

  async isAvailable(): Promise<boolean> {
    // Only needs git (no special tools)
    try {
      await this.git.git.version();
      return true;
    } catch {
      return false;
    }
  }

  async initialize(workdir: string, trunk?: string): Promise<void> {
    logger.debug('MergeCommitBackend initialized', { workdir, trunk });
    // No special initialization needed
  }

  async createBranch(branchName: string, options: {
    parent?: string;
    base?: string;
    track?: boolean;
  }): Promise<void> {
    const baseRef = options.base || options.parent || 'HEAD';

    // Create branch from merge-base (no parent tracking)
    await this.git.git.checkoutBranch(branchName, baseRef);

    logger.info(`Created branch ${branchName} from ${baseRef}`);
  }

  async commit(message: string, options: {
    files?: string[];
    allowEmpty?: boolean;
  }): Promise<string> {
    // Standard git commit
    if (options.files) {
      await this.git.git.add(options.files);
    } else {
      await this.git.git.add('.');
    }

    const result = await this.git.git.commit(message,
      options.allowEmpty ? ['--allow-empty'] : undefined
    );

    return result.commit;
  }

  async submit(options: {
    branches: string[];
    draft?: boolean;
    autoMerge?: boolean;
  }): Promise<string[]> {
    // Use GitHub/GitLab API for PR creation
    // Simplified: Just merge locally for now
    logger.warn('PR creation not implemented for merge-commit mode');
    return [];
  }

  async hasConflicts(): Promise<boolean> {
    const status = await this.git.git.status();
    return status.conflicted.length > 0;
  }

  async getConflictedFiles(): Promise<string[]> {
    const status = await this.git.git.status();
    return status.conflicted;
  }

  async abortMerge(): Promise<void> {
    await this.git.git.merge(['--abort']);
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.git.git.deleteLocalBranch(branchName);
  }
}
```

**Complexity**: M (300-400 lines, 3-5 days)
**Reusability**: 40% from git-spice (CLI wrapper pattern, error handling)

#### 4. GraphiteBackend (`src/adapters/vcs/graphite/backend.ts` - NEW)

**Purpose**: Placeholder for future Graphite stacking support

**Implementation Pattern**:

```typescript
import type { VcsBackend } from '@/core/vcs/interfaces';
import { logger } from '@/utils/global-logger';

/**
 * Graphite backend stub - to be implemented in future iteration
 *
 * Implementation notes:
 * - Use gt CLI via execa (similar to GitSpiceBackend pattern)
 * - Commands: gt branch create, gt commit create, gt restack, gt stack submit
 * - Estimated complexity: M (600-800 lines, 4-6 days)
 * - Reusability: 70% from git-spice patterns
 *
 * See: https://graphite.dev/docs/graphite-cli
 */
export class GraphiteBackend implements VcsBackend {
  constructor(private workdir: string) {}

  async isAvailable(): Promise<boolean> {
    // TODO: Check for gt binary
    logger.warn('GraphiteBackend not yet implemented');
    return false;
  }

  async initialize(workdir: string, trunk?: string): Promise<void> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async createBranch(): Promise<void> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async deleteBranch(): Promise<void> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async commit(): Promise<string> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async submit(): Promise<string[]> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async hasConflicts(): Promise<boolean> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async getConflictedFiles(): Promise<string[]> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }

  async abortMerge(): Promise<void> {
    throw new Error('GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.');
  }
}
```

**Complexity**: XS (stub implementation, ~100 lines, 0.5-1 day)
**Future Implementation**: M (600-800 lines, 4-6 days) - separate spec recommended

#### 5. MCP VCS Tools (`src/entry/mcp/tools/vcs-tools.ts` - NEW)

**Purpose**: Expose VCS operations through MCP

**Tool Registration Pattern**:

```typescript
import type { FastMCP } from 'fastmcp';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import {
  ConfigureVcsSchema,
  CreateWorktreeSchema,
  IntegrateStackSchema,
  CleanupWorktreeSchema,
  ListWorktreesSchema,
} from '../schemas/vcs-schemas';

export function registerVcsTools(
  mcp: FastMCP,
  vcsEngine: VcsEngineService
): void {
  // Tool 1: Configure VCS mode
  mcp.addTool({
    name: 'configure_vcs',
    description: 'Configure VCS mode and verify tool availability',
    parameters: ConfigureVcsSchema,
    execute: async (params) => {
      try {
        // Use explicit mode or default to merge-commit
        const mode = params.mode ?? 'merge-commit';
        const explicitMode = params.mode !== undefined;

        // Create and verify backend
        const backend = await createBackend(mode, params.workdir);
        const available = await backend.isAvailable();

        if (!available) {
          // If explicit mode requested, fail immediately
          if (explicitMode) {
            return JSON.stringify({
              status: 'failed',
              mode,
              available: false,
              error: `VCS tool for mode '${mode}' not found. Install required tools or change configuration.`,
            });
          }

          // Default mode (merge-commit) should always be available
          return JSON.stringify({
            status: 'failed',
            error: 'Git not found. Please install git to use chopstack.',
          });
        }

        // Initialize backend
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

  // Tool 2: Create task worktree
  mcp.addTool({
    name: 'create_task_worktree',
    description: 'Create isolated worktree for task execution',
    parameters: CreateWorktreeSchema,
    execute: async (params) => {
      try {
        const worktree = await vcsEngine.createWorktreesForTasks(
          [{ id: params.taskId, ...params.task }],
          params.baseRef,
          params.workdir
        );

        return JSON.stringify({
          status: 'success',
          taskId: params.taskId,
          path: worktree[0].absolutePath,
          branch: worktree[0].branchName,
          baseRef: worktree[0].baseRef,
        });
      } catch (error) {
        return JSON.stringify({
          status: 'failed',
          taskId: params.taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  // Tool 3: Integrate task stack
  mcp.addTool({
    name: 'integrate_task_stack',
    description: 'Integrate completed task branches into stack',
    parameters: IntegrateStackSchema,
    execute: async (params) => {
      try {
        // Use strategy-specific integration
        const result = await vcsEngine.buildStackFromTasks(
          params.tasks,
          params.workdir,
          {
            parentRef: params.targetBranch,
            submitStack: params.submit,
          }
        );

        return JSON.stringify({
          status: 'success',
          branches: result.branches,
          conflicts: result.conflicts || [],
          prUrls: result.prUrls || [],
        });
      } catch (error) {
        return JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  // Tool 4: Cleanup task worktree
  mcp.addTool({
    name: 'cleanup_task_worktree',
    description: 'Remove worktree after task completion',
    parameters: CleanupWorktreeSchema,
    execute: async (params) => {
      try {
        await vcsEngine.cleanupWorktrees([params.taskId]);

        return JSON.stringify({
          status: 'success',
          taskId: params.taskId,
          cleaned: true,
        });
      } catch (error) {
        return JSON.stringify({
          status: 'failed',
          taskId: params.taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  // Tool 5: List task worktrees
  mcp.addTool({
    name: 'list_task_worktrees',
    description: 'List all active worktrees for repository',
    parameters: ListWorktreesSchema,
    execute: async (params) => {
      try {
        const worktrees = await vcsEngine.getActiveWorktrees();

        return JSON.stringify({
          status: 'success',
          worktrees: worktrees.map(w => ({
            taskId: w.taskId,
            path: w.absolutePath,
            branch: w.branchName,
            baseRef: w.baseRef,
            created: w.created,
          })),
        });
      } catch (error) {
        return JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });
}
```

**Complexity**: M (400-500 lines including schemas, 6-8 days)

#### 6. VCS Config Schemas (`src/entry/mcp/schemas/vcs-schemas.ts` - NEW)

**Purpose**: Zod schemas for MCP tool parameters with comprehensive validation

```typescript
import { z } from 'zod';

/**
 * VCS mode enumeration
 * - git-spice: Stacking workflow with gs CLI (requires binary)
 * - merge-commit: Simple merge workflow (requires only git)
 * - graphite: Graphite stacking workflow with gt CLI (stubbed)
 * - sapling: Sapling workflow with sl CLI (stubbed)
 */
export const VcsModeEnum = z.enum(['git-spice', 'merge-commit', 'graphite', 'sapling']);

/**
 * Schema for configure_vcs tool
 *
 * Validates VCS mode configuration and initializes backend
 *
 * Example (explicit mode):
 * {
 *   "mode": "git-spice",
 *   "workdir": "/Users/dev/project"
 * }
 *
 * Example (default mode):
 * {
 *   "workdir": "/Users/dev/project"
 * }
 */
export const ConfigureVcsSchema = z.object({
  mode: VcsModeEnum.optional()
    .describe('VCS mode to use. If omitted, defaults to merge-commit (requires only git).'),
  workdir: z.string()
    .min(1, 'Working directory path cannot be empty')
    .describe('Absolute path to working directory (repository root)'),
  trunk: z.string().optional()
    .describe('Main branch name (default: main). Used as base for stack building.'),
}).strict();

/**
 * Schema for configure_vcs tool response
 *
 * Example success response:
 * {
 *   "status": "success",
 *   "mode": "git-spice",
 *   "available": true,
 *   "capabilities": {
 *     "supportsStacking": true,
 *     "supportsParallel": true
 *   }
 * }
 *
 * Example failure response:
 * {
 *   "status": "failed",
 *   "mode": "git-spice",
 *   "available": false,
 *   "error": "VCS tool 'gs' not found. Install git-spice: brew install abhinav/git-spice/git-spice"
 * }
 */
export const ConfigureVcsResponseSchema = z.object({
  status: z.enum(['success', 'failed']),
  mode: VcsModeEnum.optional(),
  available: z.boolean().optional(),
  capabilities: z.object({
    supportsStacking: z.boolean(),
    supportsParallel: z.boolean(),
  }).optional(),
  error: z.string().optional(),
});

/**
 * Schema for create_task_worktree tool
 *
 * Creates isolated worktree for task execution with unique branch
 *
 * Example:
 * {
 *   "taskId": "task-1-implement-auth",
 *   "baseRef": "main",
 *   "workdir": "/Users/dev/project",
 *   "task": {
 *     "name": "Implement authentication",
 *     "files": ["src/auth/login.ts", "src/auth/session.ts"]
 *   }
 * }
 */
export const CreateWorktreeSchema = z.object({
  taskId: z.string()
    .min(1, 'Task ID cannot be empty')
    .regex(/^[a-z0-9-]+$/, 'Task ID must be lowercase alphanumeric with hyphens')
    .describe('Unique task identifier (used in branch name)'),
  baseRef: z.string()
    .min(1, 'Base reference cannot be empty')
    .describe('Git reference to branch from (e.g., main, HEAD, feature-branch)'),
  workdir: z.string().optional()
    .describe('Working directory path (defaults to current directory)'),
  task: z.object({
    name: z.string().describe('Human-readable task name'),
    files: z.array(z.string()).optional().describe('List of files modified by task'),
  }).optional().describe('Optional task metadata for context'),
}).strict();

/**
 * Schema for create_task_worktree tool response
 *
 * Example success response:
 * {
 *   "status": "success",
 *   "taskId": "task-1-implement-auth",
 *   "path": ".chopstack/shadows/task-1-implement-auth",
 *   "absolutePath": "/Users/dev/project/.chopstack/shadows/task-1-implement-auth",
 *   "branch": "task/task-1-implement-auth",
 *   "baseRef": "main"
 * }
 *
 * Example failure response:
 * {
 *   "status": "failed",
 *   "taskId": "task-1-implement-auth",
 *   "error": "Branch 'task/task-1-implement-auth' already exists. Clean up with: git worktree remove .chopstack/shadows/task-1-implement-auth"
 * }
 */
export const CreateWorktreeResponseSchema = z.object({
  status: z.enum(['success', 'failed']),
  taskId: z.string(),
  path: z.string().optional().describe('Relative worktree path'),
  absolutePath: z.string().optional().describe('Absolute worktree path'),
  branch: z.string().optional().describe('Created branch name'),
  baseRef: z.string().optional().describe('Base git reference'),
  error: z.string().optional(),
});

/**
 * Schema for integrate_task_stack tool
 *
 * Integrates completed task branches into stack based on VCS mode
 *
 * Example (sequential stack):
 * {
 *   "tasks": [
 *     {"id": "task-1", "name": "Setup types", "branchName": "task/task-1"}
 *   ],
 *   "targetBranch": "main",
 *   "submit": false,
 *   "workdir": "/Users/dev/project"
 * }
 *
 * Example (parallel stack):
 * {
 *   "tasks": [
 *     {"id": "task-2a", "name": "Component A", "branchName": "task/task-2a"},
 *     {"id": "task-2b", "name": "Component B", "branchName": "task/task-2b"}
 *   ],
 *   "targetBranch": "main",
 *   "submit": true,
 *   "workdir": "/Users/dev/project"
 * }
 */
export const IntegrateStackSchema = z.object({
  tasks: z.array(z.object({
    id: z.string()
      .min(1, 'Task ID cannot be empty')
      .describe('Task identifier'),
    name: z.string()
      .min(1, 'Task name cannot be empty')
      .describe('Human-readable task name'),
    branchName: z.string().optional()
      .describe('Branch name (auto-derived from task ID if omitted)'),
  }))
    .min(1, 'Must integrate at least one task')
    .describe('Completed tasks to integrate into stack'),
  targetBranch: z.string()
    .min(1, 'Target branch cannot be empty')
    .describe('Target branch for integration (usually main or trunk)'),
  submit: z.boolean().optional().default(false)
    .describe('Submit stack for review (create PRs). Default: false'),
  workdir: z.string().optional()
    .describe('Working directory path (defaults to current directory)'),
}).strict();

/**
 * Schema for integrate_task_stack tool response
 *
 * Example success response (no conflicts):
 * {
 *   "status": "success",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [],
 *   "prUrls": []
 * }
 *
 * Example success response (with PRs):
 * {
 *   "status": "success",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [],
 *   "prUrls": ["https://github.com/org/repo/pull/123", "https://github.com/org/repo/pull/124"]
 * }
 *
 * Example failure response (conflicts):
 * {
 *   "status": "failed",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [
 *     {
 *       "taskId": "task-2",
 *       "files": ["src/auth/login.ts", "src/auth/session.ts"],
 *       "resolution": "Fix conflicts in worktree .chopstack/shadows/task-2, then retry"
 *     }
 *   ],
 *   "error": "Integration failed due to merge conflicts in 1 task(s)"
 * }
 */
export const IntegrateStackResponseSchema = z.object({
  status: z.enum(['success', 'failed']),
  branches: z.array(z.string()).describe('Integrated branch names'),
  conflicts: z.array(z.object({
    taskId: z.string(),
    files: z.array(z.string()),
    resolution: z.string(),
  })).optional().describe('Merge conflicts detected'),
  prUrls: z.array(z.string()).optional().describe('Created PR URLs (if submit=true)'),
  error: z.string().optional(),
});

/**
 * Schema for cleanup_task_worktree tool
 *
 * Removes worktree from filesystem and optionally deletes branch
 *
 * Example (delete worktree and branch):
 * {
 *   "taskId": "task-1-implement-auth",
 *   "keepBranch": false,
 *   "workdir": "/Users/dev/project"
 * }
 *
 * Example (delete worktree, keep branch):
 * {
 *   "taskId": "task-1-implement-auth",
 *   "keepBranch": true,
 *   "workdir": "/Users/dev/project"
 * }
 */
export const CleanupWorktreeSchema = z.object({
  taskId: z.string()
    .min(1, 'Task ID cannot be empty')
    .describe('Task ID to cleanup (matches create_task_worktree taskId)'),
  keepBranch: z.boolean().optional().default(false)
    .describe('Preserve branch after cleanup (useful for git-spice stacks). Default: false'),
  workdir: z.string().optional()
    .describe('Working directory path (defaults to current directory)'),
}).strict();

/**
 * Schema for cleanup_task_worktree tool response
 *
 * Example success response:
 * {
 *   "status": "success",
 *   "taskId": "task-1-implement-auth",
 *   "cleaned": true,
 *   "branchDeleted": true
 * }
 *
 * Example failure response:
 * {
 *   "status": "failed",
 *   "taskId": "task-1-implement-auth",
 *   "cleaned": false,
 *   "error": "Worktree not found: .chopstack/shadows/task-1-implement-auth"
 * }
 */
export const CleanupWorktreeResponseSchema = z.object({
  status: z.enum(['success', 'failed']),
  taskId: z.string(),
  cleaned: z.boolean(),
  branchDeleted: z.boolean().optional(),
  error: z.string().optional(),
});

/**
 * Schema for list_task_worktrees tool
 *
 * Lists all active chopstack worktrees for repository
 *
 * Example:
 * {
 *   "workdir": "/Users/dev/project",
 *   "includeOrphaned": true
 * }
 */
export const ListWorktreesSchema = z.object({
  workdir: z.string().optional()
    .describe('Working directory path (defaults to current directory)'),
  includeOrphaned: z.boolean().optional().default(false)
    .describe('Include orphaned worktrees from crashed runs. Default: false'),
}).strict();

/**
 * Schema for list_task_worktrees tool response
 *
 * Example response:
 * {
 *   "status": "success",
 *   "worktrees": [
 *     {
 *       "taskId": "task-1-implement-auth",
 *       "path": ".chopstack/shadows/task-1-implement-auth",
 *       "absolutePath": "/Users/dev/project/.chopstack/shadows/task-1-implement-auth",
 *       "branch": "task/task-1-implement-auth",
 *       "baseRef": "main",
 *       "created": "2025-10-16T10:30:00Z",
 *       "status": "active"
 *     }
 *   ]
 * }
 */
export const ListWorktreesResponseSchema = z.object({
  status: z.enum(['success', 'failed']),
  worktrees: z.array(z.object({
    taskId: z.string(),
    path: z.string().describe('Relative worktree path'),
    absolutePath: z.string().describe('Absolute worktree path'),
    branch: z.string(),
    baseRef: z.string(),
    created: z.string().describe('ISO 8601 timestamp'),
    status: z.enum(['active', 'orphaned']).optional(),
  })).optional(),
  error: z.string().optional(),
});

/**
 * Type inference helpers
 *
 * Usage:
 * ```typescript
 * import type { ConfigureVcsParams, CreateWorktreeResponse } from './vcs-schemas';
 *
 * function configureCli(params: ConfigureVcsParams) { ... }
 * ```
 */
export type ConfigureVcsParams = z.infer<typeof ConfigureVcsSchema>;
export type ConfigureVcsResponse = z.infer<typeof ConfigureVcsResponseSchema>;

export type CreateWorktreeParams = z.infer<typeof CreateWorktreeSchema>;
export type CreateWorktreeResponse = z.infer<typeof CreateWorktreeResponseSchema>;

export type IntegrateStackParams = z.infer<typeof IntegrateStackSchema>;
export type IntegrateStackResponse = z.infer<typeof IntegrateStackResponseSchema>;

export type CleanupWorktreeParams = z.infer<typeof CleanupWorktreeSchema>;
export type CleanupWorktreeResponse = z.infer<typeof CleanupWorktreeResponseSchema>;

export type ListWorktreesParams = z.infer<typeof ListWorktreesSchema>;
export type ListWorktreesResponse = z.infer<typeof ListWorktreesResponseSchema>;
```

#### 7. VCS Config Service (`src/services/vcs/vcs-config.ts` - NEW)

**Purpose**: VCS mode configuration and validation

**Interface**:

```typescript
import type { VcsMode } from '@/core/vcs/vcs-strategy';
import type { VcsBackend } from '@/core/vcs/interfaces';

/**
 * Configuration for VCS mode
 */
export type VcsConfig = {
  mode?: VcsMode;
  workdir: string;
  trunk?: string;
  worktreePath?: string;
  branchPrefix?: string;
  autoRestack?: boolean;
  submitOnComplete?: boolean;
};

/**
 * VCS configuration service
 *
 * Responsibilities:
 * - Load configuration from file or environment
 * - Validate VCS mode against available tools
 * - Create appropriate VCS backend instance
 * - Provide configuration to MCP tools and slash commands
 */
export type VcsConfigService = {
  /**
   * Load configuration from file and environment
   * Priority: CLI args > config file > defaults
   */
  loadConfig(workdir: string, cliMode?: VcsMode): Promise<VcsConfig>;

  /**
   * Validate VCS mode is available
   * @param mode - VCS mode to validate
   * @param explicitMode - Whether mode was explicitly configured
   * @throws Error if explicit mode unavailable
   * @returns mode - Original mode or fallback if auto-detected
   */
  validateMode(mode: VcsMode, explicitMode: boolean): Promise<VcsMode>;

  /**
   * Create VCS backend for mode
   */
  createBackend(mode: VcsMode, workdir: string): Promise<VcsBackend>;

  /**
   * Get current configuration
   */
  getConfig(): VcsConfig | null;
};
```

**Implementation Pattern**:

```typescript
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import YAML from 'yaml';
import { match } from 'ts-pattern';
import type { VcsMode } from '@/core/vcs/vcs-strategy';
import type { VcsBackend } from '@/core/vcs/interfaces';
import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { MergeCommitBackend } from '@/adapters/vcs/merge-commit/backend';
import { GraphiteBackend } from '@/adapters/vcs/graphite/backend';
import { SaplingBackend } from '@/adapters/vcs/sapling/backend';
import { logger } from '@/utils/global-logger';

export class VcsConfigServiceImpl implements VcsConfigService {
  private config: VcsConfig | null = null;
  private readonly configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.chopstack', 'config.yaml');
  }

  async loadConfig(workdir: string, cliMode?: VcsMode): Promise<VcsConfig> {
    // 1. Load from config file
    const fileConfig = await this._loadConfigFile();

    // 2. Build config with priority: CLI > file > defaults
    this.config = {
      mode: cliMode ?? fileConfig?.vcs?.mode,
      workdir,
      trunk: fileConfig?.vcs?.trunk ?? 'main',
      worktreePath: fileConfig?.vcs?.worktree_path ?? '.chopstack/shadows',
      branchPrefix: fileConfig?.vcs?.branch_prefix ?? 'task',
      autoRestack: fileConfig?.vcs?.auto_restack ?? true,
      submitOnComplete: fileConfig?.vcs?.submit_on_complete ?? false,
    };

    logger.debug('VCS config loaded', { config: this.config });
    return this.config;
  }

  async validateMode(mode: VcsMode, explicitMode: boolean): Promise<VcsMode> {
    // Check if mode is available
    const backend = await this.createBackend(mode, this.config?.workdir ?? process.cwd());
    const available = await backend.isAvailable();

    if (!available) {
      if (explicitMode) {
        // Explicit mode MUST be available
        throw new Error(
          `VCS mode '${mode}' is not available. ` +
          `Install required tools or change configuration. ` +
          this._getInstallInstructions(mode)
        );
      }

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

  getConfig(): VcsConfig | null {
    return this.config;
  }

  private async _loadConfigFile(): Promise<unknown | null> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return YAML.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('No config file found, using defaults');
        return null;
      }
      throw error;
    }
  }

  private _getInstallInstructions(mode: VcsMode): string {
    return match(mode)
      .with('git-spice', () =>
        '\n\nInstall git-spice:\n' +
        '  brew install abhinav/git-spice/git-spice\n' +
        '  # or\n' +
        '  go install go.abhg.dev/gs@latest'
      )
      .with('graphite', () =>
        '\n\nInstall graphite CLI:\n' +
        '  npm install -g @withgraphite/graphite-cli'
      )
      .with('sapling', () =>
        '\n\nInstall sapling:\n' +
        '  See https://sapling-scm.com/docs/introduction/getting-started'
      )
      .with('merge-commit', () => '')
      .exhaustive();
  }
}
```

**Usage in MCP Tools**:

```typescript
// In configure_vcs tool
const configService = new VcsConfigServiceImpl();
const config = await configService.loadConfig(params.workdir, params.mode);

// Validate mode (explicit if params.mode was provided)
const validatedMode = await configService.validateMode(
  config.mode ?? 'merge-commit',
  params.mode !== undefined
);

// Create backend
const backend = await configService.createBackend(validatedMode, params.workdir);
await backend.initialize(params.workdir, config.trunk);
```

**Complexity**: S (200-300 lines, 1-2 days)
**Reusability**: Patterns from existing config loading in codebase

#### 8. Slash Command Integration (`.claude/commands/execute-phase.md`)

**MCP-Required Flow**:

```markdown
## Step 0: Initialize MCP VCS

1. Verify chopstack MCP server is available:
   - Check if configure_vcs tool exists
   - Check if create_task_worktree tool exists
   - If NOT available: Fail with error message and installation instructions

2. Configure VCS mode:
   - Check config file (~/.chopstack/config.yaml) for explicit mode
   - If mode specified: Call configure_vcs(mode), fail if unavailable
   - If mode NOT specified: Default to merge-commit (requires only git)
   - Call: configure_vcs(mode) to verify tool installed
   - Store VCS mode for agent prompts

**Error Behavior**:
- Explicit mode (user configured): Fail with installation instructions
- Default mode (merge-commit): Fail only if git itself is missing

## Step 3: Execute Tasks

### For Sequential Phases (strategy: sequential)

1. Initialize: `current_branch = main` (or current branch)

2. For each task in phase.tasks:

   a. **Create Worktree**:
      - Call: create_task_worktree(task-id, current_branch)
      - Receive: { path, branch, baseRef }

   b. **Spawn Agent** with modified prompt:
      ```
      WORKTREE SETUP:
      1. Change to worktree: cd {worktree_path}
      2. You are on branch: {branch_name}

      [... task instructions ...]

      Step 4: Commit with VCS
      1. Stage changes: `git add --all`
      2. Commit: {vcs_commit_command}
         - git-spice: `pnpm commit`
         - merge-commit: `git commit -m "[{task-id}] ..."`
         - graphite: `gt commit -m "[{task-id}] ..."`
      ```

   c. **Wait for Completion**

   d. **Integrate Stack**:
      - Call: integrate_task_stack([task-id], current_branch)

   e. **Cleanup**:
      - Call: cleanup_task_worktree(task-id)

   f. **Update Base**:
      - For git-spice: current_branch = task-id branch
      - For merge-commit: current_branch = main

3. Result: Sequential stack (main → task-1 → task-2)

### For Parallel Phases (strategy: parallel)

1. **Create All Worktrees**:
   - For each task: create_task_worktree(task-id, current_branch)
   - Store: worktree_map[task-id] = { path, branch, baseRef }

2. **Spawn ALL Agents Concurrently**:
   - Each gets worktree-specific prompt

3. **Wait for All Completions**

4. **Integrate Stack**:
   - Call: integrate_task_stack([task-a, task-b, task-c], main)
   - Handle conflicts if reported

5. **Cleanup All**:
   - For each: cleanup_task_worktree(task-id, keep_branch)

6. Result: Parallel stack (main → [task-a, task-b, task-c])
```

### File Structure

**New Files**:

```
src/
├── adapters/
│   └── vcs/
│       ├── merge-commit/
│       │   ├── backend.ts                          # NEW: Merge-commit backend
│       │   ├── __tests__/
│       │   │   ├── backend.test.ts                 # NEW: Unit tests
│       │   │   └── backend.integration.test.ts     # NEW: Integration tests
│       ├── graphite/
│       │   ├── backend.ts                          # NEW: Graphite backend
│       │   ├── __tests__/
│       │   │   ├── backend.test.ts                 # NEW: Unit tests
│       │   │   └── backend.integration.test.ts     # NEW: Integration tests
│       └── sapling/
│           └── backend.ts                          # NEW: Sapling stub
├── entry/
│   └── mcp/
│       ├── tools/
│       │   ├── vcs-tools.ts                        # NEW: VCS MCP tools
│       │   └── __tests__/
│       │       ├── vcs-tools.test.ts               # NEW: Unit tests
│       │       └── vcs-tools.integration.test.ts   # NEW: Integration tests
│       └── schemas/
│           └── vcs-schemas.ts                      # NEW: VCS parameter schemas
├── services/
│   └── vcs/
│       └── vcs-config.ts                           # NEW: VCS config service
└── core/
    └── vcs/
        └── vcs-strategy.ts                         # MODIFIED: Enhanced interface

test/
└── e2e/
    └── vcs-modes/
        ├── git-spice-workflow.test.ts              # NEW: E2E git-spice
        ├── merge-commit-workflow.test.ts           # NEW: E2E merge-commit
        └── graphite-workflow.test.ts               # NEW: E2E graphite
```

**Modified Files**:

- `src/entry/mcp/server.ts` - Register VCS tools, remove GitWorkflowManager
- `src/core/vcs/interfaces.ts` - Enhanced VcsBackend interface
- `src/core/vcs/vcs-strategy.ts` - Enhanced VcsStrategy interface
- `src/services/vcs/strategies/vcs-strategy-factory.ts` - Add new strategy cases
- `.claude/commands/execute-phase.md` - Enhanced execution flow

## Implementation Plan

### Phase 1: VCS Backend Abstraction (Week 1)

**Task 1-1: Enhanced VCS Interfaces** (S - 1-2 days)
- Modify `src/core/vcs/interfaces.ts` - Enhanced VcsBackend
- Modify `src/core/vcs/vcs-strategy.ts` - Enhanced VcsStrategy
- Add capability queries (supportsParallelExecution, etc.)
- Update existing strategies to implement new interface
- **Deliverable**: Enhanced interfaces, all tests pass

**Task 1-2: Merge-Commit Backend** (M - 3-5 days)
- Create `src/adapters/vcs/merge-commit/backend.ts`
- Implement all VcsBackend methods
- Write unit tests (>90% coverage)
- Write integration tests with real git operations
- **Deliverable**: Working merge-commit backend

**Task 1-3: Backend Stubs (Graphite, Sapling)** (XS - 0.5-1 day)
- Create `src/adapters/vcs/graphite/backend.ts` (stub)
- Create `src/adapters/vcs/sapling/backend.ts` (stub)
- Stub all methods with "not implemented" errors
- Document future implementation approach
- Add TODO comments with complexity estimates
- **Deliverable**: Graphite and Sapling placeholders

**Task 1-4: VCS Config Service** (S - 1-2 days)
- Create `src/services/vcs/vcs-config.ts`
- Implement auto-detection logic (binary checks, repo config)
- Support config file loading (~/.chopstack/config.yaml)
- Add validation with clear error messages
- Write unit tests
- **Deliverable**: VCS mode detection and configuration

### Phase 2: MCP Integration (Week 2)

**Task 2-1: VCS MCP Schemas** (S - 1 day)
- Create `src/entry/mcp/schemas/vcs-schemas.ts`
- Define 5 tool schemas with Zod
- Add TSDoc comments with examples
- Validate with schema tests
- **Deliverable**: VCS parameter schemas

**Task 2-2: VCS MCP Tools** (M - 2-3 days)
- Create `src/entry/mcp/tools/vcs-tools.ts`
- Implement registerVcsTools function
- Create 5 VCS tools (configure, create, integrate, cleanup, list)
- Follow thin adapter pattern (delegate to VcsEngine)
- Write unit tests with mocked VcsEngine
- **Deliverable**: VCS MCP tools

**Task 2-3: MCP Server Integration** (S - 1-2 days)
- Modify `src/entry/mcp/server.ts`
- Instantiate VcsEngineService
- Call registerVcsTools(mcp, vcsEngine)
- Remove GitWorkflowManager class
- Update existing tools to use vcsEngine
- **Deliverable**: MCP server with VCS tools

**Task 2-4: VCS Tool Integration Tests** (M - 2-3 days)
- Create `src/entry/mcp/tools/__tests__/vcs-tools.integration.test.ts`
- Test all tools with real VcsEngineService
- Use GitTestEnvironment for isolation
- Test implemented VCS modes (git-spice, merge-commit)
- Verify event emission
- **Deliverable**: Comprehensive integration tests

### Phase 3: Slash Command Integration (Week 3)

**Task 3-1: MCP Integration in Execute-Phase** (S - 2-3 hours)
- Modify `.claude/commands/execute-phase.md`
- Add Step 0: MCP verification (fail if unavailable)
- Add VCS mode configuration
- Add clear error message with installation instructions
- **Deliverable**: MCP-required execute-phase

**Task 3-2: Sequential Worktree Support** (M - 4-6 hours)
- Enhance sequential execution flow
- Add worktree creation before each task
- Modify agent prompt injection
- Add integration after each task
- Add cleanup logic
- **Deliverable**: Sequential with worktrees

**Task 3-3: Parallel Worktree Support** (M - 5-7 hours)
- Enhance parallel execution flow
- Add bulk worktree creation
- Modify all agent prompts
- Add bulk integration
- Add conflict handling
- **Deliverable**: Parallel with isolation

**Task 3-4: Error Handling** (S - 3-4 hours)
- Add worktree creation failure handling
- Add integration conflict handling
- Add cleanup failure handling
- Add MCP unavailability error with installation guide
- Improve error messages
- **Deliverable**: Robust error handling

### Phase 4: Testing & Documentation (Week 4)

**Task 4-1: E2E Tests** (M - 4-5 hours)
- Create `test/e2e/vcs-modes/` directory
- Test git-spice workflow end-to-end
- Test merge-commit workflow end-to-end
- Test error scenarios (worktree conflicts, VCS unavailable)
- **Deliverable**: E2E test coverage for implemented modes

**Task 4-2: Documentation** (M - 4-5 hours)
- Update CLAUDE.md with architecture patterns
- Add VCS mode configuration guide
- Document MCP tool usage
- Add troubleshooting section
- Create examples for each VCS mode
- **Deliverable**: Complete documentation

**Task 4-3: Performance Testing** (S - 2-3 hours)
- Benchmark worktree creation time
- Benchmark integration time
- Benchmark validation overhead
- Verify < 5ms per event emission
- **Deliverable**: Performance report

**Task 4-4: Code Review & Polish** (S - 2-3 hours)
- Run full test suite
- Check linting (pnpm run lint)
- Verify type safety (pnpm run type-check)
- Review error messages
- Final code cleanup
- **Deliverable**: Production-ready code

### Dependencies

**Sequential Dependencies**:
```
Phase 1 (VCS Backends) → Phase 2 (MCP Tools) → Phase 3 (Slash Commands) → Phase 4 (Testing)
```

**Within-Phase Parallelization**:
- **Phase 1**: Tasks 1-2, 1-3 can run in parallel after 1-1
- **Phase 2**: Tasks 2-1, 2-2 can run in parallel
- **Phase 3**: Tasks 3-2, 3-3 can run in parallel after 3-1
- **Phase 4**: Tasks 4-1, 4-2, 4-3 can run in parallel

### Estimated Complexity

**By Phase**:

| Phase | Tasks | Complexity | Effort | Critical Path |
|-------|-------|------------|--------|---------------|
| 1: VCS Backends | 4 | M | 6-10 days | 6-9 days |
| 2: MCP Tools | 4 | M | 6-9 days | 5-7 days |
| 3: Slash Commands | 4 | M | 14-19 hours | 12-16 hours |
| 4: Testing & Docs | 4 | M | 12-16 hours | 12-16 hours |
| **Total** | **16** | **M-L** | **19-28 days** | **17-24 days** |

**Note**: Critical path assumes one developer; parallelization can reduce wall-clock time by 30-40%. Graphite backend implementation deferred to separate spec (estimated M complexity, 4-6 additional days).

## Success Metrics

### Quantitative

**Functionality**:
- ✅ All 5 VCS MCP tools operational (configure, create, integrate, cleanup, list)
- ✅ 2 VCS backends fully implemented (git-spice, merge-commit)
- ✅ Graphite and Sapling backends stubbed with clear documentation
- ✅ Slash commands require and integrate seamlessly with MCP
- ✅ Existing VCS domain services (95%) successfully reused

**Performance**:
- ✅ Worktree creation < 2 seconds per task
- ✅ Validation overhead < 5ms per MCP call
- ✅ Event emission < 5ms per event
- ✅ No performance regression vs current execution

**Code Quality**:
- ✅ Test coverage >90% for new code (VCS backends, MCP tools)
- ✅ 0 ESLint violations
- ✅ 0 TypeScript warnings (strict mode)
- ✅ 0 `any` types in production code

**Documentation**:
- ✅ All Zod schemas have TSDoc comments
- ✅ All MCP tools have clear descriptions
- ✅ CLAUDE.md updated with patterns
- ✅ VCS mode configuration documented
- ✅ Troubleshooting guide created

### Qualitative

**Developer Experience**:
- Clear error messages guide resolution
- Auto-detection works for common setups
- Easy to add new VCS backends
- Testing is straightforward with helpers

**User Experience**:
- MCP integration is seamless (auto-detected VCS mode)
- Clear error messages with installation instructions when MCP unavailable
- Improved reliability (no file conflicts with worktree isolation)
- Consistent execution model across all tasks

**Maintainability**:
- Single source of truth for VCS operations
- Clean separation of concerns (orchestration vs primitives)
- Easy to extend with new VCS modes
- Comprehensive test coverage prevents regressions

**Extensibility**:
- New VCS backends follow clear pattern
- New MCP tools follow registration pattern
- Slash commands easily enhanced with new capabilities
- Clear extension points documented

## Risks & Mitigations

### Risk 1: Scope Creep with Additional Backends

**Likelihood**: Low
**Impact**: Medium (delays Phase 1)
**Mitigation**:
- Graphite stubbed in this iteration (separate spec recommended)
- Focus on git-spice and merge-commit as primary implementations
- Architecture supports future backends without rework
- Clear extension pattern documented for future implementations

### Risk 2: Test Pollution

**Likelihood**: Low
**Impact**: High (flaky tests, CI failures)
**Mitigation**:
- Use existing setupGitTest infrastructure (proven)
- Leverage TestResourceTracker for cleanup
- Run tests in isolated temp directories
- Add orphaned resource detection in CI

### Risk 3: MCP Tool Complexity Creep

**Likelihood**: Medium
**Impact**: Medium (maintenance burden)
**Mitigation**:
- Keep tools as thin wrappers (no business logic)
- Delegate all operations to VcsEngine
- Single responsibility per tool
- Comprehensive unit tests catch violations

### Risk 4: MCP Installation Friction

**Likelihood**: Medium
**Impact**: Low (one-time setup)
**Mitigation**:
- Clear installation instructions in error messages
- Simple MCP server installation (single command)
- Auto-detection of MCP server availability
- Helpful error messages with exact commands to run
- Document MCP setup in specification and user guides

### Risk 5: Performance Degradation

**Likelihood**: Low
**Impact**: Medium (slower execution)
**Mitigation**:
- Benchmark all VCS operations
- Use concurrent worktree creation for parallel
- Minimize validation overhead (cache schemas)
- Performance tests in CI

### Risk 6: Documentation Drift

**Likelihood**: Medium
**Impact**: Low (confusion, support burden)
**Mitigation**:
- TSDoc comments on all schemas
- Examples in integration tests
- Regular documentation reviews
- Troubleshooting guide with common issues

## Future Considerations

### Next Steps After Implementation

**Phase 5: Advanced Features** (Future)
- Full plan execution: `/execute-plan {project}` runs all phases automatically
- Conflict resolution UI: Interactive TUI for merge conflicts
- Remote worktrees: Support for distributed task execution
- VCS auto-switching: Detect changes to .git config and auto-reconfigure

**Phase 5.5: Agent Skills Integration** (Future - 1-2 weeks)

Extract VCS backend knowledge and execution patterns into Agent Skills for progressive disclosure and token efficiency:

**VCS Backend Skills**:
- `git-spice.skill/` with gs CLI patterns and stack workflows
- `merge-commit.skill/` with simple merge patterns
- `graphite.skill/` with gt CLI patterns (when implemented)
- Each Skill contains SKILL.md + reference files (only loaded when needed)

**Execution Pattern Skills**:
- `worktree-workflows.skill/` for setup, integration, cleanup patterns
- `task-patterns.skill/` for common implementation patterns (TypeScript backends, MCP tools, tests)
- `mcp-tool-patterns.skill/` for tool creation guidance with Zod schemas

**Spec Modularization**:
- Break 75KB spec.md into phase-specific Skill modules
- Create index SKILL.md with overview + selective loading
- Enable progressive disclosure (agents load only relevant sections)

**Slash Command Refactoring**:
- Replace inline prompt guidance with Skill references
- Reduce slash command size by 60-70%
- Agents discover context dynamically based on task type

**Benefits**:
- **Token efficiency**: Agents load only relevant VCS context (not entire spec)
- **Reusability**: Common patterns packaged as discoverable Skills
- **Maintainability**: Update VCS patterns in one place (Skill), not multiple prompts
- **Progressive disclosure**: 75KB spec chunked into loadable modules

**Prerequisites**:
- Validate Agent Skills support in Claude Code CLI
- VCS architecture (Phases 1-4) must be implemented first

**Estimated Complexity**: M (5-8 tasks, 1-2 weeks)

**Reference**: [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

**Phase 6: Extended Backend Support** (Future)
- **Graphite Backend Implementation** (M - 4-6 days, separate spec)
  * Full `gt` CLI wrapper following git-spice patterns
  * Stack creation, commit, restack, submit operations
  * Integration tests with real graphite installation
- Complete Sapling backend implementation (L - 8-12 days)
- Add support for Mercurial (if requested)
- GitHub/GitLab integration: Auto-create PRs from stacks
- Bitbucket support for enterprise users

### Technical Debt Prevention

**Code Organization**:
- Keep VCS backends in separate directories (clear boundaries)
- Co-locate tests with implementation
- Avoid premature abstraction (3 instances before abstracting)
- Regular refactoring as patterns emerge

**Testing Strategy**:
- Maintain test coverage >90% for new code
- Integration tests as living documentation
- Performance tests in CI
- E2E tests for critical user flows

**Documentation Maintenance**:
- Update CLAUDE.md with every major change
- Keep examples in sync with code
- Regular documentation reviews (quarterly)
- User feedback incorporated into troubleshooting

### Extensibility Hooks

**Custom VCS Backends**:
- Plugin system for user-defined backends
- Example backend implementation documented
- Clear interface contract
- Validation helpers for custom backends

**Custom Stack Strategies**:
- Plugin system for custom integration strategies
- Example strategy implementation documented
- Hook points for custom logic
- Validation of strategy compliance

**Webhook Integration**:
- Event bus already supports multiple consumers
- Add webhook consumer for external integrations
- Document event schema for consumers
- Example webhook server

### Deprecated Features

**Components to be Replaced** (not removed in this spec):
- Existing CLI entry points (`src/entry/cli/chopstack.ts`)
- TUI infrastructure for progress tracking
- Direct VCS operations in CLI commands
- GitWorkflowManager in MCP server (removed in Phase 2)

**What Gets Removed in This Spec**:
- GitWorkflowManager class in MCP server (Phase 2)
- Direct git operations in MCP tools (replaced by VcsEngine delegation)

**What Gets Preserved**:
- VCS domain services (WorktreeService, CommitService, etc.) - 95% reused
- VCS backends (GitSpiceBackend) - 100% reused
- Test infrastructure (GitTestEnvironment) - 100% reused
- Event system (ExecutionEventBus) - 100% reused

**Future Removal** (Phase 6+):
- CLI entry points can be removed once slash commands are stable
- TUI can be removed (replaced by Claude Code native UI)
- Old execution orchestration logic

## Appendix

### VCS Mode Comparison Matrix

| Feature | git-spice | merge-commit | graphite | sapling |
|---------|-----------|--------------|----------|---------|
| **Stacking** | ✅ Native | ❌ No | ✅ Native | ✅ Native |
| **Worktrees** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Parallel Execution** | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Auto-Restack** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **PR Creation** | ✅ Yes (gs stack submit) | ⚠️ Manual | ✅ Yes (gt stack submit) | ⚠️ Manual |
| **Branch Tracking** | ✅ Parent/child | ❌ None | ✅ Parent/child | ✅ Bookmarks |
| **Complexity** | High | Low | High | Very High |
| **Setup** | Easy | None | Easy | Hard |
| **Prerequisites** | gs binary | git only | gt binary | sl binary |
| **Implementation** | ✅ Existing | ✅ This Spec | 🚧 Stub Only | 🚧 Stub Only |

### Strategy-Backend Compatibility

| Strategy | git-spice | merge-commit | graphite | sapling |
|----------|-----------|--------------|----------|---------|
| **Simple** | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| **Worktree** | ✅ Compatible | ✅ Compatible | ✅ Compatible | ❌ Incompatible |
| **Stacked** | ✅ Compatible | ❌ Incompatible | ✅ Compatible | ✅ Compatible |

### Error Message Examples

**Worktree Creation Failure**:
```
❌ MCP Worktree Creation Failed

Task: create-types
Error: Branch 'task/create-types' already exists

Resolution:
1. Check for leftover worktree:
   git worktree list

2. Clean up manually:
   git worktree remove .chopstack/shadows/create-types
   git branch -d task/create-types

3. Retry execution:
   /execute-phase chopstack-v2 phase-1

Learn more: https://chopstack.dev/docs/troubleshooting/worktrees
```

**VCS Tool Unavailable (Explicit Mode)**:
```
❌ VCS Mode Not Available

Requested mode: git-spice (from ~/.chopstack/config.yaml)
Error: 'gs' binary not found in PATH

Installation:
1. Install git-spice:
   brew install abhinav/git-spice/git-spice
   # or
   go install go.abhg.dev/gs@latest

2. Verify installation:
   gs --version

3. Retry execution:
   /execute-phase chopstack-v2 phase-1

Alternative: Change mode in config
  ~/.chopstack/config.yaml:
    vcs:
      mode: merge-commit  # or remove to use merge-commit default
```

### Configuration Example

**~/.chopstack/config.yaml**:

```yaml
vcs:
  # VCS mode: git-spice | merge-commit | graphite | sapling
  # If specified: Tool must be available (no fallback)
  # If omitted: Defaults to merge-commit (requires only git)
  mode: git-spice

  # Trunk branch
  trunk: main

  # Worktree settings
  enable_worktrees: true
  worktree_path: .chopstack/shadows

  # Cleanup behavior
  cleanup_on_success: true
  cleanup_on_failure: false

  # Branch naming
  branch_prefix: task
  include_run_id: false

  # Stack settings (git-spice, graphite only)
  auto_restack: true
  submit_on_complete: false
```

### Related Specifications

- **MCP Architecture Audit**: `.chopstack/specs/simplify-arch-from-cli/notes/audit-mcp-structure.md`
- **VCS Strategy Audit**: `.chopstack/specs/simplify-arch-from-cli/notes/audit-vcs-strategies.md`
- **Slash Command Audit**: `.chopstack/specs/simplify-arch-from-cli/notes/audit-slash-command-integration.md`
- **Initial Requirements**: `.chopstack/specs/simplify-arch-from-cli/idea.md`
- **Codebase Context**: `.chopstack/specs/simplify-arch-from-cli/codebase.md`

### References

**External Documentation**:
- git-spice: https://abhinav.github.io/git-spice/
- graphite CLI: https://graphite.dev/docs/graphite-cli
- sapling: https://sapling-scm.com/docs/introduction/getting-started
- FastMCP: https://github.com/jlowin/fastmcp
- MCP SDK: https://github.com/modelcontextprotocol/sdk

**Internal Documentation**:
- chopstack CLAUDE.md: Architecture patterns and code style
- VCS Engine: `src/services/vcs/vcs-engine-service.ts`
- Strategy Pattern: `src/services/vcs/strategies/`
- Test Infrastructure: `test/helpers/git-test-environment.ts`

---

**Specification Complete** - Ready for task decomposition and implementation.
