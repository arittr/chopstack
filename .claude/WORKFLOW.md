# Chopstack v2 Workflow Guide

This document describes the complete chopstack v2 workflow using the three slash commands: `/build-spec`, `/build-plan`, and `/execute-phase`.

## Overview

Chopstack v2 uses a **three-stage, gate-protected workflow** that prevents poor quality implementations:

```
initial.md → /build-spec → spec.md + codebase.md
                              ↓
                         /build-plan (GATE 1 + GATE 2)
                              ↓
                         plan.yaml
                              ↓
                         /execute-phase
                              ↓
                         Implementation ✅
```

## The Three Commands

### 1. `/build-spec` - Specification Generation

**Purpose**: Transform brief requirements into comprehensive, context-rich specifications.

**Input**: `initial.md` (brief requirements)

**Process**:
1. Analyze initial requirements
2. Conduct codebase analysis → `codebase.md`
3. Run required audits → `notes/audit-*.md`
4. Generate comprehensive specification → `spec.md`
5. Validate specification quality

**Output**:
```
specs/{feature}/
├── spec.md              # Comprehensive specification (1000+ lines)
├── codebase.md          # Architecture and implementation context
└── notes/               # Supporting research
    ├── audit-*.md
    └── research-*.md
```

**Example**:
```bash
/build-spec @specs/dark-mode/initial.md
```

**Success Criteria**:
- ✅ Spec is 100% complete (no TODOs or placeholders)
- ✅ All requirements are specific and measurable
- ✅ Design includes detailed pseudo-code
- ✅ File paths are explicit (no wildcards)
- ✅ Acceptance criteria are verifiable
- ✅ No open questions remaining

---

### 2. `/build-plan` - Plan Generation with Quality Gates

**Purpose**: Decompose specifications into validated, execution-ready task plans.

**Input**: `spec.md` (from `/build-spec`)

**Process** (TWO GATES):

#### GATE 1: Specification Analysis
1. Analyze spec for completeness
2. Identify open questions and gaps
3. Check for required audits
4. Calculate completeness score

**GATE 1 Pass Criteria**:
- ✅ Completeness = 100%
- ✅ Open questions = 0
- ✅ No CRITICAL gaps

If GATE 1 fails → User must resolve questions and update spec

#### GATE 2: Task Quality Validation
1. Generate phase-based plan.yaml
2. Validate task complexity (no XL tasks)
3. Check file specificity (no wildcards)
4. Verify acceptance criteria
5. Analyze dependency logic

**GATE 2 Pass Criteria**:
- ✅ No XL tasks (> 8 hours)
- ✅ No vague file patterns
- ✅ Clear acceptance criteria on all tasks
- ✅ Logical dependencies only

If GATE 2 fails → User must edit plan.yaml and re-validate

**Output**:
```yaml
# specs/{feature}/plan.yaml

name: Feature Name
strategy: phased-parallel

phases:
  - id: phase-1-setup
    strategy: sequential
    tasks: [task-1-1, task-1-2]

  - id: phase-2-implementation
    strategy: parallel
    tasks: [task-2-1, task-2-2, task-2-3]

  - id: phase-3-polish
    strategy: sequential
    tasks: [task-3-1]

tasks:
  - id: task-1-1
    name: Setup Types
    complexity: M  # 2-4 hours
    files:
      - src/types/theme.ts
    acceptance_criteria:
      - Types exported for light/dark modes
      - ThemeContext type defined
```

**Example**:
```bash
/build-plan @specs/dark-mode/spec.md
```

**Success Criteria**:
- ✅ GATE 1 passed (100% spec completeness)
- ✅ GATE 2 passed (0 critical issues)
- ✅ Most tasks are M complexity (2-4 hours)
- ✅ File paths are specific
- ✅ Dependencies are minimal and logical

---

### 3. `/execute-phase` - Autonomous Phase Execution

**Purpose**: Execute plan phases using autonomous task agents with git-spice stacking.

**Input**: `plan.yaml` (from `/build-plan`) + phase ID

**Process**:
1. Read phase definition from plan.yaml
2. Verify prerequisites (clean working directory, previous phases complete)
3. Execute tasks based on strategy:
   - **Sequential**: One at a time, in order
   - **Parallel**: All tasks simultaneously
4. Each task spawns autonomous agent with:
   - Task definition from plan.yaml
   - Full spec.md for context
   - Codebase.md for patterns
   - Git-spice stacking for commits

**Task Agent Protocol**:
```
For each task:
1. Read task definition from plan.yaml
2. Read spec.md and codebase.md for context
3. Implement ONLY files in task.files
4. Follow EXACTLY task.description
5. Verify acceptance_criteria
6. Create stacked branch with: pnpm commit
7. Commit message: [{task-id}] Brief description
```

**Output**:
```
Git commits (one per task):
- [{task-1-1-setup-types}] Add theme type definitions
- [{task-2-1-theme-provider}] Implement ThemeProvider component
- [{task-2-2-toggle-button}] Add theme toggle button
...
```

**Example**:
```bash
# Execute phase 1 (sequential)
/execute-phase 1

# Execute phase 2 (parallel)
/execute-phase 2

# Execute phase 3 (sequential)
/execute-phase 3
```

**Success Criteria**:
- ✅ All tasks in phase complete
- ✅ Each task produces exactly one commit
- ✅ All acceptance criteria met
- ✅ No files modified outside task.files
- ✅ Tests pass after phase completion

---

## Complete Workflow Example

### Starting Point: Brief Idea

Create `specs/dark-mode/initial.md`:

```markdown
# Add Dark Mode

Add dark mode support to the web application with:
- Light, dark, and system preference modes
- Toggle button in header
- LocalStorage persistence
- Smooth transitions
```

### Step 1: Generate Specification

```bash
/build-spec @specs/dark-mode/initial.md
```

**Result**:
```
✅ Specification generated:
- specs/dark-mode/spec.md (1200+ lines)
- specs/dark-mode/codebase.md (architecture context)
- specs/dark-mode/notes/audit-component-structure.md
- specs/dark-mode/notes/audit-theme-usage.md

Completeness: 100% ✅
Ready for planning ✅
```

### Step 2: Generate Execution Plan

```bash
/build-plan @specs/dark-mode/spec.md
```

**GATE 1 Check**:
```
Analyzing spec.md...
- Completeness: 100% ✅
- Open questions: 0 ✅
- Required audits: All complete ✅

GATE 1: ✅ PASSED
```

**Decomposition**:
```
Generating plan...
- 3 phases defined
- 8 tasks created
- Complexity: 3 S, 4 M, 1 L
```

**GATE 2 Check**:
```
Validating task quality...
- XL tasks: 0 ✅
- Vague file patterns: 0 ✅
- Missing criteria: 0 ✅
- Oversized tasks: 0 ✅

GATE 2: ✅ PASSED
```

**Result**:
```
✅ Plan generated: specs/dark-mode/plan.yaml

Phases:
- Phase 1 (sequential): 2 tasks (setup)
- Phase 2 (parallel): 4 tasks (implementation)
- Phase 3 (sequential): 2 tasks (polish)

Ready for execution ✅
```

### Step 3: Execute Phases

```bash
# Phase 1: Setup (sequential)
/execute-phase 1
```

**Result**:
```
Phase 1: Foundation
├─ task-1-1-create-types ✅ (2 hours)
│  └─ Commit: [task-1-1-create-types] Add theme type definitions
└─ task-1-2-create-context ✅ (2 hours)
   └─ Commit: [task-1-2-create-context] Create ThemeContext and provider

Phase 1 Complete ✅ (4 hours)
```

```bash
# Phase 2: Implementation (parallel - all at once)
/execute-phase 2
```

**Result**:
```
Phase 2: Implementation (parallel)
├─ task-2-1-theme-provider ✅ (3 hours)
│  └─ Commit: [task-2-1-theme-provider] Implement ThemeProvider
├─ task-2-2-toggle-button ✅ (2 hours)
│  └─ Commit: [task-2-2-toggle-button] Add theme toggle button
├─ task-2-3-update-components ✅ (4 hours)
│  └─ Commit: [task-2-3-update-components] Update components for themes
└─ task-2-4-add-styles ✅ (3 hours)
   └─ Commit: [task-2-4-add-styles] Add dark mode styles

Phase 2 Complete ✅ (4 hours wall time, 12 hours total)
```

```bash
# Phase 3: Polish (sequential)
/execute-phase 3
```

**Result**:
```
Phase 3: Polish
├─ task-3-1-add-tests ✅ (3 hours)
│  └─ Commit: [task-3-1-add-tests] Add comprehensive theme tests
└─ task-3-2-update-docs ✅ (1 hour)
   └─ Commit: [task-3-2-update-docs] Update documentation

Phase 3 Complete ✅ (4 hours)
```

### Final Result

```
✅ Dark Mode Implementation Complete

Total Time:
- Wall time: 12 hours (with parallelization)
- Developer time: 20 hours (if done serially)
- Time saved: 8 hours (40% reduction)

Commits:
- 8 clean, reviewable commits
- Each commit is a logical unit
- Ready for git-spice stack review

Quality:
- All acceptance criteria met ✅
- All tests passing ✅
- Zero file conflicts ✅
- Follows project patterns ✅
```

---

## Process Gates Explained

### Why Two Gates?

**GATE 1 (Analysis)**: Prevents garbage in
- Catches incomplete specs BEFORE decomposition
- Forces resolution of open questions upfront
- Ensures audits are complete before task sizing
- **Prevents**: "Surprise expansion" during execution

**GATE 2 (Quality)**: Prevents garbage out
- Catches oversized tasks AFTER generation
- Identifies vague specifications before execution
- Enforces task granularity standards (M-sized preferred)
- **Prevents**: XL tasks expanding from 20h → 40h during execution

### Gate Failure Examples

**GATE 1 Failure**:
```
❌ GATE 1 BLOCKED

Spec completeness: 60%
Open questions: 3

Required Audits:
1. Count existing theme code → NOT DONE
2. Measure current bundle size → NOT DONE

Must resolve before decomposition.
```

**GATE 2 Failure**:
```
❌ GATE 2 BLOCKED

Critical Issues: 2

Task: migrate-all-components
- 🔴 XL complexity (20+ hours)
- 🔴 Vague file pattern: src/**/*.tsx

Must split task before execution.
```

---

## Best Practices

### 1. Start with Clear Initial Requirements

**Good** initial.md:
```markdown
# Add Authentication

Implement JWT-based authentication with:
- Login/register pages
- Protected routes
- Token refresh logic
- Logout functionality
- Must integrate with existing Express backend
```

**Bad** initial.md:
```markdown
# Auth

Add auth to the app.
```

### 2. Review Generated Spec Before Planning

After `/build-spec`:
- ✅ Check that requirements match your intent
- ✅ Verify codebase.md has correct integration points
- ✅ Review audit findings for completeness
- ✅ Edit spec.md if needed before `/build-plan`

### 3. Fix Gate Failures Properly

If GATE 1 fails:
- ✅ Complete all required audits
- ✅ Resolve ALL open questions
- ✅ Update spec.md with findings
- ✅ Re-run `/build-plan`

If GATE 2 fails:
- ✅ Split XL tasks into M-sized tasks
- ✅ Make file paths specific
- ✅ Add missing acceptance criteria
- ✅ Edit plan.yaml directly
- ✅ Re-run `/build-plan` (skips to validation)

### 4. Execute Phases in Order

- ✅ Always execute phases sequentially (1 → 2 → 3)
- ✅ Verify phase completion before moving to next
- ✅ Run tests between phases
- ✅ Use git-spice stack for review after all phases

### 5. Monitor Task Agents

During `/execute-phase`:
- ✅ Watch for agents asking questions (GATE 1 failure)
- ✅ Watch for scope expansion (GATE 2 failure)
- ✅ Ensure each task produces exactly one commit
- ✅ Verify acceptance criteria are met

---

## Command Reference

```bash
# 1. Generate specification
/build-spec @specs/{feature}/initial.md

# 2. Generate plan (with gates)
/build-plan @specs/{feature}/spec.md

# 3. Execute phases
/execute-phase 1  # Phase 1 (setup)
/execute-phase 2  # Phase 2 (implementation)
/execute-phase 3  # Phase 3 (polish)
```

---

## Success Metrics

With the three-command workflow:

**Quality Improvements**:
- 📉 File conflicts: 3-5 per plan → <1 per plan (70% reduction)
- 📈 First-attempt success: 40% → 80% (100% improvement)
- 📉 Retry rate: High → 60% fewer retries
- 📈 Spec quality: Brief prompts → 1000+ line specs

**Time Savings**:
- ⚡ Parallel execution: 40% time reduction
- ⚡ Fewer retries: 30% time reduction
- ⚡ Total: ~50% faster implementation

**Process Benefits**:
- ✅ Architectural awareness (DB → API → UI ordering)
- ✅ Task quality (descriptions explain "why")
- ✅ Minimal dependencies (logical only)
- ✅ Clear execution flow (phases visible)

---

## Troubleshooting

### "Initial requirements too vague"

**Solution**: Add more detail to initial.md:
- Specific features required
- Technology preferences
- Integration points
- Success criteria

### "GATE 1 blocked - open questions"

**Solution**:
1. Review open questions in analysis report
2. Complete required audits
3. Make architecture decisions
4. Update spec.md with findings
5. Re-run `/build-plan`

### "GATE 2 blocked - XL tasks"

**Solution**:
1. Edit plan.yaml directly
2. Split XL task into 3-4 M-sized tasks
3. Update dependencies
4. Re-run `/build-plan` (will skip to validation)

### "Agent asked questions during execution"

**Problem**: GATE 1 failure - spec had unresolved questions

**Solution**:
1. Stop execution
2. Add question to spec.md "Open Questions"
3. Resolve the question
4. Update spec.md
5. Re-run `/build-plan` and `/execute-phase`

### "Agent modified files outside task.files"

**Problem**: GATE 2 failure - task scope too large or vague

**Solution**:
1. Stop execution
2. Review task in plan.yaml
3. Split task into smaller, focused tasks
4. Update plan.yaml
5. Re-run `/execute-phase`

---

## Related Documentation

- `/build-spec` command: `.claude/commands/build-spec.md`
- `/build-plan` command: `.claude/commands/build-plan.md`
- `/execute-phase` command: `.claude/commands/execute-phase.md`
- Sample specifications: `docs/sample-specs-v2/`
- Chopstack v2 spec: `specs/chopstack-v2_phase2/spec.md`
