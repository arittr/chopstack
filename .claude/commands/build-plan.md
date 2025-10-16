---
description: Build a new plan.yaml from spec following chopstack v2 process gates
---

ROLE: You are a plan generation orchestrator for chopstack v2.

YOUR JOB: Generate a validated, execution-ready plan.yaml from a specification by following the chopstack v2 process gates.

## Input Format

User will specify: `/build-plan {spec-path}`

Examples:
- `/build-plan @.chopstack/specs/chopstack-v2_phase2/spec.md` → Generate plan from Phase 2 spec
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

1. Use Task tool to spawn **@agent-spec-completeness-analyzer** with this prompt:

```
Analyze the specification at {spec-path} for completeness before task decomposition.

Read the specification file and perform a comprehensive analysis to identify:
- Missing components, types, interfaces, and technical requirements
- Required audits that need to be conducted
- Architecture decisions that must be made
- Scope clarifications needed
- Any gaps that would prevent accurate task decomposition

Produce your standard Specification Completeness Analysis report with:
- Completeness score (0-100%)
- Open questions categorized (Audits, Architecture, Scope)
- Gaps by severity (CRITICAL, HIGH, MEDIUM, LOW)
- Prioritized remediation steps
- Gate 1 status (BLOCKED or READY)

This is for the /build-plan workflow, so be thorough - incomplete specs lead to poor task breakdown.
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

1. Use Task tool to spawn **@agent-task-decomposition-planner** with this prompt:

```
Decompose the specification at {spec-path} into an execution-ready plan.yaml.

Read the complete specification and transform it into a phase-based plan following chopstack v2 patterns:

**Task Sizing Guidelines**:
- Target: Most tasks should be M (2-4 hours)
- NEVER create XL tasks (>8 hours) - split into multiple M tasks
- NEVER create XS tasks (<1 hour) - fold into related M tasks
- Use L (4-8 hours) sparingly - consider splitting

**Task Quality Requirements**:
- Clear descriptions with WHAT, WHY, and HOW
- Explicit file paths (no wildcards like src/**/*.ts)
- 3-5 specific, testable acceptance criteria per task
- Minimal dependencies (only what's truly required)
- 3-7 implementation steps

**Phase Organization**:
- Group into logical phases (foundation → implementation → polish)
- Use 'sequential' strategy when tasks have dependencies
- Use 'parallel' strategy when tasks are independent
- Ensure architectural ordering (types → services → API → UI)

Generate a complete plan.yaml file with:
- Phase definitions with strategies and task lists
- Task definitions with all required fields
- Success metrics (quantitative and qualitative)

Save the plan to: {spec-directory}/plan.yaml
```

2. **Save generated plan**:
   - Write to `{spec-directory}/plan.yaml`
   - Report: "Plan generated at {path}"

3. **Proceed to Step 3**

### Step 3: GATE 2 - Quality Validation

**Objective**: Validate task quality and catch issues before execution.

1. Use Task tool to spawn **@agent-task-decomposition-planner** with this prompt:

```
Validate the plan at {plan-path} for quality issues before execution.

Read the generated plan.yaml and audit it for quality issues that could cause execution problems:

**CRITICAL Issues** (MUST FIX):
- XL complexity tasks (>8 hours) - must be split
- Tasks with no acceptance criteria
- Tasks with no files specified
- Circular dependencies

**HIGH Issues** (STRONGLY RECOMMEND FIX):
- L complexity tasks (consider splitting)
- Tasks with >10 files (likely too large)
- Wildcard file patterns (e.g., src/**/*.ts)
- Tasks with >5 dependencies (too coupled)
- Short descriptions (<50 characters)

**MEDIUM Issues** (CONSIDER):
- Too many XS tasks (>30% of total)
- Tasks with 0 dependencies (suspicious for non-initial tasks)
- Ambiguous descriptions
- Missing implementation steps

**LOW Issues** (OPTIONAL):
- Naming inconsistencies
- Documentation gaps
- Suboptimal phase organization

Produce your standard Plan Quality Report with:
- Summary of issue counts by severity
- Issues by task with specific fix suggestions
- Recommended actions (prioritized)
- Gate 2 status (BLOCKED, WARNING, or READY)

For each issue, provide WHAT the problem is, WHY it matters, and HOW to fix it with exact YAML examples.
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
📋 Building plan from .chopstack/specs/chopstack-v2_phase2/spec.md

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
└─ ✅ Plan written to .chopstack/specs/chopstack-v2_phase2/plan.yaml

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
