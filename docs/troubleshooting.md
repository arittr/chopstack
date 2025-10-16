# Troubleshooting Guide

This guide covers common issues with chopstack's VCS-agnostic worktree management and MCP integration, along with step-by-step resolutions.

## Table of Contents

- [Worktree Creation Failures](#worktree-creation-failures)
- [VCS Tool Unavailability](#vcs-tool-unavailability)
- [Merge Conflict Resolution](#merge-conflict-resolution)
- [MCP Server Connection Issues](#mcp-server-connection-issues)
- [Branch Naming Collisions](#branch-naming-collisions)
- [Orphaned Worktree Cleanup](#orphaned-worktree-cleanup)

---

## Worktree Creation Failures

### Problem: Branch Already Exists

**Error Message**:
```
❌ Worktree Creation Failed

Task: task-1-implement-auth
Error: A branch named 'task/task-1-implement-auth' already exists
```

**Cause**: Previous execution left a branch that wasn't cleaned up, or you're trying to create a worktree for a task that already has one.

**Resolution**:

1. **Check existing worktrees**:
   ```bash
   git worktree list
   ```

2. **If worktree exists, remove it**:
   ```bash
   git worktree remove .chopstack/shadows/task-1-implement-auth
   ```

   If the worktree directory was manually deleted, use force removal:
   ```bash
   git worktree remove --force .chopstack/shadows/task-1-implement-auth
   ```

3. **Delete the branch**:
   ```bash
   git branch -D task/task-1-implement-auth
   ```

4. **Retry task execution**:
   ```bash
   /execute-phase chopstack-v2 phase-1
   ```

### Problem: Worktree Directory Already Exists

**Error Message**:
```
❌ Worktree Creation Failed

Task: task-2-setup-types
Error: Directory '.chopstack/shadows/task-2-setup-types' already exists
```

**Cause**: Previous worktree was not properly cleaned up, leaving the directory behind.

**Resolution**:

1. **Check if worktree is registered**:
   ```bash
   git worktree list | grep task-2-setup-types
   ```

2. **If registered, remove properly**:
   ```bash
   git worktree remove .chopstack/shadows/task-2-setup-types
   ```

3. **If not registered, manually delete directory**:
   ```bash
   rm -rf .chopstack/shadows/task-2-setup-types
   ```

4. **Prune stale worktree references**:
   ```bash
   git worktree prune
   ```

5. **Retry task execution**.

### Problem: Invalid Base Reference

**Error Message**:
```
❌ Worktree Creation Failed

Task: task-3-add-validation
Error: Reference 'feature-branch' not found
```

**Cause**: Specified base reference (branch or commit) doesn't exist in the repository.

**Resolution**:

1. **List available branches**:
   ```bash
   git branch -a
   ```

2. **Verify the reference exists**:
   ```bash
   git rev-parse --verify feature-branch
   ```

3. **If branch doesn't exist, create it**:
   ```bash
   git checkout -b feature-branch origin/main
   ```

4. **Or use correct base reference** (typically `main` or `HEAD`):
   ```bash
   # Update config or CLI flag to use correct base
   ```

---

## VCS Tool Unavailability

### Problem: git-spice Binary Not Found (Explicit Mode)

**Error Message**:
```
❌ VCS Mode Not Available

Requested mode: git-spice (from ~/.chopstack/config.yaml)
Error: 'gs' binary not found in PATH
```

**Cause**: You configured `git-spice` mode explicitly, but the `gs` binary is not installed.

**Resolution**:

1. **Install git-spice**:

   Using Homebrew (macOS/Linux):
   ```bash
   brew install abhinav/git-spice/git-spice
   ```

   Using Go:
   ```bash
   go install go.abhg.dev/gs@latest
   ```

2. **Verify installation**:
   ```bash
   gs --version
   ```

3. **Ensure it's in your PATH**:
   ```bash
   which gs
   ```

   If not found, add Go bin to PATH:
   ```bash
   export PATH="$PATH:$(go env GOPATH)/bin"
   ```

4. **Retry execution**:
   ```bash
   /execute-phase chopstack-v2 phase-1
   ```

**Alternative**: Switch to merge-commit mode (no external dependencies):

Edit `~/.chopstack/config.yaml`:
```yaml
vcs:
  mode: merge-commit  # or remove this line to use default
```

### Problem: Graphite CLI Not Available (Explicit Mode)

**Error Message**:
```
❌ VCS Mode Not Available

Requested mode: graphite (from ~/.chopstack/config.yaml)
Error: 'gt' binary not found in PATH
```

**Cause**: You configured `graphite` mode, but the `gt` binary is not installed.

**Resolution**:

1. **Install Graphite CLI**:
   ```bash
   npm install -g @withgraphite/graphite-cli
   ```

2. **Verify installation**:
   ```bash
   gt --version
   ```

3. **Initialize Graphite in repository** (if needed):
   ```bash
   cd /path/to/your/repo
   gt repo init
   ```

4. **Retry execution**.

**Note**: Graphite backend is currently **stubbed** in chopstack. You'll see an error:
```
Error: GraphiteBackend not yet implemented. Use git-spice or merge-commit mode.
```

Use `git-spice` or `merge-commit` mode instead until Graphite is fully implemented.

### Problem: Git Binary Not Found

**Error Message**:
```
❌ VCS Configuration Failed

Error: Git not found. Please install git to use chopstack.
```

**Cause**: Git itself is not installed on your system.

**Resolution**:

1. **Install Git**:

   macOS:
   ```bash
   brew install git
   ```

   Ubuntu/Debian:
   ```bash
   sudo apt-get update
   sudo apt-get install git
   ```

   Windows:
   Download from https://git-scm.com/download/win

2. **Verify installation**:
   ```bash
   git --version
   ```

3. **Configure Git**:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```

---

## Merge Conflict Resolution

### Problem: Integration Conflicts Detected

**Error Message**:
```
❌ Stack Integration Failed

Task: task-2b-component-b
Conflicts detected:
  - src/components/shared.ts
  - src/types/common.ts

Resolution: Fix conflicts in worktree .chopstack/shadows/task-2b-component-b, then retry
```

**Cause**: Multiple tasks modified the same files in conflicting ways during parallel execution.

**Resolution**:

1. **Navigate to the conflicting worktree**:
   ```bash
   cd .chopstack/shadows/task-2b-component-b
   ```

2. **Check conflict status**:
   ```bash
   git status
   ```

3. **Review conflicted files**:
   ```bash
   # Open conflicted files in your editor
   code src/components/shared.ts
   code src/types/common.ts
   ```

4. **Resolve conflicts manually**:
   - Look for conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   - Choose which changes to keep
   - Remove conflict markers
   - Save files

5. **Stage resolved files**:
   ```bash
   git add src/components/shared.ts src/types/common.ts
   ```

6. **Complete the merge**:
   ```bash
   git commit -m "Resolve merge conflicts for task-2b"
   ```

7. **Return to main worktree**:
   ```bash
   cd ../..
   ```

8. **Retry stack integration**:
   ```bash
   # Re-run the integration tool or command
   ```

### Problem: Merge Conflicts After Parallel Execution

**Scenario**: Parallel tasks completed successfully but integration fails due to overlapping changes.

**Resolution**:

1. **Keep worktrees intact** (chopstack does this automatically on conflict)

2. **List all worktrees to see which have conflicts**:
   ```bash
   git worktree list
   ```

3. **For each conflicting worktree**, follow the resolution steps above.

4. **After resolving all conflicts, retry integration**:
   ```bash
   # Use integrate_task_stack MCP tool or slash command
   ```

---

## MCP Server Connection Issues

### Problem: MCP Server Not Running

**Error Message**:
```
❌ MCP Server Unavailable

The chopstack MCP server is required for parallel execution with worktrees.

Installation:
1. Install chopstack MCP server:
   npm install -g chopstack-mcp

2. Start the server:
   chopstack-mcp start

3. Verify server is running:
   curl http://localhost:3000/health
```

**Resolution**:

1. **Check if MCP server is installed**:
   ```bash
   which chopstack-mcp
   ```

2. **If not installed, install it**:
   ```bash
   pnpm install -g chopstack-mcp
   # or
   npm install -g chopstack-mcp
   ```

3. **Start the MCP server**:
   ```bash
   chopstack-mcp start
   ```

4. **Verify server is running**:
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status": "ok"}
   ```

5. **Retry execution**.

### Problem: MCP Server Connection Refused

**Error Message**:
```
❌ Cannot Connect to MCP Server

Error: Connection refused at http://localhost:3000
```

**Cause**: MCP server is not running, or is running on a different port.

**Resolution**:

1. **Check if server is running**:
   ```bash
   ps aux | grep chopstack-mcp
   ```

2. **If not running, start it**:
   ```bash
   chopstack-mcp start
   ```

3. **If running on different port, update configuration**:

   Edit `~/.chopstack/config.yaml`:
   ```yaml
   mcp:
     server_url: http://localhost:YOUR_PORT
   ```

4. **Check server logs for errors**:
   ```bash
   chopstack-mcp logs
   ```

### Problem: MCP Tool Not Found

**Error Message**:
```
❌ MCP Tool Not Available

Tool 'create_task_worktree' not found in MCP server
```

**Cause**: MCP server version is outdated or doesn't include VCS tools.

**Resolution**:

1. **Check MCP server version**:
   ```bash
   chopstack-mcp --version
   ```

2. **Update to latest version**:
   ```bash
   pnpm update -g chopstack-mcp
   ```

3. **Restart MCP server**:
   ```bash
   chopstack-mcp restart
   ```

4. **Verify tools are available**:
   ```bash
   chopstack-mcp tools list
   # Should include: configure_vcs, create_task_worktree, integrate_task_stack, etc.
   ```

---

## Branch Naming Collisions

### Problem: Branch Name Already Used

**Error Message**:
```
❌ Branch Collision Detected

Task: task-4-add-tests
Error: Branch 'task/task-4-add-tests' already exists

Attempted retry with suffix, but collision persists.
```

**Cause**: Previous task execution created a branch that wasn't cleaned up, or you're re-running the same task.

**Resolution**:

1. **List all task branches**:
   ```bash
   git branch | grep task/
   ```

2. **Check if branch has uncommitted work**:
   ```bash
   git log task/task-4-add-tests -1
   ```

3. **If branch can be safely deleted**:
   ```bash
   git branch -D task/task-4-add-tests
   ```

4. **If branch has important work, rename it**:
   ```bash
   git branch -m task/task-4-add-tests task/task-4-add-tests-backup
   ```

5. **Retry task execution**.

### Problem: Multiple Collision Retries Failed

**Scenario**: Chopstack attempts to create unique branch names with timestamps, but all attempts fail.

**Resolution**:

1. **Clean up all task branches from previous runs**:
   ```bash
   git branch | grep 'task/' | xargs git branch -D
   ```

2. **Prune worktree references**:
   ```bash
   git worktree prune
   ```

3. **Clean up shadow directories**:
   ```bash
   rm -rf .chopstack/shadows/*
   ```

4. **Retry execution from clean state**.

---

## Orphaned Worktree Cleanup

### Problem: Git Worktree List Shows Orphaned Entries

**Scenario**: You see worktrees listed that no longer have directories:

```bash
$ git worktree list
/Users/you/project                  abc123 [main]
/Users/you/project/.chopstack/shadows/task-1  def456 [task/task-1] (orphaned)
```

**Resolution**:

1. **Prune orphaned worktree references**:
   ```bash
   git worktree prune
   ```

2. **Verify orphaned entries are removed**:
   ```bash
   git worktree list
   ```

3. **If manual cleanup needed, remove from git config**:
   ```bash
   rm -rf .git/worktrees/task-1
   ```

### Problem: Shadow Directories Left Behind

**Scenario**: `.chopstack/shadows/` directory contains leftover worktree directories.

**Resolution**:

1. **List shadow directory contents**:
   ```bash
   ls -la .chopstack/shadows/
   ```

2. **Check which are still registered worktrees**:
   ```bash
   git worktree list
   ```

3. **For each unregistered directory, remove manually**:
   ```bash
   rm -rf .chopstack/shadows/task-old-1
   rm -rf .chopstack/shadows/task-old-2
   ```

4. **Clean up entire shadows directory** (if safe):
   ```bash
   rm -rf .chopstack/shadows/*
   git worktree prune
   ```

### Problem: Cannot Remove Worktree - Files Modified

**Error Message**:
```
❌ Worktree Removal Failed

Error: Worktree contains modified files
Path: .chopstack/shadows/task-5
```

**Resolution**:

1. **Navigate to worktree**:
   ```bash
   cd .chopstack/shadows/task-5
   ```

2. **Check status**:
   ```bash
   git status
   ```

3. **Decide on action**:

   **Option A - Commit changes**:
   ```bash
   git add .
   git commit -m "WIP: Save task-5 work"
   cd ../..
   git worktree remove .chopstack/shadows/task-5
   ```

   **Option B - Discard changes**:
   ```bash
   git reset --hard
   cd ../..
   git worktree remove .chopstack/shadows/task-5
   ```

   **Option C - Force removal** (loses changes):
   ```bash
   cd ../..
   git worktree remove --force .chopstack/shadows/task-5
   ```

### Problem: Bulk Cleanup After Failed Execution

**Scenario**: Execution failed mid-way, leaving multiple orphaned worktrees and branches.

**Resolution**:

1. **Create cleanup script** (`cleanup-worktrees.sh`):
   ```bash
   #!/bin/bash

   echo "Cleaning up chopstack worktrees..."

   # Remove all task worktrees
   for worktree in .chopstack/shadows/task-*; do
     if [ -d "$worktree" ]; then
       echo "Removing worktree: $worktree"
       git worktree remove --force "$worktree" 2>/dev/null || true
     fi
   done

   # Prune worktree references
   git worktree prune

   # Delete all task branches
   git branch | grep 'task/' | xargs -r git branch -D

   # Clean shadow directory
   rm -rf .chopstack/shadows/*

   echo "Cleanup complete!"
   ```

2. **Make executable and run**:
   ```bash
   chmod +x cleanup-worktrees.sh
   ./cleanup-worktrees.sh
   ```

3. **Verify cleanup**:
   ```bash
   git worktree list
   git branch | grep task/
   ls -la .chopstack/shadows/
   ```

---

## Advanced Troubleshooting

### Enabling Debug Logging

For more detailed error information, enable verbose logging:

```bash
# Set environment variable
export LOG_LEVEL=debug

# Or use --verbose flag
chopstack execute --verbose
```

### Inspecting MCP Server State

Check MCP server internal state:

```bash
# View active worktrees
curl http://localhost:3000/api/worktrees

# View current VCS mode
curl http://localhost:3000/api/vcs/config
```

### Checking Git Repository Health

If experiencing persistent issues, verify git repository health:

```bash
# Check repository integrity
git fsck

# Verify all references
git show-ref

# Check for corrupted objects
git gc --prune=now
```

---

## Getting Help

If you continue to experience issues after following this guide:

1. **Check the logs**:
   ```bash
   tail -f ~/.chopstack/logs/chopstack.log
   ```

2. **Report an issue**: https://github.com/your-org/chopstack/issues
   - Include error messages
   - Include `chopstack --version` output
   - Include `git --version` output
   - Include VCS mode from config

3. **Join community**: Discord/Slack channels for real-time support

---

## Quick Reference

### Common Commands

```bash
# List all worktrees
git worktree list

# Remove a worktree
git worktree remove <path>

# Prune orphaned worktrees
git worktree prune

# List task branches
git branch | grep task/

# Delete a task branch
git branch -D task/<task-id>

# Check MCP server status
curl http://localhost:3000/health

# View chopstack logs
tail -f ~/.chopstack/logs/chopstack.log
```

### Configuration Locations

- **Global config**: `~/.chopstack/config.yaml`
- **Project config**: `.chopstack/config.yaml`
- **Logs**: `~/.chopstack/logs/chopstack.log`
- **Shadow worktrees**: `.chopstack/shadows/`

---

**Last Updated**: 2025-10-16
