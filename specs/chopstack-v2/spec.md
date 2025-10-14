# Specification: Chopstack v2.0.0 - Phase-Based Task Decomposition

**Status**: Draft
**Created**: 2025-10-09
**Epic**: Chopstack v2.0.0
**Related Issues**: SNU-120, SNU-121

## Overview

Transform chopstack from a basic task decomposition tool into an intelligent, specification-driven workflow system that combines spec-kit's specification expansion with chopstack's parallel execution capabilities.

**No backward compatibility.** Clean v2 rebuild.

## Problem Statement

### Current State (v1)

Chopstack v1 works for simple decomposition but fails on complex features:

**Issues:**
- Brief prompts ("add dark mode") produce poor quality task breakdowns
- 3-5 file conflicts per plan, 40% first-attempt success rate
- Flat task lists with no logical grouping or execution phases
- No validation, acceptance criteria, or success metrics
- High retry rate due to conflicts and missing context

**Root Cause:** Agents receive minimal context → make poor decisions → conflicts and failures

### Desired State (v2)

Chopstack v2 combines the best of spec-kit and chopstack:

- **Rich specifications** - Transform brief intent into comprehensive specs with codebase analysis
- **Phase-based planning** - Organize tasks into logical phases (setup → implementation → polish)
- **Intelligent execution** - Context-aware parallel execution with zero conflicts
- **Validation framework** - Verify implementation against acceptance criteria and project principles

**Goals:**
- Reduce file conflicts to <1 per plan (70% reduction)
- Achieve 80% first-attempt success rate (100% improvement)
- Plans follow correct architectural ordering (DB → API → UI)

## Requirements

### 1. Specification Expansion (`chopstack specify`)

**Transform brief descriptions into rich, structured specifications.**

Input: `chopstack specify "add dark mode"`

Output: `dark-mode.md` containing:
- Overview & background with codebase analysis
- Functional requirements (FR1, FR2, FR3...)
- Non-functional requirements (performance, security...)
- Architecture diagrams (ASCII)
- Component specifications
- Acceptance criteria
- Success metrics (quantitative + qualitative)

**Why:** Agents need rich context to make good decisions about task structure and dependencies.

### 2. Specification Analysis (`chopstack analyze`)

**Validate specification completeness and resolve open questions before decomposition.**

Input: `chopstack analyze --spec dark-mode.md --codebase dark-mode-impl.md`

Output: `gap-report.md` containing:
- Gap categorization (CRITICAL, HIGH, MEDIUM, LOW)
- Missing components, types, interfaces
- Incomplete sections
- **Open questions requiring resolution** (audits, architecture decisions, scope clarifications)
- Cross-artifact findings (duplication, ambiguity, inconsistency)
- Completeness score (0-100%)
- Prioritized remediation steps

**Why:** Catch specification gaps and identify open questions BEFORE decomposition to avoid incomplete task generation. Prevents the "garbage in, garbage out" problem where incomplete specs produce poor task breakdowns.

**Critical Requirement:** All open questions and required audits identified during analysis MUST be resolved before running `chopstack decompose`. Document open questions in spec "Open Tasks/Questions" section and resolve them to prevent plan expansion during execution.

### 3. Phase-Based Planning (`chopstack decompose`)

**Decompose specifications into phase-organized task DAGs with automatic quality validation.**

**PREREQUISITE GATE:** `chopstack decompose` MUST verify that the specification has NO unresolved open questions before proceeding. If the spec contains an "Open Tasks/Questions" section with unresolved items, decomposition is BLOCKED until all questions are resolved.

**Gate Check Process:**
1. Parse spec for "Open Tasks/Questions" section
2. If section exists with unresolved items → ERROR: "Cannot decompose until open questions resolved"
3. If section is empty or absent → Proceed with decomposition
4. User must resolve questions, remove from spec, and re-run analyze before decompose

Input: `chopstack decompose --spec dark-mode.md`

Output: `dark-mode.plan.yaml` with:

```yaml
phases:
  - id: setup
    strategy: sequential
    tasks: [create-types, create-context]

  - id: implementation
    strategy: parallel
    requires: [setup]
    tasks: [theme-provider, toggle-button, update-styles]

  - id: polish
    strategy: sequential
    requires: [implementation]
    tasks: [add-tests, update-docs]

tasks:
  - id: create-types
    name: Create Theme Types
    complexity: S  # Small, well-defined task (1-2 hours)
    description: |
      Define TypeScript types for theme system.
      Why: All theme features depend on these type definitions.
    files: [src/types/theme.ts]
    acceptance_criteria:
      - Types exported for light/dark/system modes
      - ThemeContext type defined
    dependencies: []

success_metrics:
  quantitative:
    - Test coverage: 100% for theme components
    - Performance: <50ms theme switch time
  qualitative:
    - Smooth visual transitions
    - Accessible theme controls (ARIA)
```

**Why:** Phase organization provides clear execution flow and enables intelligent parallel/sequential decisions.

**Task Complexity System (T-Shirt Sizes):**

Tasks use t-shirt sizes (XS | S | M | L | XL) instead of hour estimates:

```yaml
complexity: M  # Medium task (2-4 hours typical)
```

**Size Guidelines:**
- **XS** (< 1 hour): Too small → Fold into related task
- **S** (1-2 hours): Small, well-defined → Good for quick wins
- **M** (2-4 hours): Sweet spot → Target size for most tasks
- **L** (4-8 hours): Large but manageable → Use sparingly
- **XL** (> 8 hours): Too large → Must be split

**Task Quality Validation (Post-Generation Guardrails):**

**CRITICAL:** After generating the plan, `chopstack decompose` MUST validate task quality before allowing execution. This catches oversized tasks and quality issues that would cause plan expansion during implementation.

Automatic validation runs immediately after plan generation:

```
🔍 Analyzing task quality...

📊 Task Quality Report

Summary: 1 critical, 2 high, 0 medium, 0 low

⚠️  BLOCKING ISSUES FOUND - Plan may fail during execution

📋 Task: migrate-core-services
  🔴 [CRITICAL] Task is XL complexity. Tasks this large often expand during execution.
     💡 Break this task into 3-4 smaller tasks (M or L size) with clear dependencies.
  🟠 [HIGH] Task has vague file patterns: src/services/**/*.ts
     💡 Specify exact file paths instead of wildcards. Vague patterns make tasks hard to scope.
  🟠 [HIGH] Migration tasks are often underestimated. This task appears large.
     💡 Break migration into module-specific tasks rather than one large task.
```

**Quality Guardrails:**
- ❌ **Critical**: XL tasks (MUST split before execution)
- ⚠️ **High**: L tasks (consider splitting if possible)
- ⚠️ **High**: Tasks touching > 10 files (too complex)
- ⚠️ **High**: Vague file patterns like `src/**/*.ts` (undefined scope)
- ⚠️ **Medium**: Too many XS tasks (fold into related tasks)
- ⚠️ **Medium**: Short descriptions < 50 chars (ambiguous)
- ⚠️ **Low**: Complex tasks with no dependencies (missing prerequisites?)

**Required Action:** If CRITICAL or HIGH issues are found, the user MUST refine the plan before execution. The validation report provides actionable suggestions for splitting oversized tasks and improving task quality.

**Benefits:**
- Catch problematic tasks AFTER generation, BEFORE execution
- Prevent "surprise expansion" during implementation (e.g., 20h task becoming 40h)
- Enforce appropriate task granularity (M-sized tasks preferred)
- Identify vague specifications that need clarification

### 4. Context-Aware Execution (`chopstack run`)

**Execute phases with full specification context.**

Command: `chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md`

Execution:
1. Parse phase DAG (setup → implementation → polish)
2. Execute setup phase sequentially (types, then context)
3. Execute implementation phase in parallel (3 worktrees)
4. Execute polish phase sequentially (tests, then docs)
5. Pass full spec to every agent execution for context

**Why:** Agents with full specification context make architecturally correct decisions.

### 5. Validation Mode (`chopstack run --validate`)

**Verify implementation against acceptance criteria and project principles.**

Features:
- **Acceptance Criteria Validation** - Agent checks each criterion
- **Success Metrics Assessment** - Verify quantitative and qualitative goals
- **Cross-Artifact Analysis** - Detect requirement gaps, duplication, ambiguity
- **Project Principles Validation** - Extract principles from CLAUDE.md, .cursorrules, etc. and verify compliance
- **Comprehensive Report** - Criteria passed/failed, metric scores, violations, next steps with priorities

**Why:** Automated validation catches issues before PR review.

### 6. Enhanced TUI

**Visualize phase-based execution.**

Features:
- Phase tree view (collapsible sections)
- Progress bars per phase
- Strategy indicators (sequential/parallel icons)
- Animated phase transitions
- Real-time status updates

**Why:** Humans need to understand execution flow at a glance.

## Success Criteria

### Must Have
- ✅ `chopstack specify` generates rich specs from brief prompts
- ✅ Codebase analyzer provides architectural context
- ✅ `chopstack analyze` validates spec completeness with gap detection
- ✅ Analysis reports categorize gaps by severity (CRITICAL/HIGH/MEDIUM/LOW)
- ✅ Analysis identifies open questions requiring resolution before decompose
- ✅ `chopstack decompose` blocks if spec has unresolved "Open Tasks/Questions"
- ✅ `chopstack decompose` validates task quality post-generation
- ✅ `chopstack decompose` produces phase-based plans with quality guarantees
- ✅ Plans have <1 file conflict (baseline: ~3)
- ✅ 80% first-attempt success rate (baseline: 40%)
- ✅ Execution engine respects phases correctly
- ✅ TUI displays phases clearly
- ✅ Validation mode checks criteria and metrics

### Performance Targets
- Specification generation: <30s
- Specification analysis: <10s
- Decomposition: <60s
- Phase transition overhead: <500ms
- TUI rendering: 60fps

### Quality Targets
- Test coverage: 95% average
- Zero `any` types in production code
- All ESLint checks pass
- Plans follow DB → API → UI ordering

## Success Metrics

### Quantitative
- **Conflict Reduction**: <1 conflict per plan (70% reduction)
- **Success Rate**: 80% first-attempt (100% improvement)
- **Retry Reduction**: 60% fewer retries
- **Specification Quality**: 1000+ line specs from brief prompts

### Qualitative
- **Architectural Awareness**: Plans follow correct layered ordering
- **Task Quality**: Descriptions explain "why" not just "what"
- **Dependency Logic**: Minimal, logical dependencies only
- **Phase Clarity**: Execution flow is immediately understandable
- **Validation Usefulness**: Reports are actionable with clear next steps

## User Workflow

```bash
# 1. Generate rich specification
chopstack specify "add dark mode" --output dark-mode.md

# 2. Review and edit specification if needed
# (edit dark-mode.md)

# 3. Analyze specification for completeness and identify open questions
chopstack analyze --spec dark-mode.md
# Output: Completeness: 60% - 3 CRITICAL gaps, 2 HIGH priority gaps
#         Open Questions: 2 (codebase audit needed, architecture decision)

# 4. Fix identified gaps and resolve ALL open questions
# CRITICAL: Document open questions in spec "Open Tasks/Questions" section
# Complete any required audits (e.g., count affected files, estimate complexity)
# (edit dark-mode.md based on analysis report)

# 5. Re-analyze until 100% complete with no open questions
chopstack analyze --spec dark-mode.md
# Output: Completeness: 100% - Ready for decomposition ✓
#         Open Questions: 0 ✓

# 6. Decompose into phase-based plan (with prerequisite gate check)
chopstack decompose --spec dark-mode.md --output dark-mode.plan.yaml
# First: Gate check for unresolved open questions
# ✓ No unresolved questions in spec → Proceeding with decomposition
# Then: Automatic quality validation runs on generated plan
# Output: 📊 Task Quality Report - 0 critical, 0 high issues ✓
#         Plan is ready for execution

# 7. If quality issues found, refine the plan
# CRITICAL: Fix any XL tasks or HIGH/CRITICAL issues before execution
# The quality report provides specific suggestions for splitting tasks
# (edit dark-mode.plan.yaml if validation found issues)

# 8. Execute with context injection (only after quality validation passes)
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md

# 9. Validate implementation against acceptance criteria
chopstack run --plan dark-mode.plan.yaml --validate
```

**Key Process Gates:**

1. **Analyze Phase**: Resolve ALL open questions before decompose
   - Document audits in spec "Open Tasks/Questions"
   - Complete audits to inform task granularity
   - Re-analyze until 100% complete
   - **GATE**: Open Questions = 0 ✓

2. **Decompose Phase**: Two-step validation
   - **Pre-Generation Gate**: Check spec for unresolved open questions
     - If "Open Tasks/Questions" section exists → BLOCK decomposition
     - User must resolve and remove from spec first
   - **Post-Generation Validation**: Quality check on generated plan
     - Automatic quality checks run on generated plan
     - Fix CRITICAL/HIGH issues before execution
     - Refine oversized tasks (XL → multiple M/L tasks)
   - **GATE**: No open questions + Quality validated ✓

3. **Execute Phase**: Run only after both gates passed
   - All open questions resolved ✓
   - Task quality validated ✓
   - No XL tasks in plan ✓

## Open Tasks/Questions

These items must be resolved before generating the final execution plan:

### Codebase Audit Required

Before decomposing the v2 implementation, we need to audit v1 type usage:

**Audit Tasks:**
1. **Count v1 Type Imports**: Use grep/ripgrep to find all imports from `src/types/decomposer.ts`
2. **Categorize by Module**: Group affected files by module (agents, parsers, execution, UI, CLI, tests)
3. **Map Field Changes**: Document all field renames and breaking changes
   - `title` → `name`
   - `touches` + `produces` → `files`
   - `requires` → `dependencies`
   - `estimatedLines` → `estimated_hours`
   - Added: `acceptance_criteria`
4. **Estimate Complexity**: Count affected files per module and estimate migration hours
5. **Identify Dependencies**: Determine which modules depend on others (e.g., mode handlers depend on execution infrastructure)

**Expected Output:**
```
Module Breakdown:
- src/agents: 3 files (~4 hours)
- src/parser: 1 file (~2 hours)
- src/utils: 2 files (~6 hours total)
- src/services/execution: 3 files (~5 hours)
- src/services/execution/modes: 3 files (~4 hours)
- src/ui: 3 files (~5 hours)
- src/commands: 3 files (~4 hours)
- tests: 8 files (~8 hours)

Total estimated migration: ~38 hours
Suggested task breakdown: 9 tasks (3-8 hours each)
```

**Why This Matters**: Without this audit, decomposition will produce oversized tasks (like the original Task 1.3.1 that expanded from 20h to 40h). The audit ensures proper task granularity and accurate estimates.

**Resolution Method**: Run audit script or manual analysis before calling `chopstack decompose`. Document findings in a separate migration analysis file that informs the decomposition.

### Architecture Questions

1. **Agent Interface Design**: Should the v2 Agent interface support streaming responses for long-running operations?
2. **Phase Strategy Extensibility**: Should v2.0 support custom phase strategies beyond sequential/parallel, or defer to future versions?
3. **Validation Framework Scope**: Should validation mode support custom validators, or only built-in acceptance criteria checks?

## Non-Goals

- ❌ Backward compatibility with v1 plans
- ❌ Support for non-phase-based plans in v2
- ❌ Migration tool (v1 → v2) - conceptual guide only
- ❌ Custom phase strategies in v2.0 (future enhancement)
- ❌ Multi-agent orchestration in v2.0 (future enhancement)

## Related Documentation

- **[codebase.md](./codebase.md)** - Architecture, components, implementation details, and context injection patterns
- **[plan.yaml](./plan.yaml)** - Phase 1 & 2 execution plan with t-shirt size complexity
- **[notes/](./notes/)** - Supplemental research and planning artifacts
  - [process-gates.md](./notes/process-gates.md) - Visual guide to the two-gate process
  - [agent-execution-guide.md](./notes/agent-execution-guide.md) - How to execute phases using agents
  - [decomposition-improvements.md](./notes/decomposition-improvements.md) - Analysis of planning issues
  - [v1-type-migration-audit.md](./notes/v1-type-migration-audit.md) - V1 type usage audit
  - [plan-original.yaml](./notes/plan-original.yaml) - Original v2 plan (680 hours, 70+ tasks)
- **Spec-Kit Research**: https://github.com/github/spec-kit
