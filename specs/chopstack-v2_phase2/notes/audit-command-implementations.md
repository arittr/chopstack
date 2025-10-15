# Audit: Command Implementation Status

**Date**: 2025-10-14
**Purpose**: Identify existing commands vs v2 requirements
**Related Spec**: chopstack-v2_phase2
**Auditor**: Claude Code (Audit Agent)

## Audit Scope

Audit all command implementations in `src/commands/` to determine what exists, what works, and what needs to be built for chopstack v2.

## Methodology

1. List all files in `src/commands/`
2. Read each command file to understand functionality
3. Compare against v2 requirements from spec
4. Document gaps and required work
5. Assess complexity for each gap

## Findings

### Summary

- **Total Commands Required**: 6
- **Commands Exist**: 3 (decompose, run, stack)
- **Commands Need Creation**: 2 (specify, analyze)
- **Commands Need Enhancement**: 2 (decompose, run)

### Command Architecture

**Current Structure**:
- Command pattern with base class (`BaseCommand`)
- Dependency injection via `CommandDependencies`
- CLI dispatcher at `src/entry/cli/chopstack.ts`
- Zod-based validation for all command options (`src/types/cli.ts`)
- Command factory with decorator pattern (`@RegisterCommand`)

**Strengths**:
- Well-structured with clear separation of concerns
- Type-safe CLI argument validation
- Consistent error handling pattern
- Dependency injection for testability

**Weaknesses**:
- No commands for `specify` or `analyze` workflows
- `decompose` lacks gate checks for open questions
- `decompose` lacks post-generation quality validation
- `run` has `validate` mode in types but not implemented

---

### Detailed Findings

#### Command: `specify`

**Status**: MISSING
**File**: Does not exist
**Current Functionality**: None

**V2 Requirements**:
- Transform brief prompts into rich specifications
- Codebase analysis integration
- Generate structured markdown with:
  - Overview & background
  - Functional requirements (FR1, FR2, FR3...)
  - Non-functional requirements
  - Architecture diagrams (ASCII)
  - Component specifications
  - Acceptance criteria
  - Success metrics

**Gap**: Complete command needs to be created from scratch

**Implementation Requirements**:
1. Create `src/commands/specify/specify-command.ts`
2. Add CLI option schema to `src/types/cli.ts`:
   ```typescript
   export const SpecifyCommandOptionsSchema = z.object({
     prompt: z.string().min(1),
     output: z.string().optional(),
     targetDir: z.string().optional(),
     verbose: z.boolean().default(false),
   });
   ```
3. Add command to CLI dispatcher in `src/entry/cli/chopstack.ts`
4. Implement specification generator service
5. Integrate codebase analyzer
6. Create structured markdown template

**Dependencies**:
- Codebase analyzer service (may exist or need creation)
- Specification template system
- Agent integration for content generation

**Complexity**: **L** (4-8 hours)
- New command structure: 2h
- Specification generator: 3h
- Codebase integration: 2h
- Testing: 1h

---

#### Command: `analyze`

**Status**: MISSING
**File**: Does not exist
**Current Functionality**: None

**V2 Requirements**:
- Validate specification completeness
- Identify gaps categorized by severity (CRITICAL, HIGH, MEDIUM, LOW)
- Detect missing components, types, interfaces
- Identify incomplete sections
- **Critical**: Identify open questions requiring resolution
- Cross-artifact analysis (duplication, ambiguity, inconsistency)
- Calculate completeness score (0-100%)
- Generate prioritized remediation steps

**Gap**: Complete command needs to be created from scratch

**Implementation Requirements**:
1. Create `src/commands/analyze/analyze-command.ts`
2. Add CLI option schema to `src/types/cli.ts`:
   ```typescript
   export const AnalyzeCommandOptionsSchema = z.object({
     spec: z.string().min(1),
     codebase: z.string().optional(),
     output: z.string().optional(),
     targetDir: z.string().optional(),
     verbose: z.boolean().default(false),
   });
   ```
3. Add command to CLI dispatcher
4. Implement specification analyzer service:
   - Completeness checker
   - Gap detector with severity categorization
   - Open question identifier
   - Cross-artifact analyzer
   - Scoring algorithm
5. Generate gap report in structured format

**Dependencies**:
- Specification parser
- Gap analysis algorithms
- Report generator

**Complexity**: **L** (4-8 hours)
- New command structure: 2h
- Analyzer service core: 3h
- Gap categorization logic: 2h
- Report generation: 1h
- Testing: 1h

---

#### Command: `decompose`

**Status**: PARTIAL (exists but needs enhancements)
**File**: `/Users/drewritter/projects/chopstack-mcp/src/commands/decompose/decompose-command.ts`

**Current Functionality**:
- ✅ Reads specification file
- ✅ Creates decomposer agent
- ✅ Generates plan with retry logic
- ✅ Validates plan structure (DAG validation)
- ✅ Calculates metrics (parallelization, critical path)
- ✅ Outputs plan in JSON/YAML format
- ✅ Comprehensive error handling

**V2 Requirements** (from spec):
1. **Pre-Generation Gate**: Check spec for unresolved "Open Tasks/Questions" section
   - Parse spec for open questions section
   - Block decomposition if unresolved items exist
   - Error message: "Cannot decompose until open questions resolved"
2. **Post-Generation Quality Validation**: Automatic task quality checks
   - XL task detection (CRITICAL - must split)
   - L task warnings (HIGH - consider splitting)
   - File count validation (>10 files = too complex)
   - Vague pattern detection (`src/**/*.ts`)
   - Description length checks (<50 chars)
   - Dependency sanity checks
3. **Phase-Based Planning**: Already supported via v2 types
4. **Complexity System**: T-shirt sizes (XS, S, M, L, XL) - already in v2 types

**Gap Analysis**:

**MISSING - Pre-Generation Gate**:
- No check for "Open Tasks/Questions" section in spec
- Need spec parser to extract sections
- Need validation logic to block if unresolved items exist

**MISSING - Post-Generation Quality Validation**:
- No task quality analyzer after plan generation
- No XL/L task detection
- No file count validation
- No pattern vagueness detection
- No quality report generation

**Implementation Requirements**:
1. Add spec section parser (detect "Open Tasks/Questions")
2. Add pre-generation gate check before calling agent
3. Create task quality analyzer service:
   ```typescript
   interface TaskQualityIssue {
     taskId: string;
     severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
     message: string;
     suggestion: string;
   }

   interface TaskQualityReport {
     summary: { critical: number; high: number; medium: number; low: number };
     issues: TaskQualityIssue[];
     passed: boolean;
   }

   class TaskQualityAnalyzer {
     analyze(plan: PlanV2): TaskQualityReport;
   }
   ```
4. Integrate quality analyzer after plan generation, before output
5. Display quality report with formatting
6. Return exit code 1 if CRITICAL issues found (optional: make configurable)

**Complexity**: **M** (2-4 hours)
- Spec section parser: 1h
- Pre-generation gate: 0.5h
- Task quality analyzer: 2h
- Integration and display: 0.5h
- Testing: 1h

**Files to Modify**:
- `src/commands/decompose/decompose-command.ts` (add gates and validation)
- Create `src/services/planning/task-quality-analyzer.ts` (new service)
- Create `src/services/planning/spec-section-parser.ts` (new utility)
- Update tests

---

#### Command: `run`

**Status**: PARTIAL (exists, validate mode in types but not implemented)
**File**: `/Users/drewritter/projects/chopstack-mcp/src/commands/run/run-command.ts`

**Current Functionality**:
- ✅ Reads spec or plan file
- ✅ Generates plan from spec if needed
- ✅ Validates plan structure
- ✅ Supports multiple execution modes: `plan`, `dry-run`, `execute`
- ✅ TUI integration with phase visualization
- ✅ File logging support
- ✅ VCS mode support (simple, worktree, stacked)
- ✅ Context-aware execution with full spec injection
- ✅ Parallel task execution via ExecutionEngine

**V2 Requirements**:

**For `chopstack run`**:
- Already implements context injection (spec passed to agent)
- Already supports phase-based execution
- Already has TUI visualization

**For `chopstack run --validate`**:
- **Acceptance Criteria Validation** - Agent checks each criterion
- **Success Metrics Assessment** - Verify quantitative/qualitative goals
- **Cross-Artifact Analysis** - Detect gaps, duplication, ambiguity
- **Project Principles Validation** - Extract from CLAUDE.md, .cursorrules and verify
- **Comprehensive Report** - Criteria pass/fail, metric scores, violations, next steps

**Gap Analysis**:

**Mode Support**:
- Type system already defines `validate` mode: `ExecutionModeSchema = z.enum(['plan', 'dry-run', 'execute', 'validate'])`
- CLI already accepts `--mode validate`
- ✅ **EXISTS**: Basic validate mode handler (`src/services/execution/modes/validate-mode-handler.ts`)
- ⚠️ **LIMITATION**: Current implementation only validates PLAN structure (DAG validation), not IMPLEMENTATION quality
- **MISSING**: Implementation validation (acceptance criteria, success metrics, principles)

**Current Validate Mode Behavior**:
The existing `ValidateModeHandlerImpl` only validates the plan structure:
- ✅ DAG validation (cycles, dependencies)
- ✅ File conflict detection
- ✅ Basic structural checks
- ❌ Does NOT validate implementation against spec
- ❌ Does NOT check acceptance criteria
- ❌ Does NOT assess success metrics

**Implementation Requirements**:
1. Extend validation service (current plan validator exists, need implementation validator):
   ```typescript
   interface ValidationReport {
     acceptanceCriteria: {
       criterion: string;
       passed: boolean;
       evidence: string;
       issues?: string[];
     }[];
     successMetrics: {
       metric: string;
       target: string;
       actual: string;
       passed: boolean;
     }[];
     principleViolations: {
       principle: string;
       severity: 'HIGH' | 'MEDIUM' | 'LOW';
       location: string;
       suggestion: string;
     }[];
     crossArtifactIssues: {
       type: 'gap' | 'duplication' | 'ambiguity';
       severity: 'HIGH' | 'MEDIUM' | 'LOW';
       description: string;
       artifacts: string[];
     }[];
     overallScore: number; // 0-100
     nextSteps: string[];
   }

   class ImplementationValidator {
     async validate(
       plan: PlanV2,
       spec: string,
       workdir: string
     ): Promise<ValidationReport>;
   }
   ```
2. Add validation mode handler in ExecutionEngine
3. Create project principles extractor (parse CLAUDE.md, .cursorrules, etc.)
4. Implement acceptance criteria checker (agent-based)
5. Implement metrics assessor
6. Generate comprehensive validation report
7. Update TUI to display validation results

**Complexity**: **L** (4-8 hours)
- Implementation validator service: 3h
- Principles extractor: 1h
- Agent-based validation: 2h
- Report generation: 1h
- Integration with existing validate handler: 0.5h
- TUI integration: 0.5h
- Testing: 1h

**Files to Modify**:
- `src/services/execution/modes/validate-mode-handler.ts` (extend to include implementation validation)
- Create `src/services/validation/implementation-validator.ts` (new service)
- Create `src/services/validation/principles-extractor.ts` (new utility)
- Update TUI to show validation results
- Update tests

**Note**: The command and execution engine already support validate mode - we just need to extend the handler to include implementation validation alongside existing plan validation.

---

#### Command: `run --validate` (separate entry)

**Status**: PARTIAL (mode exists and validates plan structure, but not implementation quality)
**File**: Part of run command at `src/services/execution/modes/validate-mode-handler.ts`
**Current Functionality**:
- ✅ Validates plan structure (DAG, conflicts, cycles)
- ❌ Does NOT validate implementation against spec requirements

**V2 Requirements**: See "Command: run" section above for full requirements

**Gap**: Implementation quality validation (acceptance criteria, metrics, principles)

**Complexity**: **L** (4-8 hours) - included in `run` command enhancement above

**Key Insight**: The validate mode infrastructure exists and works - we need to ADD implementation validation to the existing plan validation, not build from scratch.

---

#### Command: `stack`

**Status**: EXISTS (fully functional, may need minor updates)
**File**: `/Users/drewritter/projects/chopstack-mcp/src/commands/stack/stack-command.ts`

**Current Functionality**:
- ✅ Git-spice integration for stacked PRs
- ✅ AI-powered commit message generation
- ✅ Automatic change detection
- ✅ Dry-run support
- ✅ Detailed error reporting
- ✅ Stack submission to GitHub

**V2 Requirements**:
- Manage git-spice stacks (already implemented)
- Integration with phase-based execution (compatibility check needed)

**Gap**: Minimal - verify compatibility with v2 phase execution

**Implementation Requirements**:
1. Test integration with v2 phase-based plans
2. Verify commit message generation works with v2 task format
3. Ensure stack creation works with worktree VCS mode
4. Minor updates if any compatibility issues found

**Complexity**: **XS** (<1 hour)
- Integration testing: 0.5h
- Minor fixes if needed: 0.5h

**Files to Modify**:
- None (unless compatibility issues found)
- Add integration tests

---

## Analysis

### Impact on Feature

The audit reveals a **partial implementation** of chopstack v2:

**Core Workflow Support**:
- ❌ **specify**: 0% complete - entire workflow missing
- ❌ **analyze**: 0% complete - entire workflow missing
- 🟡 **decompose**: 60% complete - core works, missing v2 gates
- 🟡 **run**: 85% complete - execution works, validate mode exists but incomplete
  - ✅ Plan validation mode works
  - ❌ Implementation validation missing
- ✅ **stack**: 100% complete - fully functional

**Critical Path**:
The v2 workflow is **blocked** at the first step:
1. `specify` → MISSING (cannot generate specs)
2. `analyze` → MISSING (cannot validate specs)
3. `decompose` → PARTIAL (works but no quality gates)
4. `run` → PARTIAL (executes but cannot validate)
5. `stack` → EXISTS (fully functional)

**Blockers**:
- Cannot use v2 workflow end-to-end without `specify` and `analyze`
- Quality gates missing in `decompose` risk poor plan generation
- Implementation validation missing prevents automated quality checks (plan validation works)

**Workarounds**:
- Manual spec creation (bypasses `specify`)
- Manual spec review (bypasses `analyze`)
- Manual plan review (bypasses decompose quality gates)
- Manual validation (bypasses `run --validate`)

### Complexity Implications

**Total Implementation Effort**:
- `specify` command: **L** (4-8h)
- `analyze` command: **L** (4-8h)
- `decompose` enhancements: **M** (2-4h)
- `run --validate` mode: **L** (4-8h)
- `stack` compatibility: **XS** (<1h)

**Total**: 15-29 hours for complete v2 command layer

**Task Granularity**:
Given the complexity distribution, tasks should be:
- One task per new command (`specify`, `analyze`)
- One task for `decompose` enhancements (both gates together)
- One task for `run --validate` implementation
- One task for integration testing

**Parallelization Potential**:
- `specify` and `analyze` are independent → can be parallel
- `decompose` enhancements depend on `analyze` (need spec section parser concept)
- `run --validate` is independent → can be parallel
- `stack` compatibility testing depends on all others → must be sequential

**Dependency Graph**:
```
specify (L) ────┐
                ├──> decompose-gates (M) ──┐
analyze (L) ────┘                          ├──> integration-tests (S)
                                           │
run-validate (L) ──────────────────────────┘
```

### Recommendations

#### 1. Approach to Command Implementation

**Strategy**: Incremental delivery with working subsets

**Phase 1: Enable Basic V2 Workflow** (Priority: CRITICAL)
- Create `specify` command (enables spec generation)
- Create `analyze` command (enables spec validation)
- Users can now generate and validate specs, then use existing `decompose` + `run`

**Phase 2: Add Quality Gates** (Priority: HIGH)
- Enhance `decompose` with pre/post-generation gates
- Prevents poor quality plans from being generated

**Phase 3: Add Validation** (Priority: MEDIUM)
- Implement `run --validate` mode
- Enables automated quality checks post-implementation

**Phase 4: Polish** (Priority: LOW)
- Integration testing
- Stack compatibility verification

#### 2. Code Reuse Opportunities

**Existing Infrastructure to Leverage**:
- ✅ Command pattern (`BaseCommand`, `@RegisterCommand`)
- ✅ CLI validation (`Zod` schemas in `src/types/cli.ts`)
- ✅ Agent integration (`createDecomposerAgent`)
- ✅ Plan validation (`DagValidator`)
- ✅ TUI system (for displaying reports)
- ✅ File logging (for validation reports)

**New Services Needed**:
- Specification generator
- Specification analyzer
- Task quality analyzer
- Spec section parser
- Implementation validator
- Principles extractor

**Shared Components**:
- Markdown parser/generator (both `specify` and `analyze` need this)
- Report formatter (both `analyze` and `run --validate` generate reports)
- Codebase analyzer (both `specify` and `analyze` need context)

#### 3. CLI Structure Changes

**Minimal Changes Required**:
The existing CLI structure is well-designed and extensible:
- Add new command schemas to `src/types/cli.ts`
- Add new command classes to `src/commands/`
- Register commands in `src/entry/cli/chopstack.ts`
- Export from `src/commands/index.ts`

**New Files**:
```
src/commands/
├── specify/
│   ├── specify-command.ts
│   └── __tests__/specify.integration.test.ts
├── analyze/
│   ├── analyze-command.ts
│   └── __tests__/analyze.integration.test.ts
└── ...existing commands...

src/services/
├── specification/
│   ├── spec-generator.ts
│   ├── spec-analyzer.ts
│   └── spec-section-parser.ts
├── planning/
│   ├── task-quality-analyzer.ts (new)
│   └── ...existing services...
└── validation/
    ├── implementation-validator.ts (new)
    └── principles-extractor.ts (new)
```

**No Breaking Changes**:
- Existing commands (`decompose`, `run`, `stack`) continue to work
- New commands are additive
- Enhancements to existing commands are backward compatible

## Task Implications

### Recommended Task Breakdown

Based on audit findings, suggest the following task structure:

#### Task Granularity

**4 Core Implementation Tasks** (can be partially parallel):

1. **`task-specify-command`** (L complexity, 4-8h)
   - Create specify command
   - Implement specification generator service
   - Integrate codebase analyzer
   - Dependencies: None (can start immediately)

2. **`task-analyze-command`** (L complexity, 4-8h)
   - Create analyze command
   - Implement specification analyzer service
   - Add gap detection and categorization
   - Dependencies: None (can start immediately, parallel with task 1)

3. **`task-decompose-quality-gates`** (M complexity, 2-4h)
   - Add pre-generation gate (open questions check)
   - Add post-generation validation (task quality)
   - Create task quality analyzer service
   - Dependencies: task-analyze-command (needs spec section parser concept)

4. **`task-run-validate-mode`** (L complexity, 4-8h)
   - Implement validation mode in execution engine
   - Create implementation validator service
   - Add principles extractor
   - Generate comprehensive reports
   - Dependencies: None (can start immediately, parallel with tasks 1-2)

**1 Integration Task** (sequential, after all others):

5. **`task-v2-integration-tests`** (S complexity, 1-2h)
   - End-to-end workflow tests
   - Stack compatibility verification
   - Cross-command integration tests
   - Dependencies: All previous tasks

#### Dependency Relationships

```yaml
tasks:
  - id: task-specify-command
    complexity: L
    dependencies: []

  - id: task-analyze-command
    complexity: L
    dependencies: []

  - id: task-decompose-quality-gates
    complexity: M
    dependencies: [task-analyze-command]

  - id: task-run-validate-mode
    complexity: L
    dependencies: []

  - id: task-v2-integration-tests
    complexity: S
    dependencies: [
      task-specify-command,
      task-analyze-command,
      task-decompose-quality-gates,
      task-run-validate-mode
    ]
```

#### Parallelization Strategy

**Phase 1: Parallel Foundation** (3 tasks in parallel)
- `task-specify-command`
- `task-analyze-command`
- `task-run-validate-mode`

**Phase 2: Sequential Enhancement** (1 task, depends on analyze)
- `task-decompose-quality-gates`

**Phase 3: Integration** (1 task, depends on all)
- `task-v2-integration-tests`

**Maximum Parallelization**: 3 concurrent tasks
**Critical Path**: task-analyze-command → task-decompose-quality-gates → task-v2-integration-tests

#### Estimated Complexity

**Total Complexity**:
- 3 Large tasks (specify, analyze, run-validate): 12-24h
- 1 Medium task (decompose-gates): 2-4h
- 1 Small task (integration-tests): 1-2h
- **Total**: 15-30h

**Complexity Distribution**:
- L tasks: 3 (60% of work)
- M tasks: 1 (15% of work)
- S tasks: 1 (5% of work)
- XS tasks: 0

**Risk Assessment**:
- **Low Risk**: Existing command pattern is well-established
- **Medium Risk**: New services (spec generator, analyzer) need design
- **Low Risk**: CLI integration follows existing patterns

## Conclusion

The command layer audit reveals that chopstack v2 has a **solid foundation** but is **missing critical workflow commands**:

**Strengths**:
- Well-architected command pattern
- Strong existing commands (run, decompose, stack)
- Extensible CLI structure

**Gaps**:
- No `specify` or `analyze` commands (blocks v2 workflow)
- Missing quality gates in `decompose`
- Validation mode not implemented in `run`

**Path Forward**:
1. Implement `specify` and `analyze` commands in parallel (Phase 1)
2. Add quality gates to `decompose` (Phase 2)
3. Implement `run --validate` mode in parallel with Phase 1-2
4. Integration testing (Phase 3)

**Estimated Effort**: 15-30 hours total
**Recommended Approach**: 5 tasks with 3-way parallelization in Phase 1

The command layer is **ready for implementation** with clear task boundaries and minimal risk.
