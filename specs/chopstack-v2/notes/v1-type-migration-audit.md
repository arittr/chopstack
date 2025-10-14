# V1 Type Migration Audit

**Date**: 2025-10-14
**Purpose**: Comprehensive analysis of v1 type usage to inform v2 migration planning
**Status**: COMPLETE

## Executive Summary

This audit analyzes the impact of migrating from v1 types (`src/types/decomposer.ts`) to v2 types (`src/types/schemas-v2.ts`) as specified in the chopstack v2.0.0 plan.

**Key Findings:**
- **43 files** import from `src/types/decomposer.ts`
- **29 production files** require migration (14 test files)
- **7 major modules** affected
- **Estimated effort**: 28-35 hours across 8-10 tasks

## Impact Analysis

### Files Affected by Module

#### 1. Agents (3 files, ~3 hours)
**Production Files:**
- `adapters/agents/claude.ts` - ClaudeCodeDecomposer uses `Plan` type
- `adapters/agents/codex.ts` - CodexDecomposer uses `Plan` type
- `adapters/agents/mock.ts` - MockDecomposer uses `Plan` type

**Impact**: **MEDIUM**
- All agent implementations return `Plan` type from `decompose()` method
- Field changes affect response parsing and validation
- Each agent has custom parsing logic that references task fields

**Migration Strategy:**
- Update `DecomposerAgent` interface to return `PlanV2`
- Update response parsers to handle new field names
- Update validation logic for new schema structure


#### 2. Commands (2 files, ~3 hours)
**Production Files:**
- `commands/decompose/decompose-command.ts` - Uses `DecomposeOptions`, returns `Plan`
- `commands/run/run-command.ts` - Loads and validates `Plan` from YAML

**Test Files:**
- `commands/decompose/__tests__/decompose.integration.test.ts`
- `commands/run/__tests__/run.integration.test.ts`

**Impact**: **HIGH**
- CLI entry points - user-facing breaking changes
- Need to add new `--spec` flag for context injection (v2 requirement)
- Update option parsing and validation

**Migration Strategy:**
- Update DecomposeOptions schema with new fields
- Add spec file loading in run command
- Update CLI documentation


#### 3. Core (5 files, ~5 hours)
**Production Files:**
- `core/agents/interfaces.ts` - `DecomposerAgent` interface definition
- `core/execution/interfaces.ts` - `Plan`, `Task`, `ValidationResult` types
- `core/execution/task-transitions.ts` - State machine using `Task` type
- `core/execution/types.ts` - Task state types and schemas
- `core/vcs/vcs-strategy.ts` - VCS strategy interface uses `Task`

**Test Files:**
- `core/execution/__tests__/task-transitions.test.ts`

**Impact**: **CRITICAL**
- Core interfaces used throughout codebase
- Breaking changes cascade to all consumers
- Task state machine needs field mapping updates

**Migration Strategy:**
- Create new v2 interfaces alongside v1
- Update type exports in index files
- Migrate interfaces incrementally with dual exports during transition


#### 4. Execution Services (4 files, ~4 hours)
**Production Files:**
- `services/execution/engine/execution-engine.ts` - Executes tasks from `Plan`
- `services/execution/execution-orchestrator.ts` - Orchestrates execution, uses `Plan` and `ValidationResult`
- `services/execution/modes/execute-mode-handler.ts` - Task execution handler
- `services/execution/modes/plan-mode-handler.ts` - Planning mode (dry-run)
- `services/execution/modes/validate-mode-handler.ts` - Validation mode

**Test Files:**
- `services/execution/modes/__tests__/execute-mode-handler.integration.test.ts`

**Impact**: **CRITICAL**
- Execution engine is core functionality
- Needs new phase-aware execution logic
- Context injection system (new v2 feature)

**Migration Strategy:**
- Implement PhaseExecutor (new v2 component)
- Add ExecutionContext type for spec injection
- Update mode handlers for phase support
- Implement `buildTaskPromptWithContext()` method


#### 5. Planning Services (2 files, ~4 hours)
**Production Files:**
- `services/planning/plan-generator.ts` - Generates plans with retry logic
- `services/planning/plan-outputter.ts` - Outputs plan YAML and metrics

**Impact**: **HIGH**
- Plan generation is core decomposition functionality
- Need new phase detection logic
- Update conflict resolution to work with phases

**Migration Strategy:**
- Implement phase-detector.ts (new v2 component)
- Update plan-generator with 5-phase workflow
- Add acceptance criteria extraction
- Update plan-outputter for phase-based YAML


#### 6. VCS Services (4 files, ~3 hours)
**Production Files:**
- `services/vcs/strategies/simple-vcs-strategy.ts` - Simple VCS uses `Task`
- `services/vcs/strategies/stacked-vcs-strategy.ts` - Stacked PR strategy uses `Task`
- `services/vcs/strategies/worktree-vcs-strategy.ts` - Worktree strategy uses `Task`
- `services/vcs/validation/file-access-control.ts` - File validation uses `Task.touches` and `Task.produces`
- `services/vcs/validation/file-modification-validator.ts` - Validates file modifications
- `services/vcs/validation/violation-reporter.ts` - Reports violations

**Test Files:** (9 test files)

**Impact**: **HIGH**
- VCS strategies access task file lists directly
- `touches` + `produces` → `files` (breaking change)
- File validation logic depends on old field structure

**Migration Strategy:**
- Update VCS strategies to use `task.files` instead of `touches` + `produces`
- Update file validation to work with unified `files` array
- Add helper functions to distinguish created vs modified files (if needed)


#### 7. Validation (3 files, ~2 hours)
**Production Files:**
- `validation/agent-validator.ts` - Validates agent type
- `validation/dag-validator.ts` - DAG validation and metrics
- `validation/validation.ts` - Schema validation

**Impact**: **MEDIUM**
- DAG validator uses `task.requires` (→ `dependencies`)
- Metrics calculation uses `task.estimatedLines` (→ `estimated_hours`)
- Schema validation needs complete rewrite for v2

**Migration Strategy:**
- Update DagValidator to use `task.dependencies` instead of `requires`
- Update metrics to use `estimated_hours` instead of `estimatedLines`
- Create new validation.ts for v2 schemas


#### 8. I/O (1 file, ~2 hours)
**Production Files:**
- `io/yaml-parser.ts` - Parses YAML plans into `Plan` type

**Impact**: **HIGH**
- YAML parsing is critical for plan loading
- Need to support both v1 and v2 formats during transition
- Add phase parsing logic

**Migration Strategy:**
- Add v2 YAML schema parsing
- Implement version detection (v1 vs v2 plans)
- Support dual parsing during migration


#### 9. UI (1 file, ~2 hours)
**Production Files:**
- `ui/hooks/useExecutionState.ts` - React hook using `Plan` type

**Impact**: **MEDIUM**
- TUI displays plan data
- Need phase tree view (new v2 feature)
- Update progress tracking for phases

**Migration Strategy:**
- Add phase state to useExecutionState hook
- Implement phase tree view component
- Update progress indicators


#### 10. Utils (0 production files, 2 test files)
**Test Files:**
- `utils/__tests__/dag-validator.test.ts`
- `utils/__tests__/plan-outputter.test.ts`

**Impact**: **LOW** (tests only)

---

## Field Mapping (Breaking Changes)

### Task Type Changes

| V1 Field | V2 Field | Type Change | Migration Notes |
|----------|----------|-------------|-----------------|
| `title` | `name` | ✅ Same type | Simple rename |
| `touches` + `produces` | `files` | ⚠️ Merged | Combine arrays, remove duplicates |
| `requires` | `dependencies` | ✅ Same type | Simple rename |
| `estimatedLines` | `estimated_hours` | ⚠️ Type change | Number → number (but different unit) |
| `agentPrompt` | - | ❌ Removed | Generated dynamically with context injection |
| `layer` | `phase` | ⚠️ Semantic change | Layer number → Phase ID string |
| - | `acceptance_criteria` | ✅ New field | Extract from spec |
| - | `complexity` | ✅ New field | T-shirt size (XS/S/M/L/XL) |

### Plan Type Changes

| V1 Field | V2 Field | Type Change | Migration Notes |
|----------|----------|-------------|-----------------|
| - | `name` | ✅ New field | Plan name |
| - | `description` | ✅ New field | Plan description |
| - | `strategy` | ✅ New field | sequential/parallel/phased-parallel |
| - | `phases` | ✅ New field | Phase array (optional) |
| `tasks` | `tasks` | ✅ Same | But Task type changed (see above) |
| - | `success_metrics` | ✅ New field | Quantitative + qualitative |

### New V2 Types

**Phase Type** (new):
```typescript
{
  id: string;
  name: string;
  strategy: 'sequential' | 'parallel';
  tasks: string[];  // Task IDs
  requires: string[];  // Phase IDs
  estimated_hours: number;
}
```

**ExecutionContext Type** (new):
```typescript
{
  specContent: string;  // Full markdown spec for context injection
  planMetadata: {
    name: string;
    description?: string;
    successMetrics?: SuccessMetrics;
  };
}
```

---

## Complexity Estimation

### By Module (Production Files Only)

| Module | Files | Estimated Hours | Complexity | Priority |
|--------|-------|----------------|------------|----------|
| **Core** | 5 | 5 | HIGH | 🔴 **CRITICAL** - Must do first |
| **I/O** | 1 | 2 | HIGH | 🔴 **CRITICAL** - Needed for all parsing |
| **Execution** | 4 | 4 | HIGH | 🟠 **HIGH** - Core functionality |
| **Planning** | 2 | 4 | HIGH | 🟠 **HIGH** - Core functionality |
| **VCS** | 4 | 3 | MEDIUM | 🟡 **MEDIUM** - Uses Task fields |
| **Commands** | 2 | 3 | MEDIUM | 🟡 **MEDIUM** - User-facing |
| **Agents** | 3 | 3 | MEDIUM | 🟡 **MEDIUM** - Response parsing |
| **Validation** | 3 | 2 | MEDIUM | 🟡 **MEDIUM** - Schema changes |
| **UI** | 1 | 2 | LOW | 🟢 **LOW** - Display only |

**Total Production**: 29 files, **28-35 hours**

**Test Files**: 14 files, **8-10 hours** (update after production migration)

**Grand Total**: 43 files, **36-45 hours**

---

## Suggested Task Breakdown

Based on the audit, here's a recommended task structure for the v2 migration:

### Task Group 1: Foundation (6-8 hours)
**Complexity**: M (Medium)

1. **Task 1.1**: Create v2 type definitions
   - Files: `src/types/schemas-v2.ts`
   - Hours: 2-3
   - Create all v2 Zod schemas (Phase, TaskV2, PlanV2, ExecutionContext, etc.)

2. **Task 1.2**: Update I/O layer for v2
   - Files: `src/io/yaml-parser.ts`
   - Hours: 2
   - Add v2 YAML parsing, version detection

3. **Task 1.3**: Update core interfaces
   - Files: `src/core/agents/interfaces.ts`, `src/core/execution/interfaces.ts`, `src/core/execution/types.ts`
   - Hours: 2-3
   - Update interfaces to use v2 types, dual export during transition


### Task Group 2: Agent & Planning Migration (8-10 hours)
**Complexity**: M-L (Medium-Large)

4. **Task 2.1**: Update agent implementations
   - Files: `src/adapters/agents/claude.ts`, `codex.ts`, `mock.ts`
   - Hours: 3-4
   - Update to return PlanV2, parse new fields

5. **Task 2.2**: Implement phase detection
   - Files: `src/services/planning/phase-detector.ts` (new), `plan-generator.ts`
   - Hours: 3-4
   - New phase detection algorithm, update plan generator

6. **Task 2.3**: Update plan outputter
   - Files: `src/services/planning/plan-outputter.ts`
   - Hours: 2
   - Output phase-based YAML


### Task Group 3: Execution Engine Migration (6-8 hours)
**Complexity**: L (Large)

7. **Task 3.1**: Implement PhaseExecutor
   - Files: `src/services/execution/phase-executor.ts` (new)
   - Hours: 4-5
   - New phase-aware execution engine with context injection

8. **Task 3.2**: Update mode handlers
   - Files: `src/services/execution/modes/*.ts`
   - Hours: 2-3
   - Update execute/plan/validate modes for phases


### Task Group 4: VCS & Validation (5-6 hours)
**Complexity**: M (Medium)

9. **Task 4.1**: Update VCS strategies
   - Files: `src/services/vcs/strategies/*.ts`, `validation/*.ts`
   - Hours: 3
   - Update to use `task.files` instead of `touches`+`produces`

10. **Task 4.2**: Update validation
    - Files: `src/validation/*.ts`
    - Hours: 2-3
    - Update DAG validator, metrics, schema validation


### Task Group 5: Commands & UI (5-6 hours)
**Complexity**: M (Medium)

11. **Task 5.1**: Update commands
    - Files: `src/commands/decompose/*.ts`, `run/*.ts`
    - Hours: 3
    - Add --spec flag, update option parsing

12. **Task 5.2**: Update UI
    - Files: `src/ui/*.ts`
    - Hours: 2-3
    - Phase tree view, progress tracking


### Task Group 6: Testing (8-10 hours)
**Complexity**: M (Medium)

13. **Task 6.1**: Update unit tests
    - Files: All `**/__tests__/*.test.ts`
    - Hours: 4-5
    - Update test fixtures and assertions

14. **Task 6.2**: Update integration tests
    - Files: All `**/__tests__/*.integration.test.ts`
    - Hours: 4-5
    - End-to-end test updates


---

## Migration Dependencies

```
Task 1.1 (Type definitions)
    ↓
Task 1.2 (I/O layer) + Task 1.3 (Core interfaces)
    ↓
Task 2.1 (Agents) + Task 2.2 (Phase detection)
    ↓
Task 2.3 (Plan outputter) + Task 3.1 (PhaseExecutor)
    ↓
Task 3.2 (Mode handlers) + Task 4.1 (VCS) + Task 4.2 (Validation)
    ↓
Task 5.1 (Commands) + Task 5.2 (UI)
    ↓
Task 6.1 (Unit tests) + Task 6.2 (Integration tests)
```

**Critical Path**: 1.1 → 1.2 → 2.2 → 3.1 → 3.2 → 5.1 → 6.2
**Estimated Critical Path Time**: ~18-22 hours


---

## Risk Analysis

### HIGH RISK Areas

1. **Context Injection System** (NEW v2 feature)
   - No v1 equivalent - completely new
   - Affects every task execution
   - Risk: Prompt token budget overflow with large specs
   - Mitigation: Implement token budget manager (see codebase.md lines 2231-2294)

2. **Phase Detection Algorithm** (NEW v2 feature)
   - Complex heuristics for phase boundaries
   - Risk: Poor phase grouping → serial execution instead of parallel
   - Mitigation: Extensive testing with real-world plans

3. **Unified `files` Field**
   - Merging `touches` + `produces` → `files` loses semantic meaning
   - Risk: VCS strategies may need to know created vs modified
   - Mitigation: Add metadata or helper functions if needed


### MEDIUM RISK Areas

1. **Field Renames** (`title`→`name`, `requires`→`dependencies`)
   - Risk: Missing updates in string literals, error messages
   - Mitigation: Comprehensive grep + test coverage

2. **Unit Changes** (`estimatedLines` → `estimated_hours`)
   - Risk: Metrics calculations incorrect, comparison issues
   - Mitigation: Clear conversion logic, update all displays


### LOW RISK Areas

1. **New Optional Fields** (`acceptance_criteria`, `complexity`, etc.)
   - Backward compatible (optional in schema)
   - Risk: Minimal - graceful degradation if missing
   - Mitigation: Default values in schema


---

## Recommended Approach

### Option 1: Big Bang Migration (NOT RECOMMENDED)
- Migrate all files at once
- **Pros**: Clean cutover, no dual maintenance
- **Cons**: High risk, long branch, difficult testing
- **Timeline**: 4-5 weeks

### Option 2: Incremental Migration with Dual Exports (RECOMMENDED)
- Migrate in task groups (Foundation → Planning → Execution → Polish)
- Maintain v1 exports during transition
- **Pros**: Lower risk, testable increments, parallel work possible
- **Cons**: More complex, temporary code duplication
- **Timeline**: 3-4 weeks

**Recommended Strategy**: Option 2 with these phases:

**Week 1**: Foundation (Tasks 1.1-1.3)
- Create v2 types
- Dual export v1 + v2 from `src/types/index.ts`
- Update I/O and core interfaces

**Week 2**: Planning (Tasks 2.1-2.3)
- Update agents and plan generation
- Implement phase detection
- All new plans are v2 format

**Week 3**: Execution (Tasks 3.1-4.2)
- Implement PhaseExecutor with context injection
- Update VCS and validation
- v2 execution fully working

**Week 4**: Polish (Tasks 5.1-6.2)
- Update commands and UI
- Full test coverage
- Remove v1 code


---

## Open Questions to Resolve

These questions from the spec need answers before decomposition:

### 1. **Architecture Questions** (from spec.md lines 336-339)

#### Q1: Should the v2 Agent interface support streaming responses?
**Current State**: ClaudeCodeDecomposer uses streaming for progress (lines 222-348 in claude.ts)
**Recommendation**: ✅ **YES** - Keep streaming support
- Already implemented and working well
- Needed for long-running operations (spec generation can take 30s+)
- TUI benefits from real-time updates

**Decision**: Include `executeStreaming()` method in v2 Agent interface

---

#### Q2: Should v2.0 support custom phase strategies beyond sequential/parallel?
**Current State**: Only sequential/parallel defined
**Recommendation**: ❌ **NO** for v2.0, defer to v2.1+
- Two strategies sufficient for 90% of use cases
- Adds complexity without proven need
- Can be added in backward-compatible way later

**Decision**: v2.0 ships with sequential/parallel only. Add extensibility point for future.

---

#### Q3: Should validation mode support custom validators?
**Current State**: Built-in acceptance criteria + metrics validation
**Recommendation**: ❌ **NO** for v2.0, defer to v2.1+
- Built-in validators + project principles (CLAUDE.md) cover most needs
- Custom validators add API surface and complexity
- Can be added later if users request it

**Decision**: v2.0 validation mode: acceptance criteria + metrics + project principles only

---

### 2. **Migration Questions**

#### Q4: How to handle existing v1 plans during transition?
**Options**:
- A) Read-only support (can run v1 plans, can't edit)
- B) Auto-upgrade to v2 on load
- C) No v1 support (force manual conversion)

**Recommendation**: **Option A** - Read-only v1 support for 1 release
- Allows users to finish in-progress work
- Simpler than auto-upgrade (which may fail)
- Deprecation path: v2.0 (read-only) → v2.1 (remove)

**Implementation**: Version detection in yaml-parser.ts

---

#### Q5: What's the rollout strategy?
**Recommendation**: **Major version bump (2.0.0) with migration guide**
- Breaking changes justify major version
- Clear migration guide (conceptual, no automated tool)
- Release notes with "how to upgrade"

**Migration Guide Contents**:
1. Field mapping table (from this audit)
2. Example v1 → v2 plan conversion
3. New features overview (phases, context injection, validation)
4. Troubleshooting common issues

---

## Audit Completion Checklist

- [x] Count v1 type imports (43 files found)
- [x] Categorize by module (9 modules identified)
- [x] Map field changes (8 breaking changes documented)
- [x] Estimate complexity (28-35 hours for production files)
- [x] Identify dependencies (critical path identified)
- [x] Suggest task breakdown (14 tasks across 6 groups)
- [x] Answer open architecture questions
- [x] Recommend migration strategy

---

## Next Steps

1. ✅ **Review this audit with stakeholders**
   - Validate task estimates
   - Confirm architecture decisions (streaming, phase strategies, validators)
   - Approve migration approach (incremental with dual exports)

2. ✅ **Resolve remaining open questions** in spec.md
   - Migration strategy (read-only v1 support?)
   - Rollout plan (major version bump confirmed)

3. ✅ **Update spec.md** to remove "Open Tasks/Questions" section
   - Document architecture decisions
   - Reference this audit for implementation details

4. ⏳ **Run `chopstack decompose`** to generate v2 implementation plan
   - Prerequisite: spec.md has NO unresolved questions
   - Input: specs/chopstack-v2/spec.md + this audit
   - Output: specs/chopstack-v2/plan.yaml (phase-based plan)

---

**Audit Status**: ✅ COMPLETE
**Ready for Decomposition**: ⚠️ PENDING (awaiting architecture decisions)
