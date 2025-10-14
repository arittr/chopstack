# Agent Execution Guide

This guide explains how to execute phases from `plan.yaml` using autonomous agents with the task execution template.

## Quick Start

To execute any phase from the plan:

```bash
# 1. Identify the phase and tasks from plan.yaml
# Example: Phase 2.1 has 3 sequential tasks

# 2. For each task, create an agent using the template
# Open Claude Code and use the Task tool:

ROLE: You are a task execution agent for chopstack v2.
YOUR TASK: 2.1.1-types-phase
[... use full template from prompts/task-execution-template.md ...]
```

## Execution Strategies

### Sequential Execution

For phases with `strategy: sequential`, execute one task at a time:

```bash
# Phase 1.1: Foundation (Sequential)
# 1. Execute 1.1.1-core-types (wait for completion)
# 2. Execute 1.1.2-agent-interfaces (wait for completion)
# 3. Execute 1.1.3-spec-types (wait for completion)
```

**How to Implement:**
1. Read task 1.1.1-core-types from plan.yaml
2. Create agent with template (substitute `{task-id}` = `1.1.1-core-types`)
3. Wait for agent to complete and commit
4. Move to task 1.1.2-agent-interfaces
5. Repeat until phase complete

### Parallel Execution

For phases with `strategy: parallel`, execute multiple tasks concurrently:

```bash
# Phase 2.2: Type Migration - Core Services (Parallel Tracks A, B, C)
# Launch 3 agents simultaneously:
```

**How to Implement:**
1. Identify all parallel tasks in the phase (e.g., 2.2.a, 2.2.b, 2.2.c)
2. Create N agents simultaneously using the template
3. Each agent gets a different `{task-id}`
4. All agents run concurrently
5. Wait for all to complete before moving to next phase

**Example - 3 Parallel Agents:**

Send a single message with 3 Task tool invocations:

```
Agent 1 (Task tool):
ROLE: You are a task execution agent for chopstack v2.
YOUR TASK: 2.2.a-parser-migration
[... full template ...]

Agent 2 (Task tool):
ROLE: You are a task execution agent for chopstack v2.
YOUR TASK: 2.2.b-validation-migration
[... full template ...]

Agent 3 (Task tool):
ROLE: You are a task execution agent for chopstack v2.
YOUR TASK: 2.2.c-outputter-migration
[... full template ...]
```

## Complete Workflow Example

Let's execute Phase 2.1 from the plan (Type System Foundation):

### Step 1: Read Plan

```bash
# Open specs/chopstack-v2/plan.yaml
# Find Phase 2.1:

phase-2.1:
  name: "Type System Foundation"
  strategy: sequential
  tasks:
    - 2.1.1-types-phase
    - 2.1.2-types-spec
    - 2.1.3-types-validation
```

### Step 2: Execute Tasks Sequentially

**Task 1: 2.1.1-types-phase**

```
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: 2.1.1-types-phase

TASK EXTRACTION:
1. Read @specs/chopstack-v2/plan.yaml
2. Find task with id: "2.1.1-types-phase"
3. Extract your task definition (description, files, acceptance_criteria, complexity)

CONTEXT FILES (Read in Order):
- @specs/chopstack-v2/plan.yaml (your task definition - START HERE)
- @specs/chopstack-v2/spec.md (requirements and architectural decisions)
- @specs/chopstack-v2/codebase.md (implementation patterns and context)

CONSTRAINTS:
- Implement ONLY the files listed in your task.files
- Follow EXACTLY your task.description
- Do NOT expand scope beyond your task boundaries
- Do NOT ask questions - all answers are in context files
- Do NOT modify files outside your task.files list
- Verify acceptance_criteria when complete

COMMIT INSTRUCTIONS:
After completing your task:
1. Run `git add --all`
2. Run `pnpm commit` to invoke gs branch create
3. Commit message should reference task-id: "[2.1.1-types-phase] Define v2 phase types"

SUCCESS CRITERIA:
✓ All files in task.files are implemented
✓ All acceptance_criteria are met
✓ No files outside task.files are modified
✓ Code follows patterns from codebase.md
✓ Changes are committed with task-id reference

Execute 2.1.1-types-phase now.
```

Wait for completion and commit, then proceed to next task.

**Task 2: 2.1.2-types-spec**

```
[Same template with {task-id} = 2.1.2-types-spec]
```

**Task 3: 2.1.3-types-validation**

```
[Same template with {task-id} = 2.1.3-types-validation]
```

### Step 3: Verify Phase Completion

After all tasks in phase 2.1 complete:

```bash
# Check git branches
gs log --oneline --graph

# Should see 3 commits:
# - [2.1.1-types-phase] Define v2 phase types
# - [2.1.2-types-spec] Define specification types
# - [2.1.3-types-validation] Add validation result types

# Verify all acceptance criteria met
# Review code changes
# Run tests: pnpm test
```

## Best Practices

### 1. Always Start with Plan Review

Before executing any phase, read the entire plan.yaml section:
- Understand dependencies between tasks
- Note the execution strategy (sequential vs parallel)
- Check prerequisite phases are complete

### 2. Use Exact Task IDs

Always use the exact task ID from plan.yaml:
- ✅ `2.1.1-types-phase` (from plan.yaml)
- ❌ `phase-2.1.1` (wrong format)
- ❌ `types-phase` (missing prefix)

### 3. Monitor Agent Constraint Adherence

Watch for agents that:
- Ask questions (should be blocked - context is complete)
- Modify files outside task.files (scope creep)
- Request additional context (everything needed is in 3 files)

If agents violate constraints, this indicates:
- Gate 1 failure: Open questions weren't resolved during analyze
- Gate 2 failure: Task quality validation missed scope issues

### 4. Commit After Every Task

Each task should result in exactly one commit:
- Uses `pnpm commit` which invokes `gs branch create`
- Creates a branch per task for clean PR stacking
- Commit message format: `[{task-id}] {brief description}`

### 5. Track Progress

Keep track of completed phases:

```
Phase 1.1: Foundation ✅
  - 1.1.1-core-types ✅
  - 1.1.2-agent-interfaces ✅
  - 1.1.3-spec-types ✅

Phase 2.1: Type System (In Progress)
  - 2.1.1-types-phase ✅
  - 2.1.2-types-spec ⏳ (current)
  - 2.1.3-types-validation ⏸️ (pending)
```

## Handling Issues

### Agent Asks Questions

**Symptom**: Agent says "I need to know..." or "Should I..."

**Root Cause**: Gate 1 failure - specification has unresolved questions

**Fix**:
1. Stop execution
2. Document question in spec.md "Open Tasks/Questions"
3. Resolve the question
4. Update spec.md
5. Re-run `chopstack analyze` (should show 0 open questions)
6. Restart task execution

### Agent Expands Scope

**Symptom**: Agent modifies files not in task.files or asks to add features

**Root Cause**: Gate 2 failure - task is too vague or too large

**Fix**:
1. Stop execution
2. Review task in plan.yaml
3. If task is XL or vague, split into smaller tasks
4. Update plan.yaml
5. Re-run quality validation
6. Restart with refined task

### File Conflicts

**Symptom**: Two parallel agents modify the same file

**Root Cause**: Plan validation missed file conflict

**Fix**:
1. Stop parallel execution
2. Review plan.yaml for file conflicts
3. Adjust task boundaries so files don't overlap
4. Update plan.yaml
5. Restart parallel execution

## Metrics and Success

Track these metrics during execution:

**Task Completion**:
- Time per task (compare to complexity estimate)
- Tasks completed without questions (should be 100%)
- Tasks completed within file boundaries (should be 100%)

**Quality**:
- File conflicts (should be 0 with proper plan)
- Acceptance criteria pass rate (should be 100%)
- Commits per task (should be exactly 1)

**Efficiency**:
- Parallel phases leverage multiple agents
- Sequential phases complete in order
- No wasted effort from scope creep

## Integration with v2 Process

This execution approach validates the entire chopstack v2 process:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SPECIFY → spec.md (rich specification)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. ANALYZE → gap-report.md (resolve open questions)        │
│    GATE 1: Open Questions = 0 ✓                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. DECOMPOSE → plan.yaml (phase-based task DAG)            │
│    Pre-Generation Gate: Check for unresolved questions     │
│    Post-Generation Validation: Quality check               │
│    GATE 2: Quality validated ✓                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. EXECUTE → Agent-based implementation ← THIS GUIDE        │
│    - Agents self-extract tasks from plan.yaml              │
│    - Full context injection (spec + codebase + plan)       │
│    - Constraint-driven execution (no questions, no scope)  │
│    - Automatic commit per task                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. VALIDATE → Verify acceptance criteria                   │
│    chopstack run --validate                                │
└─────────────────────────────────────────────────────────────┘
```

**Why This Works**:
- Gates 1 & 2 ensure high-quality plans with no open questions
- Agents execute against complete specifications
- Constraints prevent the scope creep that caused v1 issues
- Self-extraction tests plan.yaml clarity
- Parallel execution proves task independence

## Dogfooding v2 Process

This guide lets us "dogfood" chopstack v2 before it's built:

**What We're Testing**:
- ✅ Can agents self-extract tasks from plan.yaml?
- ✅ Are specifications complete enough to prevent questions?
- ✅ Do task boundaries prevent file conflicts?
- ✅ Does phase-based execution improve organization?
- ✅ Do t-shirt size estimates match actual complexity?

**What We're Proving**:
- ✅ The two-gate process works
- ✅ Plan.yaml format is clear and actionable
- ✅ Context injection (spec + codebase + plan) is sufficient
- ✅ Constraints (no questions, strict file boundaries) are effective

## Related Documentation

- **[prompts/task-execution-template.md](../prompts/task-execution-template.md)** - The actual prompt template
- **[spec.md](../spec.md)** - Full v2 specification with gates
- **[plan.yaml](../plan.yaml)** - Phase 1 & 2 execution plan
- **[process-gates.md](./process-gates.md)** - Visual guide to the two-gate system
- **[planning-guide.md](./planning-guide.md)** - Detailed planning improvements
