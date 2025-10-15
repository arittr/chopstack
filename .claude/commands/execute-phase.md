---
description: Execute a phase from chopstack v2 plan.yaml using autonomous agents
---

ROLE: You are a phase execution orchestrator for chopstack v2.

YOUR JOB: Execute the specified phase from a plan.yaml by spawning autonomous task agents.

## Input Format

User will specify: `/execute-phase {project} {phase-id}`

Examples:
- `/execute-phase chopstack-v2_phase2 phase-1-foundation` → Execute Phase 1: Foundation Services
- `/execute-phase chopstack-v2 2.1` → Execute Phase 2.1: Type System Foundation
- `/execute-phase dark-mode phase-setup` → Execute setup phase from dark-mode project

## Execution Protocol

### Step 1: Parse Phase from Plan

1. Read @specs/{project}/plan.yaml
2. Find the phase with id: `{phase-id}`
3. Extract:
   - Phase name
   - Execution strategy (sequential | parallel)
   - List of task IDs
   - Dependencies (verify they're complete)

### Step 2: Verify Prerequisites

Before executing, verify:
- ✅ No unresolved questions in @specs/{project}/spec.md "Open Tasks/Questions" section
- ✅ All prerequisite phases are complete (check git log for commits)
- ✅ Working directory is clean (`git status`)

If prerequisites fail, STOP and report what's missing.

### Step 3: Execute Based on Strategy

#### For Sequential Phases (strategy: sequential)

Execute tasks ONE AT A TIME in order:

For each task in phase.tasks:
1. Use Task tool to spawn agent with this prompt:

```
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: {task-id}

TASK EXTRACTION:
1. Read @specs/{project}/plan.yaml
2. Find task with id: "{task-id}"
3. Extract your task definition (description, files, acceptance_criteria, complexity)

CONTEXT FILES (Read in Order):
- @specs/{project}/plan.yaml (your task definition - START HERE)
- @specs/{project}/spec.md (requirements and architectural decisions)
- @specs/{project}/codebase.md (implementation patterns and context)

CONSTRAINTS:
- Implement ONLY the files listed in your task.files
- Follow EXACTLY your task.description
- Do NOT expand scope beyond your task boundaries
- Do NOT ask questions - all answers are in context files
- Do NOT modify files outside your task.files list
- Verify acceptance_criteria when complete

IMPLEMENTATION PROTOCOL (CRITICAL - MUST FOLLOW IN ORDER):

Step 1: Implement Files
- Write all files listed in task.files
- Follow patterns from codebase.md
- Implement all acceptance_criteria

Step 2: Write and Run Tests
- Write comprehensive unit tests
- Write integration tests if required
- Run tests: `pnpm test <test-file-path>`
- Fix any test failures
- Repeat until ALL tests pass

Step 3: Fix Code Quality Issues (QUALITY GATE)
This step is MANDATORY before committing:

1. Run linting check:
   ```bash
   pnpm lint
   ```

2. If linting fails:
   - Read the ESLint error output carefully
   - Identify all errors (naming conventions, unused vars, etc.)
   - Fix ALL errors in the reported files
   - Run `pnpm lint` again
   - Repeat until `pnpm lint` passes with ZERO errors

Common ESLint fixes needed:
- Private methods: Must have underscore prefix (e.g., `_methodName`)
- Unused variables: Prefix with underscore or remove them
- UTF encoding: Use 'utf8' not 'utf-8'
- Unnecessary conditionals: Remove redundant null checks

3. Do NOT proceed to commit until `pnpm lint` shows zero errors

Step 4: Commit with Git-Spice (AFTER quality gate passes)

1. Stage all changes: `git add --all`
2. Create stacked branch with commit: `pnpm commit`
   - This will invoke `gs branch create` interactively
   - When prompted for commit message, use: "[{task-id}] {brief description}"

CRITICAL RULES:
- ✅ ALWAYS fix ALL linting errors before committing
- ✅ ALWAYS use `pnpm commit` (invokes gs branch create)
- ✅ ALWAYS create a new stacked branch for each task
- ❌ NEVER use `git commit -m` directly
- ❌ NEVER use `git commit --no-verify` or `--no-hooks`
- ❌ NEVER bypass quality gates or pre-commit hooks
- ❌ NEVER skip the linting step

If commit fails due to pre-commit hooks:
1. Read the error output from the hook
2. Fix the reported issues (usually linting errors)
3. Run `pnpm lint` to verify fixes
4. Try committing again
5. Do NOT bypass with --no-verify or direct git commands

SUCCESS CRITERIA:
✓ All files in task.files are implemented
✓ All tests pass (unit + integration)
✓ pnpm lint passes with ZERO errors
✓ All acceptance_criteria are met
✓ No files outside task.files are modified
✓ Code follows patterns from codebase.md
✓ Changes are committed on stacked branch with task-id reference

Execute {task-id} now.
```

2. Wait for agent to complete and commit
3. Verify commit exists: `git log --oneline --grep="{task-id}"`
4. Move to next task

#### For Parallel Phases (strategy: parallel)

Execute ALL tasks CONCURRENTLY:

1. Send a SINGLE message with MULTIPLE Task tool invocations
2. Each Task tool gets the same prompt template as above, but with different {task-id}
3. All agents run simultaneously
4. Wait for ALL agents to complete before reporting success

### Step 4: Verify Phase Completion

After all tasks complete:

1. Check commits: `git log --oneline --graph -n {number-of-tasks}`
2. Verify each task has exactly one commit with [{task-id}] prefix
3. Run tests: `pnpm test`
4. Report summary:
   ```
   ✅ Phase {phase-id} Complete

   Tasks Completed:
   - {task-1-id} ✅
   - {task-2-id} ✅
   - {task-3-id} ✅

   Commits:
   - [{task-1-id}] Brief description
   - [{task-2-id}] Brief description
   - [{task-3-id}] Brief description

   Next Steps:
   - Execute next phase: /execute-phase {project} {next-phase-id}
   - Or validate: chopstack run --validate
   ```

## Error Handling

### Agent Asks Questions
If any agent asks a question instead of executing:

1. STOP all execution
2. Report: "❌ Gate 1 failure - agent asked: {question}"
3. Instruct user to:
   - Add question to spec.md "Open Tasks/Questions"
   - Resolve the question
   - Update spec.md
   - Re-run: `/execute-phase {project} {phase-id}`

### Agent Expands Scope
If any agent modifies files outside task.files:

1. STOP execution
2. Report: "❌ Gate 2 failure - task {task-id} is too large or vague"
3. Instruct user to:
   - Review task in plan.yaml
   - Split task into smaller tasks
   - Update plan.yaml
   - Re-run: `/execute-phase {project} {phase-id}`

### File Conflicts (Parallel Only)
If parallel agents conflict:

1. STOP execution
2. Report: "❌ File conflict between {task-a} and {task-b} on {file-path}"
3. Instruct user to:
   - Review task boundaries in plan.yaml
   - Adjust so files don't overlap
   - Update plan.yaml
   - Re-run: `/execute-phase {project} {phase-id}`

## Important Notes

- **Do NOT manually implement tasks yourself** - always use Task tool to spawn agents
- **For parallel execution**: Must send single message with multiple Task invocations
- **Verify commits**: Each task must produce exactly one commit
- **No questions allowed**: If agent asks questions, it's a Gate 1 failure
- **Strict file boundaries**: If agent touches extra files, it's a Gate 2 failure

## Success Pattern

A successful execution looks like:

```
Reading phase 2.1 from plan.yaml...

Phase: Type System Foundation
Strategy: sequential
Tasks: 3

Executing task 2.1.1-types-phase...
[Task tool spawns agent]
✅ Task 2.1.1-types-phase complete - commit [2.1.1-types-phase] created

Executing task 2.1.2-types-spec...
[Task tool spawns agent]
✅ Task 2.1.2-types-spec complete - commit [2.1.2-types-spec] created

Executing task 2.1.3-types-validation...
[Task tool spawns agent]
✅ Task 2.1.3-types-validation complete - commit [2.1.3-types-validation] created

Running tests... ✅ All tests pass

✅ Phase 2.1 Complete (3/3 tasks)
```

Now execute the requested phase from project `{project}`: `{phase-id}`
