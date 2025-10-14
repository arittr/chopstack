# Chopstack v2 Plan Decomposition Improvements

## Problems Identified

### 1. Task 1.3.1 Was Too Large

**Original Task** (`task-1-3-1-migrate-core-services-to-v2-types`):
- Estimated: 20 hours
- Actual expanded work: 40+ hours (9+ distinct subtasks)
- **Problem**: "Migrate Core Services" is too vague and hides massive complexity

**What it claimed to do**:
- Update imports from decomposer.ts to schemas-v2.ts
- Refactor to use new type names
- Update Zod validations
- Fix type errors

**What it actually required**:
1. Update all agent implementations (Claude, Mock, Codex) - 4 hours
2. Update YAML parser - 3 hours
3. Update AgentValidator - 3 hours
4. Update DagValidator - 3 hours
5. Update PlanOutputter - 3 hours
6. Update execution orchestrator & engine - 5 hours
7. Update mode handlers - 4 hours
8. Comment out/update 8 test files - 8 hours
9. Update TUI components - 5 hours

**Total**: ~38 hours (not 20!)

### 2. Confusing Phase Structure

**Problem**: Tasks appear in multiple places, creating confusion about execution order.

**Example from current plan**:
```yaml
- id: phase-2-spec-expansion-analysis
  tasks:
    [
      task-2-1-1-create-template-engine,
      task-2-1-2-create-markdown-parser-utilities,
      task-2-2-1-implement-codebase-analyzer,
      # ... ALL 12 tasks listed here
    ]

# Then defines SEPARATE track phases:
- id: phase-2-track-a-codebase
  tasks: [task-2-2-1-implement-codebase-analyzer, ...]  # Same task again!
  requires: [phase-2-spec-expansion-analysis]
```

**Issue**: Does `task-2-2-1` belong to `phase-2-spec-expansion-analysis` OR `phase-2-track-a`? Unclear!

### 3. Type Migration Mixed With Foundation

**Problem**: Phase 1 mixes:
- Creating new types (foundation)
- Auditing old types (analysis)
- Migrating entire codebase (HUGE work)
- Testing (validation)

**Better structure**: Separate concerns into distinct phases:
1. **Phase 1**: Foundation only (create schemas, interfaces)
2. **Phase 2**: Type Migration (systematic module-by-module)
3. **Phase 3**: Validation & Cleanup

## Solutions

### Solution 1: Break Down Task 1.3.1 Into Separate Tasks

**New Phase 2 Structure: Type Migration**

```yaml
- id: task-2-1-migrate-agent-implementations
  name: Migrate Agent Implementations to v2
  estimated_hours: 4
  files:
    - src/agents/claude-agent.ts
    - src/agents/mock-agent.ts
    - src/agents/codex-agent.ts

- id: task-2-2-migrate-parsers-and-validators
  name: Migrate Parsers and Validators to v2
  estimated_hours: 4
  files:
    - src/parser/yaml-parser.ts
    - src/utils/agent-validator.ts
    - src/utils/dag-validator.ts

- id: task-2-3-migrate-plan-outputter
  name: Migrate Plan Outputter to v2
  estimated_hours: 3
  files:
    - src/utils/plan-outputter.ts

- id: task-2-4-migrate-execution-infrastructure
  name: Migrate Execution Orchestrator and Engine
  estimated_hours: 5
  files:
    - src/services/orchestration/execution-orchestrator.ts
    - src/services/execution/execution-engine.ts

- id: task-2-5-migrate-mode-handlers
  name: Migrate Mode Handlers to v2
  estimated_hours: 4
  dependencies: [task-2-4-migrate-execution-infrastructure]
  files:
    - src/services/execution/modes/plan-mode-handler.ts
    - src/services/execution/modes/execute-mode-handler.ts
    - src/services/execution/modes/validate-mode-handler.ts

- id: task-2-6-migrate-tui-components
  name: Migrate TUI Components to v2
  estimated_hours: 5
  dependencies: [task-2-4-migrate-execution-infrastructure]
  files:
    - src/ui/components/StatusPanel.tsx
    - src/ui/components/ExecutionView.tsx
    - src/ui/phase-tui.ts

- id: task-2-7-migrate-cli-commands
  name: Migrate CLI Commands to v2
  estimated_hours: 4
  dependencies: [task-2-4-migrate-execution-infrastructure]
  files:
    - src/commands/**/*.ts

- id: task-2-8-update-test-files
  name: Update Test Files for v2 Types
  estimated_hours: 8
  dependencies:
    - task-2-5-migrate-mode-handlers
    - task-2-6-migrate-tui-components
  files:
    - src/**/__tests__/**/*.test.ts
    - test/e2e/**/*.test.ts

- id: task-2-9-validation-and-cleanup
  name: Type Migration Validation and Cleanup
  estimated_hours: 4
  dependencies: [task-2-8-update-test-files]
```

**Benefits**:
- Each task is 3-8 hours (manageable)
- Clear file ownership
- Explicit dependencies
- Can parallelize tasks 2-1, 2-2, 2-3 after foundation
- Can parallelize tasks 2-5, 2-6, 2-7 after 2-4

### Solution 2: Clean Phase Hierarchy

**Pattern to follow** (from `type-safety-refactor.plan.yaml`):

```yaml
phases:
  - id: phase-1-foundation
    strategy: sequential
    tasks: [task-1-core-schema]  # Only foundation tasks

  - id: phase-2-migration-prework
    strategy: parallel
    tasks: [task-2-1-agents, task-2-2-parsers, task-2-3-outputter]
    requires: [phase-1-foundation]

  - id: phase-2-migration-infrastructure
    strategy: sequential
    tasks: [task-2-4-execution]  # Must complete before handlers
    requires: [phase-2-migration-prework]

  - id: phase-2-migration-parallel
    strategy: parallel
    tasks: [task-2-5-handlers, task-2-6-tui, task-2-7-cli]
    requires: [phase-2-migration-infrastructure]

  - id: phase-2-migration-finalize
    strategy: sequential
    tasks: [task-2-8-tests, task-2-9-validation]
    requires: [phase-2-migration-parallel]
```

**Key principles**:
- Each task appears in **exactly one phase**
- No duplication between phase task lists
- Clear progression: prework → infrastructure → parallel → finalize
- Simple `requires` dependencies between phases

### Solution 3: Move Audits to Spec Creation

**Problem**: Task 1.4 (audit-v1-type-usage) was included as an execution task, but audits should inform planning, not be part of execution.

**User Guidance**:
> "if we need to audit we should do that during the creation of @specs/chopstack-v2/spec.md - @specs/chopstack-v2/plan-improved-phase-1-2.yaml should not require updating or expanding as much as possible. if the model detects an audit is needed, we should have an open tasks/questions section in @specs/chopstack-v2/spec.md that needs to be resolved before the planning"

**Solution**:
- Added "Open Tasks/Questions" section to spec.md
- Documents required audit work as prerequisite
- Removed task-1-4-audit-v1-type-usage from execution plan
- Audit findings inform task decomposition but aren't part of it

**Benefits**:
- Plans don't expand during execution
- Audit work is completed upfront
- Task estimates are more accurate
- Clear separation between planning prerequisites and execution tasks

### Solution 4: Add Task Quality Validation (NEW FEATURE)

Add automatic detection of oversized tasks during `chopstack decompose`:

**New feature**: `TaskQualityValidator` that checks:
- ❌ Tasks > 8 hours (CRITICAL: likely to expand)
- ❌ Tasks touching > 10 files (HIGH: too complex)
- ❌ Vague file patterns like `src/**/*.ts` (HIGH: undefined scope)
- ⚠️  Tasks 6-8 hours (MEDIUM: consider splitting)
- ⚠️  Short descriptions < 50 chars (MEDIUM: ambiguous)
- ⚠️  Migration tasks without breakdown (HIGH: inherently large)

**Integration point**: `chopstack decompose` command runs quality checks and warns:
```
🔍 Analyzing task quality...

📊 Task Quality Report

Summary: 1 critical, 2 high, 0 medium, 0 low

⚠️  BLOCKING ISSUES FOUND - Plan may fail during execution

📋 Task: task-1-3-1-migrate-core-services-to-v2-types
  🔴 [CRITICAL] Task is oversized (~20 hours). Tasks over 8 hours often expand during execution.
     💡 Break this task into 3 smaller tasks (3-4 hours each) with clear dependencies.
  🟠 [HIGH] Task has vague file patterns: src/services/**/*.ts, src/commands/**/*.ts
     💡 Specify exact file paths instead of wildcards. Vague patterns make tasks hard to scope.
  🟠 [HIGH] Migration/refactor tasks are often underestimated. This task appears large.
     💡 Break migration into module-specific tasks (e.g., "Migrate Agent Implementations",
         "Migrate Mode Handlers") rather than one large task.

⚠️  Plan has quality issues that may cause problems during execution.
   Consider refining the decomposition before running the plan.
```

## Lessons Learned

### For Future Decomposition:

1. **Before Spec Creation (Prerequisites)**:
   - Identify what audits are needed
   - Document audit requirements in spec "Open Tasks/Questions" section
   - Complete audits before decomposition
   - Audit findings inform task breakdown and estimates

2. **During Spec Creation**:
   - Count imports from old types → estimate migration complexity
   - Map field changes and breaking changes
   - Categorize affected files by module
   - Estimate complexity per module
   - Resolve all open questions before decomposition

3. **During Decomposition (`chopstack decompose`)**:
   - Enforce: each task in exactly ONE phase
   - Detect vague file patterns (wildcards)
   - Validate task sizes upfront with TaskQualityValidator
   - Use audit findings to inform task granularity
   - Break migrations by module, not by "all services"

4. **Migration Pattern**:
   - Any "migration" deserves its own phase
   - Break by modules, not by "all services"
   - Parallel tracks where possible
   - Dependencies explicit (e.g., mode handlers depend on execution infrastructure)

5. **Task Complexity Guidelines (T-Shirt Sizes)**:
   - XS (< 1h): Fold into related task (too small standalone)
   - S (1-2h): Good for quick wins
   - M (2-4h): **TARGET** - Sweet spot for most tasks
   - L (4-8h): Use sparingly, consider splitting
   - XL (> 8h): **MUST SPLIT** - Will expand during execution
   - Max files: 10 per task (regardless of complexity)

## Implementation Status

✅ **Completed**:
- TaskQualityValidator implemented (`src/validation/task-quality-validator.ts`)
- Comprehensive test suite (17 tests, all passing)
- Integration into decompose command
- Quality report formatting

⏳ **Next Steps**:
1. Update `specs/chopstack-v2/plan.yaml` with improved structure
2. Replace Phase 1 with separated foundation/migration phases
3. Break down Task 1.3.1 into 9 tasks
4. Clean up duplicate phase task listings
5. Document the new validation feature in spec.md
