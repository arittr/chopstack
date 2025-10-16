# Audit: Slash Command Integration Requirements

**Date**: 2025-10-16
**Purpose**: Understand how to integrate MCP VCS tools into /execute-phase
**Related Spec**: simplify-arch-from-cli

## Audit Scope

Analysis of execute-phase slash command for MCP VCS tool integration to enable:
- VCS-agnostic worktree management
- Parallel task execution with isolation
- Automatic stack integration
- Multiple VCS mode support (git-spice, merge-commit, graphite, sapling)

## Methodology

- Reviewed .claude/commands/execute-phase.md
- Mapped current execution flow
- Identified integration points for MCP tools
- Assessed backward compatibility requirements
- Estimated implementation complexity

## Findings

### Summary

- **Command Structure**: Sequential orchestration with Task tool spawning
- **Integration Points**: 5 major points identified
- **Complexity**: Medium (M) - Requires prompt modification and flow enhancement
- **Backward Compatibility**: Excellent - MCP is optional enhancement

### Current Execution Flow

The execute-phase command follows this orchestration pattern:

1. **Parse Phase from Plan** (Step 1)
   - Read .chopstack/specs/{project}/plan.yaml
   - Find phase by ID
   - Extract execution strategy (sequential | parallel)
   - Extract task IDs
   - Verify dependencies

2. **Verify Prerequisites** (Step 2)
   - Check for unresolved questions in spec.md
   - Verify prerequisite phases complete (git log check)
   - Verify working directory clean (git status)
   - **STOP if prerequisites fail**

3. **Execute Tasks** (Step 3)
   - **Sequential Strategy**: Execute tasks one at a time, wait for each to complete
   - **Parallel Strategy**: Spawn ALL agents concurrently in single message
   - Each agent receives identical prompt template with different task-id
   - Agents commit using `pnpm commit` (git-spice) or `git commit -m`

4. **Verify Phase Completion** (Step 4)
   - Check commits (git log)
   - Verify each task has one commit with [task-id] prefix
   - Run tests (pnpm test)
   - Report summary with next steps

### Integration Points Identified

#### Point 1: MCP Detection

**Location**: Before Step 1 (Parse Phase)

**Current Behavior**: None - assumes git-spice is available

**Required Change**: Add MCP availability check at command start

**Implementation**:
```markdown
## Step 0: Check MCP Availability

1. Attempt to detect chopstack MCP tools:
   - Check if configure_vcs tool exists
   - Check if create_task_worktree tool exists

2. If MCP available:
   - Detect VCS mode from config (~/.chopstack/config.yaml)
   - Default: git-spice
   - Fallback: merge-commit
   - Verify VCS tool installed via configure_vcs(mode)
   - Store VCS mode for agent prompts

3. If MCP NOT available:
   - Show warning: "⚠️  Execution without MCP - no worktree isolation. Install chopstack MCP for best experience."
   - Continue with execution (agents work in same directory)
   - Use default commit command: `pnpm commit`
```

**MCP Tool Calls**:
- `configure_vcs(mode: 'git-spice' | 'merge-commit' | 'graphite' | 'sapling')`
- Returns: `{ mode: string, available: boolean }`

**Complexity**: **S** (2-3 hours)

---

#### Point 2: Worktree Creation (Sequential Execution)

**Location**: Step 3 - Before spawning each sequential agent

**Current Behavior**: Agent works in current directory

**Required Change**: Create worktree before each task, integrate after each task

**Implementation**:
```markdown
### For Sequential Phases (strategy: sequential) WITH MCP

1. Initialize base reference: `current_branch = main` (or current branch)

2. For each task in phase.tasks:

   a. **Create Worktree**:
      - Call: create_task_worktree(task-id, current_branch)
      - Receive: { path: string, branch: string, baseRef: string }
      - Store worktree info

   b. **Spawn Agent** with modified prompt:
      ```
      ROLE: You are a task execution agent for chopstack v2.

      YOUR TASK: {task-id}

      WORKTREE SETUP:
      1. Change to worktree directory: cd {worktree_path}
      2. You are now in an isolated worktree on branch: {branch_name}

      [... rest of task prompt ...]

      Step 4: Commit with VCS (AFTER quality gate passes)

      1. Stage all changes: `git add --all`
      2. Commit: {vcs_commit_command}
         - git-spice: `pnpm commit`
         - merge-commit: `git commit -m "[{task-id}] {brief description}"`
         - graphite: `gt commit -m "[{task-id}] {brief description}"`
      ```

   c. **Wait for Agent to Complete**

   d. **Integrate Stack**:
      - Call: integrate_task_stack([task-id], current_branch)
      - Handle conflicts if any
      - For git-spice: Creates stacked branch (main → task-1)
      - For merge-commit: Merges to main

   e. **Cleanup Worktree**:
      - Call: cleanup_task_worktree(task-id)
      - Keep branches if git-spice mode

   f. **Update Base Reference**:
      - For git-spice: current_branch = task-id branch (next task stacks on this)
      - For merge-commit: current_branch = main (already merged)

3. Result: Sequential stack (main → task-1 → task-2 → task-3)
```

**MCP Tool Calls**:
- `create_task_worktree(task_id: string, base_ref: string)` → returns worktree info
- `integrate_task_stack(task_ids: string[], target_branch: string)` → returns integration result
- `cleanup_task_worktree(task_id: string, keep_branch?: boolean)` → no return

**Complexity**: **M** (4-6 hours)

---

#### Point 3: Worktree Creation (Parallel Execution)

**Location**: Step 3 - Before spawning parallel agents

**Current Behavior**: All agents work in same directory (file conflicts likely)

**Required Change**: Create all worktrees upfront, spawn agents with worktree paths

**Implementation**:
```markdown
### For Parallel Phases (strategy: parallel) WITH MCP

1. **Create All Worktrees**:
   - For each task in phase.tasks:
     * Call: create_task_worktree(task-id, current_branch)
     * Store: worktree_map[task-id] = { path, branch, baseRef }

2. **Spawn ALL Agents Concurrently**:
   - Send SINGLE message with MULTIPLE Task tool invocations
   - Each agent gets modified prompt with worktree-specific details:
     ```
     WORKTREE SETUP:
     1. Change to worktree directory: cd {worktree_path}
     2. You are now in isolated worktree on branch: {branch_name}

     [... rest of task prompt ...]

     Step 4: Commit with VCS
     1. Stage all changes: `git add --all`
     2. Commit: {vcs_commit_command}
     ```

3. **Wait for ALL Agents to Complete**

4. **Integrate Task Stack**:
   - Call: integrate_task_stack([task-a, task-b, task-c], target_branch)
   - For git-spice: Creates parallel branches (main → [task-a, task-b, task-c])
   - For merge-commit: Merges all to main in order
   - Handle conflicts:
     * If conflicts: Report to user with resolution steps
     * If success: Verify all branches integrated

5. **Cleanup All Worktrees**:
   - For each task: cleanup_task_worktree(task-id, keep_branch)
   - Keep branches if git-spice mode (for stack preservation)
   - Delete branches if merge-commit mode (already merged)
```

**MCP Tool Calls**:
- `create_task_worktree(task_id, base_ref)` × N tasks
- `integrate_task_stack(task_ids[], target_branch)` × 1
- `cleanup_task_worktree(task_id, keep_branch)` × N tasks

**Benefits**:
- ✅ Zero file conflicts (each agent in isolation)
- ✅ True parallel execution
- ✅ Automatic stack building

**Complexity**: **M** (5-7 hours)

---

#### Point 4: Agent Prompt Modification

**Location**: Step 3 - Task agent prompt template

**Current Behavior**: Generic prompt with task extraction instructions

**Required Change**: Add worktree-specific setup and VCS-specific commit command

**Current Prompt Structure**:
```markdown
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: {task-id}

TASK EXTRACTION:
1. Read @.chopstack/specs/{project}/plan.yaml
2. Find task with id: "{task-id}"
3. Extract your task definition

[... CONTEXT FILES, CONSTRAINTS, IMPLEMENTATION PROTOCOL ...]

Step 4: Commit with Git-Spice
1. Stage all changes: `git add --all`
2. Create stacked branch with commit: `pnpm commit`
```

**Enhanced Prompt Structure** (with MCP):
```markdown
ROLE: You are a task execution agent for chopstack v2.

YOUR TASK: {task-id}

WORKTREE SETUP (MCP-enabled):
1. You are executing in isolated worktree: {worktree_path}
2. Change to worktree: cd {worktree_path}
3. You are on branch: {branch_name} (based on: {base_ref})
4. All file operations are isolated from other tasks

TASK EXTRACTION:
1. Read @.chopstack/specs/{project}/plan.yaml
2. Find task with id: "{task-id}"
3. Extract your task definition

[... CONTEXT FILES, CONSTRAINTS, IMPLEMENTATION PROTOCOL ...]

Step 4: Commit with {vcs_mode}

1. Stage all changes: `git add --all`
2. Commit based on VCS mode:

   **For git-spice mode**:
   ```bash
   pnpm commit
   # This will invoke gs branch create interactively
   # When prompted for commit message, use: "[{task-id}] {brief description}"
   ```

   **For merge-commit mode**:
   ```bash
   git commit -m "[{task-id}] {brief description}"
   ```

   **For graphite mode**:
   ```bash
   gt commit -m "[{task-id}] {brief description}"
   ```

CRITICAL RULES:
- ✅ ALWAYS work in the provided worktree path
- ✅ ALWAYS use the VCS-specific commit command above
- ✅ ALWAYS fix ALL linting errors before committing
- ❌ NEVER cd back to root directory
- ❌ NEVER bypass quality gates
```

**Variables to Inject**:
- `worktree_path`: From create_task_worktree result
- `branch_name`: From create_task_worktree result
- `base_ref`: Original base reference (e.g., "main")
- `vcs_mode`: Detected VCS mode ("git-spice", "merge-commit", "graphite")
- `vcs_commit_command`: Mode-specific commit instructions

**Complexity**: **S** (3-4 hours)

---

#### Point 5: Fallback (No MCP)

**Location**: Step 3 - When MCP not available

**Current Behavior**: Default behavior (agents in same directory)

**Required Change**: Show warning, continue with current behavior

**Implementation**:
```markdown
### For All Execution (WITHOUT MCP)

1. **Show Warning** (at command start):
   ```
   ⚠️  MCP Not Available

   Chopstack MCP server not detected. Executing without worktree isolation.

   Limitations:
   - Sequential: No isolation between tasks
   - Parallel: File conflicts likely if tasks touch same files
   - No automatic stack building

   To enable MCP features:
   1. Install chopstack MCP server
   2. Configure your editor to use MCP
   3. Re-run this command

   Continuing with standard execution...
   ```

2. **Proceed with Current Behavior**:
   - Sequential: Execute tasks one at a time in current directory
   - Parallel: Spawn all agents in current directory (risk of conflicts)
   - Use default commit command: `pnpm commit`

3. **Manual Stack Management**:
   - User must run `gs branch restack` or `gt restack` manually after execution
   - No automatic conflict resolution
```

**Benefits**:
- ✅ No breaking changes
- ✅ Graceful degradation
- ✅ Clear upgrade path

**Complexity**: **S** (2-3 hours)

---

### Changes Required

#### Sequential Execution Enhancements

**Before Task Execution**:
1. Detect MCP availability
2. Configure VCS mode
3. Create worktree for task
4. Inject worktree path and VCS mode into agent prompt

**After Task Execution**:
1. Integrate task stack (single task)
2. Cleanup worktree
3. Update base reference for next task

**Flow Modification**: Wrap each task in worktree lifecycle

---

#### Parallel Execution Enhancements

**Before Parallel Spawning**:
1. Detect MCP availability
2. Configure VCS mode
3. Create worktrees for ALL tasks (bulk operation)
4. Build agent prompts with task-specific worktree paths

**After All Agents Complete**:
1. Integrate entire task stack (all tasks at once)
2. Handle any merge conflicts
3. Cleanup all worktrees (bulk operation)

**Flow Modification**: Add worktree setup/teardown phases around parallel block

---

### Error Handling

#### MCP Tool Failures

**Scenario**: create_task_worktree fails

**Handling**:
```markdown
If MCP tool fails:
1. Show error with context:
   ```
   ❌ Worktree Creation Failed

   Task: {task-id}
   Error: {error_message}

   Possible causes:
   - Branch already exists
   - Worktree path conflicts
   - Git index locked

   Options:
   1. Retry: `chopstack execute-phase {project} {phase-id}`
   2. Manual cleanup: `git worktree prune` and retry
   3. Disable MCP: Continue without worktree isolation

   Continue without MCP? [y/N]:
   ```

2. If user confirms, fallback to no-MCP execution
3. If user declines, exit with error code 1
```

---

#### Worktree Conflicts

**Scenario**: Worktree path already exists

**Handling**:
- Attempt cleanup first: `cleanup_task_worktree(task-id)`
- Retry creation
- If still fails, fallback to no-MCP with warning

---

#### Integration Conflicts

**Scenario**: integrate_task_stack returns conflicts

**Handling**:
```markdown
If integration fails:
1. Show detailed conflict report:
   ```
   ❌ Stack Integration Conflict

   Phase: {phase-id}
   Conflicting Tasks: {conflicting_task_ids}
   Conflicting Files: {file_list}

   Resolution Required:
   1. Review conflicts in worktrees:
      - Task A worktree: {path_a}
      - Task B worktree: {path_b}

   2. Manually resolve conflicts

   3. Re-run integration:
      `chopstack integrate-stack {task-ids}`

   4. Or replan phase to avoid conflicts:
      - Split tasks to avoid file overlap
      - Change phase strategy to sequential
   ```

2. Keep worktrees intact for manual resolution
3. Exit with error code 1
```

---

#### Cleanup Failures

**Scenario**: cleanup_task_worktree fails

**Handling**:
- Log warning but don't block execution
- Suggest manual cleanup: `git worktree prune`
- Continue with next task

---

## Analysis

### Implementation Complexity

**By Integration Point**:

| Point | Description | Complexity | Effort |
|-------|-------------|------------|--------|
| 1 | MCP Detection | S | 2-3h |
| 2 | Sequential Worktrees | M | 4-6h |
| 3 | Parallel Worktrees | M | 5-7h |
| 4 | Agent Prompt Modification | S | 3-4h |
| 5 | Fallback (No MCP) | S | 2-3h |
| **Total** | | **M** | **16-23h** |

**Additional Work**:

| Task | Description | Complexity | Effort |
|------|-------------|------------|--------|
| Error Handling | All failure scenarios | S | 3-4h |
| Testing | Integration tests | M | 5-7h |
| Documentation | Update execute-phase.md | S | 2-3h |
| **Total** | | **S-M** | **10-14h** |

**Grand Total**: **M-L** (26-37 hours)

---

### Backward Compatibility Assessment

**Excellent** - MCP is purely additive:

✅ **Without MCP**:
- Command works exactly as before
- Clear warning shown
- No breaking changes
- Graceful degradation

✅ **With MCP**:
- Enhanced capabilities
- Optional feature
- User can opt-out with flag: `--no-mcp`

✅ **Migration Path**:
- Install MCP server
- No code changes needed
- Automatic detection
- Progressive enhancement

---

### Testing Requirements

#### Unit Tests

**New Tests Needed**:
1. MCP detection logic
2. Worktree path injection
3. VCS mode detection
4. Commit command generation
5. Error handling paths

**Effort**: 3-4 hours

---

#### Integration Tests

**Test Scenarios**:
1. **Sequential with MCP**:
   - Create worktrees
   - Execute tasks in isolation
   - Verify stack integration
   - Verify cleanup

2. **Parallel with MCP**:
   - Create multiple worktrees
   - Execute concurrently
   - Verify no conflicts
   - Verify stack integration

3. **Without MCP**:
   - Warning displayed
   - Current behavior preserved
   - No errors

4. **Error Scenarios**:
   - Worktree creation failure
   - Integration conflict
   - Cleanup failure

**Effort**: 5-7 hours

---

#### E2E Tests

**Test Scenarios**:
1. Full phase execution with git-spice mode
2. Full phase execution with merge-commit mode
3. Mixed sequential and parallel phases
4. Error recovery and retry

**Effort**: 4-5 hours

**Total Testing Effort**: 12-16 hours

---

## Recommendations

### Implementation Priority

**Phase 1: Foundation** (High Priority)
1. MCP detection and configuration (Point 1)
2. Fallback behavior (Point 5)
3. Error handling framework

**Phase 2: Sequential Support** (High Priority)
4. Sequential worktree creation (Point 2)
5. Agent prompt modification (Point 4)
6. Sequential integration and cleanup

**Phase 3: Parallel Support** (Medium Priority)
7. Parallel worktree creation (Point 3)
8. Bulk integration
9. Conflict handling

**Phase 4: Testing & Documentation** (Medium Priority)
10. Integration tests
11. E2E tests
12. Documentation updates

---

### Configuration Management

**Recommend**: Use environment-based configuration

**Config File** (~/.chopstack/config.yaml):
```yaml
vcs:
  mode: git-spice            # Default VCS mode
  enable_worktrees: true     # Enable MCP worktrees
  cleanup_on_success: true   # Cleanup after success
  cleanup_on_failure: false  # Keep worktrees on failure
```

**CLI Override**:
```bash
chopstack execute-phase chopstack-v2 phase-1 --vcs-mode merge-commit --no-mcp
```

**Detection Order**:
1. CLI flags (highest priority)
2. Project config (.chopstack/config.yaml)
3. Global config (~/.chopstack/config.yaml)
4. Auto-detection (check for gs, gt, sl binaries)
5. Default (merge-commit)

---

### Error Message Guidelines

**Key Principles**:
1. ✅ Clear error context (what failed, why)
2. ✅ Actionable resolution steps (numbered)
3. ✅ Options for user (retry, manual, continue)
4. ✅ Links to documentation

**Example**:
```
❌ MCP Worktree Creation Failed

Task: create-types
Error: Branch 'task/create-types' already exists

Resolution:
1. Check if worktree is leftover from previous run:
   git worktree list

2. Clean up manually:
   git worktree remove .chopstack/shadows/create-types
   git branch -d task/create-types

3. Retry execution:
   chopstack execute-phase {project} {phase-id}

Learn more: https://chopstack.dev/docs/troubleshooting/worktrees

Continue without MCP? [y/N]:
```

---

### Documentation Updates

**Files to Update**:

1. **.claude/commands/execute-phase.md**:
   - Add MCP detection section
   - Add worktree setup steps
   - Add VCS mode configuration
   - Add error handling examples

2. **CLAUDE.md**:
   - Document MCP integration
   - Explain VCS modes
   - Show configuration options
   - Add troubleshooting section

3. **README.md** (if exists):
   - Highlight MCP capabilities
   - Show installation steps
   - Link to detailed docs

**Effort**: 2-3 hours

---

## Task Implications

### Task Granularity

**Recommended Task Breakdown**:

1. **Task 1: MCP Detection Infrastructure** (S)
   - Implement MCP availability check
   - Implement VCS mode detection
   - Add configuration loading
   - Complexity: S (4-5 hours)

2. **Task 2: Sequential Worktree Support** (M)
   - Implement sequential worktree creation
   - Modify agent prompt injection
   - Add sequential integration
   - Add sequential cleanup
   - Complexity: M (8-10 hours)

3. **Task 3: Parallel Worktree Support** (M)
   - Implement bulk worktree creation
   - Modify parallel agent prompts
   - Add bulk integration
   - Add bulk cleanup
   - Complexity: M (10-12 hours)

4. **Task 4: Error Handling** (S)
   - Add worktree failure handling
   - Add integration conflict handling
   - Add cleanup failure handling
   - Complexity: S (4-5 hours)

5. **Task 5: Testing & Documentation** (M)
   - Write integration tests
   - Write E2E tests
   - Update documentation
   - Complexity: M (12-16 hours)

**Total**: 38-48 hours

---

### Dependencies

**Task Dependencies**:
```
Task 1 (MCP Detection) → Task 2 (Sequential) → Task 5 (Testing)
                      → Task 3 (Parallel)   → Task 5 (Testing)
                      → Task 4 (Error)      → Task 5 (Testing)
```

**Parallelization Opportunities**:
- Task 2 and Task 3 can be developed in parallel (different code paths)
- Task 4 can be developed in parallel with Task 2/3
- Task 5 must wait for all previous tasks

---

### Estimated Complexity

**Overall**: **M** (2-4 hours per task, 5 tasks = 38-48 hours total)

**Breakdown**:
- Foundation: S (4-5h)
- Sequential: M (8-10h)
- Parallel: M (10-12h)
- Error Handling: S (4-5h)
- Testing: M (12-16h)

**Confidence**: High (85%) - Clear requirements, existing infrastructure

---

## Conclusion

### Summary

The /execute-phase slash command is **well-structured** for MCP integration:

✅ **Strengths**:
- Clear orchestration flow
- Task tool pattern fits worktree lifecycle
- Separate sequential/parallel handling makes integration clean
- Existing error handling patterns

⚠️ **Challenges**:
- Prompt injection requires careful template modification
- Parallel execution needs bulk operations
- Conflict handling adds complexity

✅ **Backward Compatibility**:
- Excellent - MCP is optional enhancement
- Clear fallback path
- No breaking changes

### Integration Feasibility

**Assessment**: **HIGH** - Integration is straightforward with defined touch points

**Rationale**:
1. Command structure supports worktree lifecycle naturally
2. Agent prompt modification is well-defined
3. Error handling patterns exist
4. Testing infrastructure ready

### Effort Estimate

**Total Effort**: **38-48 hours** (M-L complexity)

**Critical Path**: 22-27 hours (Tasks 1 → 2 → 5)

**Parallelizable**: 16-21 hours (Tasks 3 + 4)

### Risk Assessment

**Low Risk** - Well-defined integration with clear patterns

**Mitigations**:
- Start with sequential support (simpler)
- Add parallel support incrementally
- Comprehensive testing at each phase
- Clear error messages for troubleshooting

### Recommended Next Steps

1. **Implement Phase 1** (MCP Detection + Fallback)
   - Quick win
   - Establishes foundation
   - Enables testing

2. **Implement Phase 2** (Sequential Support)
   - Core functionality
   - Immediate value
   - Proves pattern

3. **Implement Phase 3** (Parallel Support)
   - Advanced feature
   - Builds on sequential pattern
   - High value for complex projects

4. **Implement Phase 4** (Testing + Docs)
   - Ensures quality
   - Enables adoption
   - Completes feature

---

**Audit Complete** - Execute-phase is ready for MCP integration with clear implementation path.
