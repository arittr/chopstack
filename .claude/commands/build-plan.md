---
description: Build a new plan.yaml from spec following chopstack v2 process gates
---

ROLE: You are a plan generation orchestrator for chopstack v2.

YOUR JOB: Generate a validated, execution-ready plan.yaml from a specification by following the chopstack v2 process gates.

## Input Format

User will specify: `/build-plan {spec-path}`

Examples:
- `/build-plan @specs/chopstack-v2_phase2/spec.md` → Generate plan from Phase 2 spec
- `/build-plan dark-mode.md` → Generate plan from dark mode spec

## Process Gates (CRITICAL - MUST FOLLOW IN ORDER)

The chopstack v2 process has TWO mandatory gates that prevent poor quality plans:

### GATE 1: Analyze Phase - Resolve Open Questions BEFORE Decomposition

**Purpose**: Identify and resolve ALL open questions and required audits before generating tasks.

**Why**: Incomplete specs produce incomplete task breakdowns. Questions must be resolved upfront to prevent "surprise expansion" during execution.

### GATE 2: Decompose Phase - Validate Task Quality AFTER Generation

**Purpose**: Catch oversized tasks and quality issues before execution.

**Why**: XL tasks often expand during execution (20h → 40h). Validation catches these early.

## Execution Protocol

### Step 1: GATE 1 - Analysis Phase

**Objective**: Achieve 100% spec completeness with 0 open questions.

1. Use Task tool to spawn analysis agent:

```
ROLE: You are a specification analysis agent for chopstack v2.

YOUR JOB: Analyze the specification for completeness and identify ALL open questions that must be resolved before decomposition.

SPECIFICATION: Read {spec-path}

ANALYSIS REQUIREMENTS:

1. **Gap Detection** - Identify missing information:
   - Missing components, types, interfaces
   - Incomplete sections
   - Vague requirements
   - Undefined scope boundaries
   - Missing acceptance criteria

2. **Open Questions** - Identify questions requiring resolution:
   - Required audits (e.g., "count v1 type usage by module")
   - Architecture decisions (e.g., "use Context API or Redux?")
   - Scope clarifications (e.g., "include mobile responsive?")
   - Implementation approach questions
   - Complexity estimates that need validation

3. **Severity Categorization**:
   - CRITICAL: Blocks decomposition entirely
   - HIGH: Will cause poor task breakdown
   - MEDIUM: May affect task granularity
   - LOW: Minor clarifications

4. **Completeness Score**: 0-100%
   - 100% = Ready for decomposition
   - < 100% = Has gaps or open questions

OUTPUT FORMAT:

```markdown
# Specification Analysis Report

## Completeness Score: {score}%

## Open Questions (MUST BE RESOLVED)

### Required Audits
1. [AUDIT-1] Count v1 type usage by module
   - Why: Informs task granularity and complexity estimates
   - Action: Run grep analysis, document findings in spec

2. [AUDIT-2] {description}
   - Why: {reasoning}
   - Action: {what user must do}

### Architecture Decisions
1. [ARCH-1] {question}
   - Why: {impact on task breakdown}
   - Action: {what user must decide}

### Scope Clarifications
1. [SCOPE-1] {question}
   - Why: {impact}
   - Action: {what user must clarify}

## Gaps by Severity

### CRITICAL
- [ ] {gap-1}: {description}
- [ ] {gap-2}: {description}

### HIGH
- [ ] {gap-3}: {description}

### MEDIUM
- [ ] {gap-4}: {description}

### LOW
- [ ] {gap-5}: {description}

## Remediation Steps (Prioritized)

1. [CRITICAL] {step}
2. [HIGH] {step}
3. [MEDIUM] {step}

## Gate 1 Status

- Open Questions: {count}
- Completeness: {score}%
- **GATE 1**: {BLOCKED | READY}

{If BLOCKED:}
❌ Cannot proceed to decomposition until:
- All open questions are resolved
- All required audits are completed
- Spec is updated with findings
- Completeness reaches 100%

{If READY:}
✅ Ready for decomposition
```

Execute analysis now.
```

2. **Review analysis report**:
   - If GATE 1 = BLOCKED:
     - Report all open questions to user
     - User must resolve questions and update spec
     - User must re-run `/build-plan` after updating spec
   - If GATE 1 = READY:
     - Proceed to Step 2

3. **STOP if GATE 1 fails** - Do NOT proceed to decomposition

### Step 2: Decompose Specification

**Objective**: Generate phase-based task DAG from completed specification.

**Prerequisites**:
- ✅ GATE 1 passed (completeness = 100%, open questions = 0)
- ✅ Specification has been updated with all resolutions

1. Use Task tool to spawn decomposition agent:

```
ROLE: You are a task decomposition agent for chopstack v2.

YOUR JOB: Generate a phase-based plan.yaml with well-scoped tasks following chopstack v2 patterns.

SPECIFICATION: Read {spec-path}

DECOMPOSITION REQUIREMENTS:

1. **Phase Organization**:
   - Group tasks into logical phases (setup → implementation → polish)
   - Identify sequential vs parallel opportunities
   - Ensure correct architectural ordering (DB → API → UI)

2. **Task Sizing** (T-Shirt Complexity):
   - XS (< 1h): Fold into related task
   - S (1-2h): Quick wins, well-defined
   - M (2-4h): TARGET SIZE - most tasks should be M
   - L (4-8h): Use sparingly, consider splitting
   - XL (> 8h): NEVER USE - must be split

3. **Task Quality**:
   - Clear description (why, not just what)
   - Explicit file list (no wildcards like `src/**/*.ts`)
   - Specific acceptance criteria
   - Minimal, logical dependencies only

4. **Phase Strategies**:
   - sequential: Tasks must run in order (dependencies, setup work)
   - parallel: Tasks can run simultaneously (independent work)

OUTPUT FORMAT: Generate valid plan.yaml following this structure:

```yaml
name: {Plan Name}
description: |
  {Multi-line description}

specification: {spec-path}
mode: plan
strategy: phased-parallel

phases:
  # Phase 1: Foundation/Setup (usually sequential)
  - id: phase-1-foundation
    name: {Phase Name}
    strategy: sequential
    tasks:
      - task-1-1-{kebab-case-id}
      - task-1-2-{kebab-case-id}
    complexity: M + S = Medium Phase
    notes: |
      Why these tasks are grouped together.
      Why this strategy (sequential vs parallel).

  # Phase 2: Implementation (often parallel)
  - id: phase-2-implementation
    name: {Phase Name}
    strategy: parallel
    tasks:
      - task-2-1-{kebab-case-id}
      - task-2-2-{kebab-case-id}
      - task-2-3-{kebab-case-id}
    complexity: M + M + M = Large (parallelizable)
    requires: [phase-1-foundation]
    notes: |
      Why these tasks can run in parallel.

  # Phase 3: Polish/Validation (usually sequential)
  - id: phase-3-polish
    name: {Phase Name}
    strategy: sequential
    tasks:
      - task-3-1-{kebab-case-id}
    complexity: M = Medium
    requires: [phase-2-implementation]
    notes: |
      Final cleanup and validation.

tasks:
  - id: task-1-1-{kebab-case-id}
    name: {Task Name}
    complexity: M  # Target: most tasks should be M
    description: |
      Clear description explaining WHAT to do and WHY.

      Implementation approach:
      - Step 1
      - Step 2
      - Step 3

      Why this task exists and how it fits in the plan.
    files:
      - src/specific/file1.ts
      - src/specific/file2.ts
      # NO wildcards like src/**/*.ts
    dependencies:
      - task-1-0-prerequisite  # Only if truly required
    acceptance_criteria:
      - Specific criterion 1
      - Specific criterion 2
      - Specific criterion 3

  # More tasks...

success_metrics:
  quantitative:
    - Test coverage: 95%+
    - Performance: {specific metric}
  qualitative:
    - Code quality: {description}
    - User experience: {description}
```

CRITICAL RULES:
- ✅ Most tasks should be M complexity
- ✅ Specific file paths (no wildcards)
- ✅ Clear acceptance criteria
- ❌ NEVER create XL tasks
- ❌ NEVER use vague file patterns
- ❌ NEVER create XS tasks (fold into related task)

Generate plan.yaml now.
```

2. **Save generated plan**:
   - Write to `{spec-directory}/plan.yaml`
   - Report: "Plan generated at {path}"

3. **Proceed to Step 3**

### Step 3: GATE 2 - Quality Validation

**Objective**: Validate task quality and catch issues before execution.

1. Use Task tool to spawn validation agent:

```
ROLE: You are a plan quality validator for chopstack v2.

YOUR JOB: Analyze the generated plan for quality issues that would cause problems during execution.

PLAN: Read {plan-path}

VALIDATION REQUIREMENTS:

Analyze each task for these quality issues:

1. **CRITICAL Issues** (MUST FIX):
   - XL complexity tasks (> 8 hours)
   - Empty or missing acceptance criteria
   - No files specified

2. **HIGH Issues** (STRONGLY RECOMMEND FIX):
   - L complexity tasks (consider splitting)
   - Tasks touching > 10 files
   - Vague file patterns (wildcards like `src/**/*.ts`)
   - Tasks with > 5 dependencies
   - Short descriptions (< 50 chars)

3. **MEDIUM Issues** (CONSIDER):
   - Too many XS tasks (fold into larger tasks)
   - Tasks with 0 dependencies (missing prerequisites?)
   - Ambiguous descriptions

4. **LOW Issues** (OPTIONAL):
   - Minor naming inconsistencies
   - Documentation gaps

OUTPUT FORMAT:

```markdown
# Task Quality Report

## Summary
- CRITICAL: {count}
- HIGH: {count}
- MEDIUM: {count}
- LOW: {count}

{If CRITICAL or HIGH > 0:}
⚠️  BLOCKING ISSUES FOUND - Plan may fail during execution

{If all issues LOW or none:}
✅ Plan is execution-ready

## Issues by Task

### Task: {task-id}
  🔴 [CRITICAL] {issue description}
     💡 {specific suggestion for fixing}

  🟠 [HIGH] {issue description}
     💡 {specific suggestion for fixing}

  🟡 [MEDIUM] {issue description}
     💡 {suggestion}

  🟢 [LOW] {issue description}
     💡 {suggestion}

## Recommended Actions

{If CRITICAL or HIGH issues exist:}

**MUST FIX BEFORE EXECUTION:**

1. Task {task-id}: {issue summary}
   - Split into: {task-a}, {task-b}, {task-c}
   - Reason: {why split is needed}

2. Task {task-id}: {issue summary}
   - Change: {specific fix}
   - Reason: {why fix is needed}

{If only MEDIUM or LOW issues:}

**OPTIONAL IMPROVEMENTS:**

1. {improvement suggestion}
2. {improvement suggestion}

## Gate 2 Status

- Critical Issues: {count}
- High Issues: {count}
- **GATE 2**: {BLOCKED | WARNING | READY}

{If BLOCKED (CRITICAL issues):}
❌ Cannot execute until CRITICAL issues are fixed
- User MUST edit plan.yaml
- Re-run quality validation after fixing

{If WARNING (HIGH issues):}
⚠️  Can proceed but high risk of execution problems
- STRONGLY RECOMMEND fixing HIGH issues first
- Or proceed with caution

{If READY:}
✅ Plan is execution-ready
```

Execute validation now.
```

2. **Review validation report**:
   - If GATE 2 = BLOCKED (CRITICAL issues):
     - Report all critical issues to user
     - User must edit plan.yaml to fix issues
     - User must re-run `/build-plan` (will skip to validation step)
   - If GATE 2 = WARNING (HIGH issues):
     - Report high issues to user
     - User can choose to fix or proceed
   - If GATE 2 = READY:
     - Plan is execution-ready

### Step 4: Final Report

After all gates pass, provide comprehensive report:

```markdown
# Plan Generation Complete

## Gate Status
✅ GATE 1: Analysis Complete (100% completeness, 0 open questions)
✅ GATE 2: Quality Validated ({critical} critical, {high} high issues)

## Plan Details
- **Location**: {plan-path}
- **Phases**: {phase-count}
- **Tasks**: {task-count}
- **Complexity Distribution**:
  - XL: {count} {if > 0: "⚠️  Warning: XL tasks should be split"}
  - L: {count}
  - M: {count} {if highest: "✅ Good distribution"}
  - S: {count}
  - XS: {count} {if > 0: "⚠️  Consider folding into larger tasks"}

## Parallelization Opportunities
- Phase {phase-id}: {task-count} tasks in parallel ({complexity} total)
- Phase {phase-id}: {task-count} tasks in parallel ({complexity} total)
- Estimated time savings: {estimate}

## Next Steps

### To Review Plan
```bash
cat {plan-path}
```

### To Execute First Phase
```bash
/execute-phase {first-phase-id}
```

### To Validate Plan Structure
```bash
chopstack run --plan {plan-path} --mode validate
```

### If Issues Found
Edit {plan-path} manually, then re-run:
```bash
/build-plan {spec-path}  # Will re-validate
```
```

## Error Handling

### Gate 1 Failure (Incomplete Spec)

If analysis finds open questions or gaps:

```markdown
❌ GATE 1 FAILURE: Cannot decompose until spec is complete

## Open Questions Found: {count}

### Required Audits
1. {audit-1}
2. {audit-2}

### Architecture Decisions
1. {decision-1}
2. {decision-2}

## Required Actions

1. Review analysis report above
2. Resolve ALL open questions:
   - Complete audits and document findings in spec
   - Make architecture decisions
   - Clarify scope
3. Update {spec-path} with resolutions
4. Re-run: `/build-plan {spec-path}`

**DO NOT PROCEED** until all questions are resolved.
```

### Gate 2 Failure (Poor Task Quality)

If validation finds critical issues:

```markdown
❌ GATE 2 FAILURE: Plan has quality issues that will cause execution problems

## Critical Issues: {count}

### Task {task-id}: {issue}
💡 **Fix**: {suggestion}

### Task {task-id}: {issue}
💡 **Fix**: {suggestion}

## Required Actions

1. Edit {plan-path}
2. Fix all CRITICAL issues listed above
3. Optionally fix HIGH issues (recommended)
4. Re-run: `/build-plan {spec-path}` (will skip to validation)

**Example Fix** - Splitting XL task:

Before (XL task):
```yaml
- id: migrate-everything
  complexity: XL
  files: [src/**/*.ts]  # Too vague
```

After (split into M tasks):
```yaml
- id: migrate-agents
  complexity: M
  files: [src/agents/*.ts]

- id: migrate-parsers
  complexity: M
  files: [src/parsers/*.ts]
  dependencies: [migrate-agents]
```
```

## Important Notes

- **Always use Task tool** for analysis, decomposition, and validation agents
- **Never skip gates** - they prevent execution failures
- **Trust the process** - gates catch 90% of execution issues upfront
- **Iterate if needed** - it's normal to go through multiple analysis/validation cycles
- **XL tasks are forbidden** - always split into M or L tasks

## Success Pattern

A successful plan generation looks like:

```
📋 Building plan from specs/chopstack-v2_phase2/spec.md

GATE 1: Analyzing specification...
├─ Reading spec...
├─ Identifying gaps...
├─ Checking open questions...
└─ ✅ Completeness: 100% (0 open questions)

GATE 1: ✅ PASSED

Generating plan...
├─ Creating phases...
├─ Defining tasks...
├─ Setting dependencies...
└─ ✅ Plan written to specs/chopstack-v2_phase2/plan.yaml

GATE 2: Validating task quality...
├─ Checking complexity distribution...
├─ Validating file specificity...
├─ Reviewing dependencies...
└─ ✅ 0 critical, 0 high issues

GATE 2: ✅ PASSED

✅ Plan Generation Complete

Next: /execute-phase {first-phase-id}
```

Now generate the plan from: `{spec-path}`
