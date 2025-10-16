# Audit: Existing VCS Strategy Patterns

**Date**: 2025-10-16
**Purpose**: Assess existing VCS strategies to inform new VCS-agnostic architecture
**Related Spec**: simplify-arch-from-cli

## Audit Scope
Analysis of existing VCS strategy implementations and interfaces to evaluate:
- Reusability of current patterns
- VCS abstraction quality
- Complexity of adding new strategies (merge-commit, graphite, sapling)
- Integration points with git-spice backend

## Methodology
- Code review of `src/services/vcs/strategies/`
- Interface analysis in `src/core/vcs/vcs-strategy.ts` and `src/core/vcs/interfaces.ts`
- Git-spice backend analysis in `src/adapters/vcs/git-spice/backend.ts`
- VCS Engine orchestration in `src/services/vcs/vcs-engine-service.ts`
- Domain services analysis in `src/core/vcs/domain-services.ts`
- Pattern identification across implementations

## Findings

### Summary
- **Existing Strategies**: 3 (Simple, Worktree, Stacked)
- **Common Patterns**: High (80%+ code similarity in lifecycle hooks)
- **Reusability**: Good domain service abstractions, but tight coupling to git-spice
- **Complexity to Extend**: Medium-High due to git-spice assumptions

### Detailed Findings

#### Strategy: SimpleVcsStrategy
- **File**: `src/services/vcs/strategies/simple-vcs-strategy.ts`
- **Lines of Code**: 142
- **Purpose**: Commit all changes directly to current branch. No worktrees, no branch creation.
- **Reusability**: 95% (very clean, minimal dependencies)
- **Key Patterns**:
  - Single `WorktreeContext` shared across all tasks (main directory)
  - Uses `CommitServiceImpl` for commits
  - All lifecycle hooks are simple stubs (no-ops or pass-through)
  - No VCS engine dependency
- **VCS Operations**: Basic git commits only
- **Notes**:
  - Most portable strategy
  - Could work with any VCS backend
  - Good baseline for VCS-agnostic design

#### Strategy: WorktreeVcsStrategy
- **File**: `src/services/vcs/strategies/worktree-vcs-strategy.ts`
- **Lines of Code**: 156
- **Purpose**: Creates separate Git worktrees for each task to enable parallel execution
- **Reusability**: 70% (depends on VCS engine for worktree management)
- **Key Patterns**:
  - Requires `VcsEngineService` dependency
  - Uses `vcsEngine.createWorktreesForTasks()` in bulk
  - Uses `CommitServiceImpl` for commits
  - Stores worktree contexts for cleanup
  - TODO comment for merging commits back to main
- **VCS Operations**:
  - Worktree creation/cleanup (git-specific)
  - Commits in isolated worktrees
- **Notes**:
  - Worktree concept is git-specific (not in Mercurial/Sapling)
  - Could be abstracted as "isolated workspace" concept
  - Current implementation assumes git worktrees

#### Strategy: StackedVcsStrategy
- **File**: `src/services/vcs/strategies/stacked-vcs-strategy.ts`
- **Lines of Code**: 543
- **Purpose**: Worktree-first approach with git-spice stacked branches
- **Reusability**: 40% (heavily tied to git-spice backend)
- **Key Patterns**:
  - Requires `VcsEngineService` dependency
  - Unique run ID to prevent branch name collisions
  - Just-in-time worktree creation (not upfront)
  - File modification validator for cross-task contamination
  - Linear stacking with dependency tracking
  - Pre-commit validation with strict/permissive modes
  - Immediate stacking on task completion (not deferred)
  - Worktree cleanup after each task commits
- **VCS Operations**:
  - `vcsEngine.commitInStack()` - git-spice commit
  - `vcsEngine.trackBranch()` - git-spice branch tracking
  - `vcsEngine.restack()` - git-spice restack
  - `vcsEngine.createWorktreesForTasks()` - per-task worktree creation
  - `vcsEngine.cleanupWorktrees()` - per-task cleanup
- **Git-Spice Integration**:
  - Branch creation: `gs branch create --target <parent> --no-commit`
  - Commits: `gs commit create -m <message> [--no-restack]`
  - Tracking: `gs branch track <branch> --base <parent>`
  - Restacking: `gs upstack restack`
- **Notes**:
  - Most complex strategy
  - Tight coupling to git-spice semantics (parent tracking, restacking)
  - Pre-commit validation is valuable pattern (reusable)
  - Linear stacking algorithm is VCS-agnostic (reusable)
  - Run ID pattern for collision avoidance is reusable

### VCS Strategy Interface Analysis

**File**: `src/core/vcs/vcs-strategy.ts`

**Interface Quality**: Good abstraction with clear lifecycle hooks

**Lifecycle Hooks** (5 total):
1. `initialize(tasks, context)` - Setup for a batch of tasks
2. `prepareTaskExecutionContexts(tasks, context)` - Bulk context preparation (optional)
3. `prepareTaskExecution(task, executionTask, context)` - Single task preparation (optional)
4. `handleTaskCompletion(task, executionTask, context, output?)` - Commit/stack task
5. `finalize(results, context)` - Post-execution cleanup/stacking
6. `cleanup()` - Resource cleanup

**Key Types**:
- `VcsStrategyContext`: `{ cwd, baseRef?, validation? }`
- `WorktreeContext`: Task execution environment (path, branch, base ref)
- `TaskCommitResult`: Commit outcome (taskId, commitHash?, branchName?, error?)
- `VcsMode`: `'simple' | 'worktree' | 'stacked'`

**Strengths**:
- Clean lifecycle separation
- Flexible context types
- Error handling built into result types

**Weaknesses**:
- `prepareTaskExecutionContexts` vs `prepareTaskExecution` duplication
- No explicit VCS backend abstraction (assumed git-spice)
- Validation config embedded in strategy context (should be separate)

### VCS Backend Interface Analysis

**File**: `src/core/vcs/interfaces.ts`

**VcsBackend Interface** (git-spice specific):
- `isAvailable()` - Check if backend installed
- `initialize(workdir, trunk?)` - Setup backend
- `createStackBranch(branchName, parentBranch, workdir)` - Create stacked branch
- `commitInStack(message, workdir, options?)` - Stack-aware commit
- `trackBranch(branchName, parentBranch, workdir)` - Track branch with parent
- `restack(workdir)` - Fix branch relationships
- `submitStack(workdir, options?)` - Create PRs
- `getStackInfo(workdir)` - Get stack metadata

**Current Implementation**:
- Only git-spice backend exists (`src/adapters/vcs/git-spice/backend.ts`, 1014 lines)
- Graphite placeholder (`src/adapters/vcs/graphite/index.ts`, 2 lines: `// TODO: Implement Graphite VCS adapter`)

**Interface Strengths**:
- Clear separation of VCS backend from strategy
- Stack-first design (good for PR workflows)

**Interface Weaknesses**:
- Assumes stacking model (not suitable for merge-commit workflow)
- No abstraction for "what is a stack?" (git-spice vs graphite vs sapling)
- Missing operations: branch deletion, force-push, conflict resolution

### VCS Engine Service Analysis

**File**: `src/services/vcs/vcs-engine-service.ts`

**Architecture**: Orchestrates 6 domain services:
1. `WorktreeService` - Worktree lifecycle
2. `CommitService` - Commit creation
3. `RepositoryService` - Repository queries
4. `VcsAnalysisService` - Worktree needs analysis
5. `ConflictResolutionService` - Conflict handling
6. `StackBuildService` - Stack creation/submission

**Reusability**: 85% (domain services are well abstracted)

**Key Observations**:
- Clean service composition
- Event-driven architecture (EventEmitter)
- Git operation queue for serialization
- Dependency injection support
- Most services are VCS-agnostic except `StackBuildService`

**StackBuildService** (the problematic one):
- Hardcoded to git-spice backend
- Methods: `createStackBranch`, `commitInStack`, `trackBranch`, `restack`
- All delegate to git-spice backend operations
- This is the coupling point that prevents multi-backend support

### Git-Spice Backend Analysis

**File**: `src/adapters/vcs/git-spice/backend.ts` (1014 lines)

**Implementation Pattern**:
- Shells out to `gs` CLI via `execa`
- No git-spice library/API (pure CLI wrapper)
- Extensive error handling and debugging
- Worktree-aware operations

**Key Operations**:
1. **Branch Creation**: `gs branch create <name> --target <parent> [--no-commit]`
2. **Commit**: `gs commit create -m <message> [--no-restack]`
3. **Tracking**: `gs branch track <branch> --base <parent>`
4. **Restacking**: `gs upstack restack`
5. **Submit**: `gs stack submit [--draft] [--auto-merge]`

**Deprecated Methods**:
- `createBranchFromCommit()` - Old cherry-pick approach (kept for compatibility)
- New workflow: `createStackBranch()` + `commitInStack()` + `trackBranch()`

**Worktree Synchronization**:
- `fetchWorktreeCommits()` helper in `worktree-sync.ts`
- Fetches commits from worktrees to main repo
- Critical for making worktree commits available for branch creation

**Error Handling**:
- Custom `GitSpiceError` class
- Detailed error extraction from `execa` errors
- Timeout handling (120s for branch ops, 30s for commits)

### Common Patterns Identified

1. **Lifecycle Pattern** (100% shared):
   - Initialize → Prepare → Execute → Commit → Finalize → Cleanup
   - All strategies follow this exact flow

2. **Context Management** (100% shared):
   - `VcsStrategyContext` for global config
   - `WorktreeContext` for task-specific execution environment
   - Map-based context storage

3. **Commit Service Delegation** (100% shared):
   - All strategies use `CommitServiceImpl`
   - Options: `{ generateMessage?, includeAll?, files?, message? }`
   - Returns commit hash

4. **Worktree Management** (66% shared - Worktree + Stacked):
   - Delegate to `VcsEngineService.createWorktreesForTasks()`
   - Delegate to `VcsEngineService.cleanupWorktrees()`
   - Store contexts for cleanup

5. **Error Handling** (100% shared):
   - Try/catch around operations
   - Return `TaskCommitResult` with optional `error` field
   - Log warnings, don't throw in finalize

6. **Branch Naming** (66% shared - Worktree + Stacked):
   - Prefix-based: `chopstack/<task-id>[-<suffix>]`
   - Collision avoidance with timestamps/run IDs

7. **Stack Building** (33% shared - Stacked only):
   - Dependency order tracking
   - Parent branch determination
   - Linear stacking algorithm
   - Just-in-time resource creation

### VCS Abstraction Quality

**Current State**: Partially abstracted

**Well Abstracted** (80%):
- Strategy interface lifecycle
- Domain service composition
- Commit operations
- Worktree management (abstracted via service)
- Repository queries

**Poorly Abstracted** (20%):
- Stack operations (hardcoded to git-spice)
- Backend interface assumes stacking model
- No abstraction for "what is a branch relationship?"
- VCS-specific operations leak into strategies (restack, track)

**Missing Abstractions**:
1. **Branch Relationship Model**: Parent/child (git-spice) vs merge-base (merge-commit) vs ???
2. **Stack Submission**: PR creation abstraction (GitHub, GitLab, Bitbucket)
3. **Conflict Resolution**: VCS-specific merge strategies
4. **Backend Detection**: Auto-detect which backend to use

## Analysis

### Git-Spice Integration

**Current Implementation**:
- Git-spice backend is the ONLY backend
- Tightly integrated with `StackedVcsStrategy`
- CLI wrapper approach (not library)

**Extension Points**:
- `VcsBackend` interface exists but only has git-spice implementation
- Could add `GraphiteBackend`, `SaplingBackend`, `MergeCommitBackend`
- Interface needs expansion for non-stacking workflows

**Limitations**:
- Backend interface assumes stacking (parent/child relationships)
- No support for merge-commit workflow (requires different primitives)
- No backend selection logic (hardcoded to git-spice)

**Reusability for Other Backends**:
- Interface: 60% reusable (needs expansion)
- Implementation pattern: 80% reusable (CLI wrapper pattern is sound)
- Operations: 40% reusable (stacking-specific)

### VCS Strategy Interface Evaluation

**Strengths**:
✅ Clean lifecycle hooks
✅ Flexible context types
✅ Strategy pattern enables multiple implementations
✅ Error handling built into result types

**Weaknesses**:
❌ Duplication: `prepareTaskExecutionContexts` vs `prepareTaskExecution`
❌ Missing backend abstraction in strategy context
❌ Validation config embedded (should be separate concern)
❌ No explicit "backend selection" concept

**Recommendations**:
1. Consolidate preparation hooks into one: `prepareExecution(tasks, context)`
2. Add `backend: VcsBackend` to `VcsStrategyContext`
3. Move validation config to separate concern
4. Add `supportsParallelExecution(): boolean` strategy capability query

### VCS Abstraction Gaps

**Missing Abstractions**:

1. **Backend Selection**:
   - No logic to choose backend (git-spice, graphite, merge-commit, etc.)
   - Should auto-detect based on repository state
   - Example: Check for `.git/spice` → git-spice, `.git/graphite` → graphite

2. **Branch Relationship Model**:
   - Git-spice: Parent/child with tracking
   - Graphite: Stack metadata in `.git/graphite`
   - Merge-commit: No explicit relationships, just merge-base
   - Sapling: Different metadata format

3. **Stack Abstraction**:
   - What IS a stack? Backend-specific concept
   - Git-spice: Tracked parent relationships
   - Graphite: Stack configuration file
   - Merge-commit: Just branches, no "stack"

4. **PR Creation**:
   - Currently git-spice `submitStack()` is hardcoded
   - Should abstract: GitHub API, GitLab API, Bitbucket API
   - Should work with graphite CLI, sapling CLI, etc.

**Proposed Abstraction Layers**:

```
┌─────────────────────────────────────────────────────────┐
│  VCS Strategy Layer (How to organize work)              │
│  - Simple, Worktree, Stacked                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  VCS Backend Layer (Which tool to use)                  │
│  - GitSpiceBackend, GraphiteBackend, MergeCommitBackend │
│  - SaplingBackend, etc.                                 │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  VCS Primitives Layer (Base operations)                 │
│  - Git, Mercurial, Sapling (if we ever support it)      │
└─────────────────────────────────────────────────────────┘
```

## Recommendations

### 1. VCS Strategy Interface Improvements

**Current Issues**:
- Preparation hook duplication
- No backend selection mechanism
- Validation tightly coupled

**Recommended Changes**:
```typescript
// Simplified strategy interface
type VcsStrategy = {
  initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void>;

  // Consolidated preparation (replaces both prepare hooks)
  prepareExecution(
    tasks: ExecutionTask[],
    context: VcsStrategyContext
  ): Promise<Map<string, WorktreeContext>>;

  handleTaskCompletion(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: WorktreeContext
  ): Promise<TaskCommitResult>;

  finalize(results: TaskCommitResult[], context: VcsStrategyContext): Promise<{
    branches: string[];
    commits: string[];
  }>;

  cleanup(): Promise<void>;

  // New capability queries
  supportsParallelExecution(): boolean;
  requiresWorktrees(): boolean;
  supportsStacking(): boolean;
};

// Enhanced context with backend
type VcsStrategyContext = {
  cwd: string;
  baseRef?: string;
  backend: VcsBackend; // Explicit backend selection
  // Validation moved to separate service
};
```

### 2. VCS Backend Interface Expansion

**Current Issues**:
- Assumes stacking model
- Missing operations for merge-commit workflow
- No conflict resolution primitives

**Recommended Interface**:
```typescript
type VcsBackend = {
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
  }): Promise<string>;

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

### 3. Backend Selection Strategy

**Auto-Detection Logic**:
```typescript
async function detectBackend(workdir: string): Promise<VcsBackend> {
  // Check for git-spice
  if (fs.existsSync(path.join(workdir, '.git', 'spice'))) {
    return new GitSpiceBackend();
  }

  // Check for graphite
  if (fs.existsSync(path.join(workdir, '.git', 'graphite'))) {
    return new GraphiteBackend();
  }

  // Check for sapling
  if (fs.existsSync(path.join(workdir, '.sl'))) {
    return new SaplingBackend();
  }

  // Default to merge-commit (works with any git repo)
  return new MergeCommitBackend();
}
```

### 4. Strategy-Backend Compatibility Matrix

| Strategy    | Git-Spice | Graphite | Merge-Commit | Sapling |
|-------------|-----------|----------|--------------|---------|
| Simple      | ✅        | ✅       | ✅           | ✅      |
| Worktree    | ✅        | ✅       | ⚠️ Partial   | ❌      |
| Stacked     | ✅        | ✅       | ❌           | ✅      |

**Notes**:
- Simple strategy works with any backend (no special operations)
- Worktree strategy requires worktree support (git, not sapling)
- Stacked strategy requires stacking backend (git-spice, graphite, sapling)
- Merge-commit backend is incompatible with stacked strategy

### 5. Complexity Estimates for New Strategies

#### Merge-Commit Backend
**Estimated Complexity**: **M** (Medium - 3-5 days)

**Why Medium**:
- Simpler than git-spice (no stack tracking)
- Standard git operations only
- No CLI dependency (use git directly)
- Need to handle PR creation separately

**Implementation Scope**:
- Branch creation from merge-base
- Commits on feature branches
- No stack metadata
- PR submission via GitHub/GitLab API

**Lines of Code Estimate**: 300-400 lines

#### Graphite Backend
**Estimated Complexity**: **M** (Medium - 4-6 days)

**Why Medium**:
- Similar to git-spice (stacking model)
- CLI wrapper (like git-spice)
- Different commands but same concepts
- Stack metadata format differs

**Implementation Scope**:
- `gt branch create`
- `gt commit create`
- `gt stack submit`
- Stack info parsing

**Lines of Code Estimate**: 600-800 lines (similar to git-spice)

**Reusability from git-spice**: 70%
- CLI wrapper pattern: reuse
- Error handling: reuse
- Stack info parsing: adapt
- Commands: replace

#### Sapling Backend
**Estimated Complexity**: **L** (Large - 8-12 days)

**Why Large**:
- Different VCS entirely (not git)
- Different primitives (no worktrees)
- Different stacking model
- More complex setup

**Implementation Scope**:
- `sl commit`
- `sl goto`
- `sl rebase`
- Stack submission via Phabricator/GitHub

**Lines of Code Estimate**: 800-1200 lines

**Reusability from git-spice**: 40%
- CLI wrapper pattern: reuse
- Error handling: reuse
- Operations: mostly new

**Blockers**:
- Worktree strategy incompatible (sapling has no worktrees)
- Need sapling-specific execution isolation
- Different conflict resolution model

### 6. Migration Path

**Phase 1: Refactor Existing Code** (Low complexity)
1. Extract `VcsBackend` interface to separate file
2. Rename `GitSpiceBackend` to clarify it's one implementation
3. Add backend detection logic
4. Add backend to `VcsStrategyContext`

**Phase 2: Add Merge-Commit Backend** (Medium complexity)
1. Implement `MergeCommitBackend`
2. Test with simple strategy
3. Test with worktree strategy
4. Document limitations

**Phase 3: Add Graphite Backend** (Medium complexity)
1. Implement `GraphiteBackend` (reuse git-spice patterns)
2. Test with stacked strategy
3. Add graphite detection
4. Document usage

**Phase 4: Enhance Abstraction** (Optional - High complexity)
1. Add sapling backend (if needed)
2. Abstract PR submission (multi-platform)
3. Add conflict resolution abstraction

## Task Implications

### Task Granularity

**Recommended Task Breakdown**:

1. **Refactor VCS Interface** (S - 1-2 days)
   - Extract VcsBackend to own file
   - Clean up interface (remove duplication)
   - Add capability queries to strategy

2. **Add Backend Detection** (XS - 0.5-1 day)
   - Auto-detect git-spice, graphite, sapling
   - Default to merge-commit
   - Add tests

3. **Implement MergeCommitBackend** (M - 3-5 days)
   - Basic git operations
   - Branch creation from merge-base
   - PR submission via API
   - Tests

4. **Implement GraphiteBackend** (M - 4-6 days)
   - CLI wrapper
   - Stack operations
   - Submit command
   - Tests

5. **Update Strategies for Backend** (S - 2-3 days)
   - Add backend to context
   - Update stacked strategy to use backend
   - Add compatibility checks
   - Tests

### Dependencies

**Must Happen First**:
1. VCS interface refactor (blocks everything)
2. Backend detection (blocks new backends)

**Can Happen in Parallel**:
- MergeCommitBackend implementation
- GraphiteBackend implementation
- Strategy updates (after interface refactor)

**Should Happen After**:
- Sapling backend (if ever)
- PR submission abstraction (nice-to-have)

### Estimated Complexity per Strategy

| Backend           | Complexity | Days | LoC   | Reuse from git-spice |
|-------------------|------------|------|-------|----------------------|
| Merge-Commit      | M          | 3-5  | 300   | 40%                  |
| Graphite          | M          | 4-6  | 700   | 70%                  |
| Sapling           | L          | 8-12 | 1000  | 40%                  |

### Risk Assessment

**Low Risk**:
- Merge-commit backend (standard git)
- Interface refactoring (well-tested)

**Medium Risk**:
- Graphite backend (CLI dependency, less docs)
- Backend detection (needs testing across repos)

**High Risk**:
- Sapling backend (different VCS, worktree incompatibility)
- PR submission abstraction (multi-platform complexity)

## Conclusion

**Current State**: Good foundation with git-spice, needs expansion

**Reusability**: High (80%) for core patterns, low (40%) for backend-specific ops

**Path Forward**:
1. Refactor interface to separate backend concern
2. Add merge-commit backend (quick win)
3. Add graphite backend (reuse patterns)
4. Consider sapling if needed (large effort)

**Key Insight**: The strategy pattern is sound, but VCS backend abstraction is incomplete. Focus on completing the backend abstraction layer before adding new strategies.
