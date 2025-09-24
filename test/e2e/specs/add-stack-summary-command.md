# Add Stack Summary Command to Chopstack CLI

## Overview

Introduce a new `stack summary` subcommand that surfaces a concise overview of the current PR stack state. The command should be non-destructive, quick to run, and helpful when sanity-checking what chopstack has generated locally.

## Objectives

1. **Command Wiring**
   - Add a `summary` subcommand under the existing `stack` command.
   - Support `--json` output for scripting and the default human-readable table view.
   - Reuse the existing CLI command registration pattern.

2. **Stack Inspection Logic**
   - Read metadata from `.chopstack/stack-plan.yaml` (or the latest plan file in the directory).
   - For each task in the plan, gather:
     - Task id, title, and status (derived from git state or metadata if available).
     - Target branch (e.g. `chopstack/task-abc`) and whether the branch exists.
     - Pending changes (files staged/uncommitted inside the worktree if present).
   - Aggregate high-level stats: total tasks, ready-to-commit count, failed/conflicted count.

3. **Output Format**
   - Human-readable table listing each task with status icon, branch, and brief description.
   - JSON output should contain the same data structure, suitable for tooling.
   - Include a footer summary with counts and next-step hints (e.g. "2 tasks ready to push").

4. **Error Handling**
   - Gracefully handle missing plan file, missing worktrees, or git errors with actionable messages.
   - Exit with non-zero status if the stack cannot be summarised.

## Constraints & Notes

- Do not mutate git state; the command is read-only.
- Prefer existing utilities for git/worktree inspection where possible.
- Keep the implementation focused—this is diagnostic tooling, not execution.
- Follow the established logging style and ts-pattern-based branching.
- Add targeted unit tests for the new command and integration coverage that exercises both table and JSON output paths.
