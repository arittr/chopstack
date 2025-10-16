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

### Step 0: Initialize MCP VCS

Before executing any phase, verify chopstack MCP server availability and configure VCS mode:

1. **Verify MCP server is available**:
   - Check if `configure_vcs` tool exists
   - Check if `create_task_worktree` tool exists
   - If NOT available: STOP and fail with error message

2. **Configure VCS mode**:
   - Load VCS mode from configuration file (~/.chopstack/config.yaml)
   - If mode explicitly specified in config: Call `configure_vcs(mode)`, fail if unavailable
   - If mode NOT specified: Default to merge-commit (requires only git)
   - Store VCS mode for agent prompt injection in later steps

**Error Behavior**:
- **Explicit mode (user configured)**: Fail with installation instructions if tool unavailable
- **Default mode (merge-commit)**: Fail only if git itself is missing

**MCP Unavailability Error Message**:
```
❌ MCP Server Not Available

The chopstack MCP server is required for worktree-based task execution.

Installation:
1. Ensure chopstack MCP server is running
2. Check MCP server configuration in Claude Code
3. Verify MCP tools are available:
   - configure_vcs
   - create_task_worktree

For MCP setup instructions, see:
https://github.com/your-org/chopstack-mcp#installation

Alternative: Run tasks without worktree isolation (not recommended for parallel phases)
```

**VCS Tool Unavailability Error Message (Explicit Mode)**:
```
❌ VCS Mode Not Available

Requested mode: {mode} (from ~/.chopstack/config.yaml)
Error: '{tool-binary}' not found in PATH

Installation:
{mode-specific installation instructions}

Alternative: Change mode in config
  ~/.chopstack/config.yaml:
    vcs:
      mode: merge-commit  # or remove to use merge-commit default

Then retry: /execute-phase {project} {phase-id}
```

### Step 1: Parse Phase from Plan

1. Read @.chopstack/specs/{project}/plan.yaml
2. Find the phase with id: `{phase-id}`
3. Extract:
   - Phase name
   - Execution strategy (sequential | parallel)
   - List of task IDs
   - Dependencies (verify they're complete)

### Step 2: Verify Prerequisites

Before executing, verify:
- ✅ No unresolved questions in @.chopstack/specs/{project}/spec.md "Open Tasks/Questions" section
- ✅ All prerequisite phases are complete (check git log for commits)
- ✅ Working directory is clean (`git status`)

If prerequisites fail, STOP and report what's missing.

### Step 3: Execute Based on Strategy

#### For Sequential Phases (strategy: sequential)

Execute tasks ONE AT A TIME in order with worktree isolation:

**Initialization**:
- Set `current_branch` to main (or current branch name from git)

**For each task in phase.tasks**:

1. **Create Worktree** (before spawning agent):
   - Call MCP tool: `create_task_worktree(taskId: {task-id}, baseRef: {current_branch})`
   - Store response: `{ path: {worktree_path}, branch: {branch_name}, baseRef: {base_ref} }`

2. **Spawn Agent** with modified prompt (includes worktree setup):

```
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: {task-id}

WORKTREE SETUP:
You are working in an isolated worktree for this task.

1. Change to worktree directory:
   cd {worktree_path}

2. You are on branch: {branch_name}
3. Base reference: {base_ref}

IMPORTANT: ALL file operations must happen in {worktree_path}, NOT the main repository.

TASK EXTRACTION:
1. Read @.chopstack/specs/{project}/plan.yaml
2. Find task with id: "{task-id}"
3. Extract your task definition (description, files, acceptance_criteria, complexity)

CONTEXT FILES (Read in Order):
- @.chopstack/specs/{project}/plan.yaml (your task definition - START HERE)
- @.chopstack/specs/{project}/spec.md (requirements and architectural decisions)
- @.chopstack/specs/{project}/codebase.md (implementation patterns and context)

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

Step 4: Commit with VCS (AFTER quality gate passes)

VCS Mode: {vcs_mode}

Commit Command for {vcs_mode}:
{vcs_commit_command}

CRITICAL RULES:
- ✅ ALWAYS fix ALL linting errors before committing
- ✅ ALWAYS work in worktree directory: {worktree_path}
- ✅ ALWAYS use the VCS-specific commit command shown above
- ✅ ALWAYS create a new stacked branch for each task
- ❌ NEVER use `git commit -m` directly (use VCS-specific command)
- ❌ NEVER use `git commit --no-verify` or `--no-hooks`
- ❌ NEVER bypass quality gates or pre-commit hooks
- ❌ NEVER skip the linting step
- ❌ NEVER work outside the worktree directory

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

**VCS-Specific Commit Commands** (inject into prompt):
- **git-spice**: `pnpm commit` (invokes gs branch create interactively)
- **merge-commit**: `git add --all && git commit -m "[{task-id}] {brief description}"`
- **graphite**: `gt add --all && gt commit -m "[{task-id}] {brief description}"`

3. **Wait for Agent Completion**:
   - Agent implements task in worktree
   - Agent commits changes using VCS-specific command
   - Verify commit exists in worktree branch

4. **Integrate Stack** (after successful commit):
   - Call MCP tool: `integrate_task_stack(tasks: [{task-id}], targetBranch: {current_branch})`
   - This merges/restacks the single task into the parent branch
   - Store response: `{ success: boolean, conflicts: [], mergedBranches: [] }`

5. **Cleanup Worktree**:
   - Call MCP tool: `cleanup_task_worktree(taskId: {task-id}, keepBranch: {keep_branch_flag})`
   - For git-spice: `keepBranch: true` (preserve for stack)
   - For merge-commit: `keepBranch: false` (delete after merge)

6. **Update Base Reference** (for next task):
   - For git-spice: `current_branch = {branch_name}` (stack on this task's branch)
   - For merge-commit: `current_branch = main` (all tasks branch from main)

7. **Move to Next Task**

**Result**: Linear stack
- git-spice: `main → task-1 → task-2 → task-3`
- merge-commit: `main ← task-1, task-2, task-3` (merged independently)

#### For Parallel Phases (strategy: parallel)

Execute ALL tasks CONCURRENTLY with isolated worktrees:

**Phase Setup:**
1. **Create all worktrees upfront**:
   - For each task in phase.tasks:
     - Call `create_task_worktree(task-id, current_branch)`
     - Receive: { path, branch, baseRef }
   - Store in `worktree_map[task-id] = { path, branch, baseRef }`

2. **Spawn ALL agents concurrently**:
   - Send a SINGLE message with MULTIPLE Task tool invocations
   - Each Task tool gets a modified prompt with worktree-specific setup
   - All agents run simultaneously

**Modified Agent Prompt for Parallel Execution:**

For each task, inject WORKTREE SETUP section at the beginning:

```
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: {task-id}

WORKTREE SETUP:
You are working in an isolated worktree for this task:
1. Change to worktree: cd {worktree_path}
2. You are on branch: {branch_name}
3. Base reference: {base_ref}

CRITICAL: ALWAYS work in the worktree directory above. Do NOT work in the main repository.

TASK EXTRACTION:
[... rest of standard prompt ...]

Step 4: Commit with VCS (AFTER quality gate passes)

1. Stage all changes: `git add --all`
2. Create commit with VCS-specific command:
   {vcs_commit_command}

CRITICAL RULES:
- ✅ ALWAYS work in worktree: {worktree_path}
- ✅ ALWAYS use VCS-specific commit command: {vcs_commit_command}
- ✅ ALWAYS fix ALL linting errors before committing
[... rest of critical rules ...]
```

Where `{vcs_commit_command}` is:
- **git-spice**: `pnpm commit` (will invoke gs branch create)
- **merge-commit**: `git commit -m "[{task-id}] Brief description"`
- **graphite**: `gt commit -m "[{task-id}] Brief description"`

**Phase Completion:**
3. **Wait for all agents to complete**:
   - Monitor all task statuses
   - Collect any errors or failures

4. **Integrate task stack**:
   - Call `integrate_task_stack(taskIds, targetBranch, workdir, { submit: false })`
   - taskIds: All task IDs from this phase
   - targetBranch: Current branch (usually "main" or current feature branch)
   - Receive: { success, conflicts, mergedBranches, prUrls? }

5. **Handle conflicts if reported**:
   - If conflicts detected:
     ```
     ❌ Integration Conflicts Detected

     Conflicts in tasks:
     - {task-id-1}: {conflicted-files}
     - {task-id-2}: {conflicted-files}

     Resolution:
     1. Worktrees kept intact at:
        - {worktree-path-1}
        - {worktree-path-2}
     2. Fix conflicts manually in each worktree
     3. Commit fixes
     4. Retry integration: /execute-phase {project} {phase-id}

     Alternative: Adjust task boundaries in plan.yaml to avoid file overlaps
     ```
   - Keep worktrees intact for manual resolution
   - STOP execution

6. **Cleanup all worktrees**:
   - For each task in phase.tasks:
     - Call `cleanup_task_worktree(task-id, keepBranch)`
   - keepBranch behavior:
     - **git-spice**: true (preserve branches for stack)
     - **merge-commit**: false (delete merged branches)
     - **graphite**: true (preserve for stack submission)

**Result**: Parallel stack where all tasks branch from same base and integrate together
- **git-spice**: main → [task-a, task-b, task-c] (all tracked as siblings)
- **merge-commit**: main ← [task-a, task-b, task-c] (all merged with --no-ff)
- **graphite**: main → [task-a, task-b, task-c] (stacked for submission)

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

### Worktree Creation Failures

**Scenario 1: Branch Name Collision**

If `create_task_worktree` fails due to branch already existing:

```
❌ Worktree Creation Failed

Task: {task-id}
Error: Branch 'task/{task-id}' already exists

Context:
- Working directory: {workdir}
- Base reference: {base_ref}
- Attempted branch: task/{task-id}

Cause:
A branch with this name already exists, likely from a previous run that wasn't cleaned up properly.

Resolution:
1. Check for leftover worktree:
   git worktree list

2. If worktree exists, remove it:
   git worktree remove .chopstack/shadows/{task-id}

3. If branch exists without worktree, delete branch:
   git branch -D task/{task-id}

4. Retry execution:
   /execute-phase {project} {phase-id}

Debug:
# List all branches with task prefix
git branch --list 'task/*'

# Check worktree status
git worktree list --porcelain
```

**Automatic Retry Logic**:
The MCP tool should attempt to resolve branch collisions automatically:
1. First attempt: Create branch `task/{task-id}`
2. On collision: Retry with timestamp suffix `task/{task-id}-{timestamp}`
3. Max retries: 3
4. If still fails: Report error with manual resolution steps

**Scenario 2: Worktree Path Conflict**

If worktree directory already exists:

```
❌ Worktree Path Conflict

Task: {task-id}
Error: Directory '.chopstack/shadows/{task-id}' already exists

Context:
- Working directory: {workdir}
- Worktree path: .chopstack/shadows/{task-id}

Cause:
The worktree directory exists from a previous run but is not registered with git.

Resolution:
1. Check directory contents:
   ls -la .chopstack/shadows/{task-id}

2. If safe to remove, delete directory:
   rm -rf .chopstack/shadows/{task-id}

3. Prune stale worktrees:
   git worktree prune

4. Retry execution:
   /execute-phase {project} {phase-id}

Debug:
# Check for orphaned worktrees
git worktree list | grep -v "bare"
```

**Scenario 3: Base Reference Invalid**

If the base reference doesn't exist:

```
❌ Invalid Base Reference

Task: {task-id}
Error: Reference '{base_ref}' not found

Context:
- Working directory: {workdir}
- Base reference: {base_ref}
- Task dependencies: {task.dependencies}

Cause:
The specified base reference does not exist. This may indicate:
- Missing prerequisite task commits
- Incorrect branch name
- Repository state mismatch

Resolution:
1. Check current branch:
   git branch --show-current

2. Verify recent commits:
   git log --oneline -10

3. If prerequisite tasks incomplete:
   - Review phase dependencies in plan.yaml
   - Execute prerequisite phases first
   - Then retry: /execute-phase {project} {phase-id}

4. If base reference should be 'main':
   - Check main branch exists: git branch --list main
   - Check out main: git checkout main
   - Retry execution

Debug:
# List all branches
git branch -a

# Check for the specific reference
git show-ref {base_ref}
```

### Integration Conflict Handling

**Scenario: Merge Conflicts During Stack Integration**

If `integrate_task_stack` detects merge conflicts:

```
❌ Integration Conflicts Detected

Phase: {phase-id}
Conflicts in {conflict_count} task(s):

Task: {task-id-1}
Branch: task/{task-id-1}
Conflicting files:
  - {file-path-1}
  - {file-path-2}

Task: {task-id-2}
Branch: task/{task-id-2}
Conflicting files:
  - {file-path-3}

Context:
- Integration strategy: {vcs_mode}
- Target branch: {target_branch}
- Total tasks in phase: {task_count}
- Successfully integrated: {success_count}

Cause:
Multiple tasks modified the same files in conflicting ways. This indicates:
- Task boundaries in plan.yaml overlap
- Tasks have hidden dependencies not captured in plan
- Parallel execution assumptions violated

Resolution:
1. Worktrees preserved for manual resolution:
   - {worktree-path-1}
   - {worktree-path-2}

2. Fix conflicts manually in each worktree:
   cd {worktree-path-1}
   # Edit conflicting files
   git add .
   {vcs_commit_command}

3. After fixing all conflicts, retry integration:
   /execute-phase {project} {phase-id}

4. If conflicts persist, adjust plan.yaml:
   - Review task.files for overlapping file lists
   - Split conflicting tasks into separate phases
   - Add explicit dependencies between conflicting tasks
   - Change phase strategy from 'parallel' to 'sequential'

Alternative:
For git-spice mode, manually restack:
cd {workdir}
gs upstack restack

For merge-commit mode, manually merge:
git checkout {target_branch}
git merge --no-ff task/{task-id-1}
# Resolve conflicts
git merge --no-ff task/{task-id-2}

Debug:
# Show conflicting hunks
git diff --check

# List all conflicts
git diff --name-only --diff-filter=U
```

**Conflict Prevention**:
- Before parallel execution, analyze task.files for overlaps
- Warn if multiple tasks list same file
- Suggest changing to sequential strategy if high overlap detected

### Cleanup Failure Handling

**Scenario 1: Worktree Removal Fails**

If `cleanup_task_worktree` fails to remove worktree:

```
⚠️ Worktree Cleanup Failed (Non-Critical)

Task: {task-id}
Warning: Failed to remove worktree at {worktree-path}
Error: {error_message}

Context:
- Worktree path: {worktree-path}
- Branch name: {branch-name}
- Keep branch: {keep_branch_flag}

Cause:
The worktree directory may be locked, in use, or contain uncommitted changes.

Resolution:
Execution will continue, but manual cleanup recommended:

1. Check worktree status:
   git worktree list

2. Force remove if safe:
   git worktree remove --force {worktree-path}

3. If worktree still exists:
   rm -rf {worktree-path}
   git worktree prune

4. Clean up branch if needed:
   git branch -D {branch-name}

Note: This is a warning, not an error. Phase execution continues.

Debug:
# Check if directory is in use
lsof +D {worktree-path}

# Check for uncommitted changes
cd {worktree-path} && git status
```

**Cleanup Policy**:
- Log warnings but continue execution
- Accumulate cleanup failures and report at end of phase
- Suggest bulk cleanup command after phase completes
- Track orphaned worktrees for automatic cleanup in next run

**Scenario 2: Branch Deletion Fails**

If branch deletion fails after worktree cleanup:

```
⚠️ Branch Cleanup Failed (Non-Critical)

Task: {task-id}
Warning: Failed to delete branch '{branch-name}'
Error: {error_message}

Context:
- Branch: {branch-name}
- VCS mode: {vcs_mode}
- Integration status: {integration_status}

Cause:
Branch may be:
- Currently checked out in another worktree
- Protected by git configuration
- Part of an active stack (git-spice)

Resolution:
Manual cleanup recommended:

1. Check branch status:
   git branch --list {branch-name}

2. Verify not checked out elsewhere:
   git worktree list

3. Force delete if safe:
   git branch -D {branch-name}

4. For git-spice stacks, check stack status:
   gs stack log

Note: This is a warning. Phase execution continues.
```

### MCP Tool Unavailability

**Scenario: MCP Server Not Running or Not Configured**

If MCP tools are not available during Step 0:

```
❌ MCP Server Not Available

The chopstack MCP server is required for worktree-based task execution.

Verification Failed:
- configure_vcs tool: ❌ Not found
- create_task_worktree tool: ❌ Not found

Context:
- Phase: {phase-id}
- Execution strategy: {strategy}
- Task count: {task_count}

Cause:
The MCP server is not running, not configured, or the tools are not registered.

Installation & Setup:
1. Ensure chopstack MCP server is installed:
   npm install -g @chopstack/mcp-server
   # or
   pnpm add -g @chopstack/mcp-server

2. Configure MCP server in Claude Code:
   - Open Claude Code settings
   - Navigate to MCP Server configuration
   - Add chopstack MCP server:
     {
       "mcpServers": {
         "chopstack": {
           "command": "chopstack-mcp",
           "args": ["server"]
         }
       }
     }

3. Restart Claude Code to load MCP server

4. Verify MCP tools are available:
   - Check for configure_vcs tool
   - Check for create_task_worktree tool
   - Check for integrate_task_stack tool
   - Check for cleanup_task_worktree tool

5. Retry execution:
   /execute-phase {project} {phase-id}

Alternative (Not Recommended):
For sequential phases only, you can execute without worktrees:
- Tasks will run in the same directory
- File conflicts may occur
- No isolation between tasks
- Manual conflict resolution required

To proceed without MCP (sequential only):
/execute-phase {project} {phase-id} --no-worktrees

For More Information:
- MCP Server Documentation: https://github.com/chopstack/chopstack-mcp
- Troubleshooting Guide: docs/troubleshooting.md#mcp-server
```

### VCS Mode Configuration Errors

**Scenario 1: Explicit VCS Tool Not Found**

If user configured git-spice but `gs` binary not found:

```
❌ VCS Tool Not Available

Requested mode: git-spice
Source: ~/.chopstack/config.yaml (explicit configuration)
Error: 'gs' binary not found in PATH

Context:
- Working directory: {workdir}
- Configuration file: ~/.chopstack/config.yaml
- Configured mode: git-spice
- Search paths: {PATH}

Cause:
git-spice is configured as the VCS mode but the 'gs' binary is not installed.

Installation Instructions:

Option 1 - Homebrew (macOS/Linux):
  brew install abhinav/git-spice/git-spice

Option 2 - Go Install:
  go install go.abhg.dev/gs@latest

Option 3 - Binary Download:
  # Download from: https://github.com/abhinav/git-spice/releases
  # Extract and add to PATH

Verify Installation:
  gs --version

Alternative - Change VCS Mode:
If you prefer not to install git-spice, change mode in config:

  ~/.chopstack/config.yaml:
    vcs:
      mode: merge-commit  # Simple merge workflow (requires only git)

Or remove the mode configuration to use merge-commit default:

  ~/.chopstack/config.yaml:
    vcs:
      # mode: git-spice  # Comment out or remove this line

Then retry:
  /execute-phase {project} {phase-id}

For More Information:
- git-spice documentation: https://abhinav.github.io/git-spice/
- chopstack VCS modes: docs/vcs-configuration.md
```

**Scenario 2: Default Mode Fails (Git Not Installed)**

If default mode (merge-commit) fails because git is missing:

```
❌ Git Not Found

Error: 'git' binary not found in PATH

Context:
- VCS mode: merge-commit (default)
- Working directory: {workdir}
- Search paths: {PATH}

Cause:
Git is not installed on this system. Git is required for all VCS modes including the default merge-commit mode.

Installation Instructions:

macOS:
  # Using Homebrew
  brew install git

  # Using Xcode Command Line Tools
  xcode-select --install

Linux (Debian/Ubuntu):
  sudo apt-get update
  sudo apt-get install git

Linux (Fedora/RHEL):
  sudo dnf install git

Windows:
  # Download from: https://git-scm.com/download/win
  # Or use winget:
  winget install Git.Git

Verify Installation:
  git --version

After installing Git, retry:
  /execute-phase {project} {phase-id}
```

### Agent Execution Errors

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

### General Error Handling Principles

**Error Message Format**:
All error messages must include:
1. **What Failed**: Clear description of the operation
2. **Context**: Relevant information (task ID, file paths, branch names, etc.)
3. **Cause**: Why the failure occurred
4. **Resolution**: Step-by-step instructions to fix
5. **Debug**: Optional commands for investigation

**Error Severity Levels**:
- **❌ Critical**: Execution must stop, user action required
- **⚠️ Warning**: Execution continues, manual cleanup recommended
- **ℹ️ Info**: Informational, no action required

**Retry Strategy**:
- Automatic retry: Branch name collisions (up to 3 attempts)
- Manual retry: All other failures require user intervention
- Idempotent operations: Safe to retry after manual fixes

**Error Recovery**:
- Keep worktrees intact on integration conflicts for manual resolution
- Log all failures for post-phase summary report
- Provide exact commands for manual resolution
- Link to documentation for complex scenarios

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
