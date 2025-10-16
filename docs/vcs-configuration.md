# VCS Mode Configuration Guide

**Version**: 1.0
**Last Updated**: 2025-10-16

This guide explains how to configure chopstack's VCS (Version Control System) mode for different Git workflows, including git-spice stacking, simple merge-commit workflows, and alternative stacking tools like Graphite.

---

## Overview

chopstack supports multiple VCS backends through a strategy pattern, allowing you to choose the workflow that best fits your team:

| Mode | Status | Description | Prerequisites | Use Case |
|------|--------|-------------|---------------|----------|
| `git-spice` | ✅ Implemented | Stacked PR workflow with native git-spice operations | `gs` binary | Teams using stacked PRs with git-spice |
| `merge-commit` | ✅ Implemented | Simple merge workflow without parent tracking | `git` only | Teams preferring simple merge-based workflows |
| `graphite` | 🚧 Stub | Alternative stacked PR workflow (placeholder) | `gt` binary | Teams using Graphite CLI (future support) |
| `sapling` | 🚧 Stub | Sapling workflow (placeholder) | `sl` binary | Teams using Sapling (future support) |

---

## Configuration File Format

chopstack uses YAML configuration files for VCS mode settings. Configuration files can be placed at two levels:

1. **Global Config**: `~/.chopstack/config.yaml` (user-wide defaults)
2. **Project Config**: `.chopstack/config.yaml` (repository-specific settings)

### Full Configuration Example

```yaml
# VCS Configuration
vcs:
  # VCS mode: git-spice | merge-commit | graphite | sapling
  # If specified: Tool must be available (no fallback)
  # If omitted: Defaults to merge-commit (requires only git)
  mode: git-spice

  # Main branch name (default: main)
  trunk: main

  # Worktree settings
  enable_worktrees: true
  worktree_path: .chopstack/shadows

  # Cleanup behavior
  cleanup_on_success: true
  cleanup_on_failure: false

  # Branch naming
  branch_prefix: task
  include_run_id: false

  # Stack settings (git-spice, graphite only)
  auto_restack: true
  submit_on_complete: false
```

### Minimal Configuration Examples

**Git-Spice (Explicit Mode)**:
```yaml
vcs:
  mode: git-spice
  trunk: main
```

**Merge-Commit (Explicit Mode)**:
```yaml
vcs:
  mode: merge-commit
  trunk: main
  cleanup_on_success: true
```

**Default Mode (No Configuration)**:
If no configuration is provided, chopstack defaults to `merge-commit` mode, which requires only the `git` binary.

---

## Configuration Priority

chopstack uses the following priority order when determining configuration:

1. **CLI arguments** (highest priority)
2. **Project config** (`.chopstack/config.yaml` in repository)
3. **Global config** (`~/.chopstack/config.yaml`)
4. **Defaults** (lowest priority)

### Example: CLI Override

```bash
# Override mode via CLI flag
chopstack execute --vcs-mode merge-commit

# Project config says git-spice, but CLI wins
```

---

## Explicit vs Default Mode

### Explicit Mode (User Configured)

When you **explicitly configure** a VCS mode in config or via CLI:

- **Tool MUST be available** (no fallback)
- Fails immediately with installation instructions if tool is missing
- Respects user intent - if you want git-spice, you get git-spice or an error

**Example Error (Explicit git-spice, tool missing)**:
```
❌ VCS Mode Not Available

Requested mode: git-spice (from ~/.chopstack/config.yaml)
Error: 'gs' binary not found in PATH

Installation:
1. Install git-spice:
   brew install abhinav/git-spice/git-spice
   # or
   go install go.abhg.dev/gs@latest

2. Verify installation:
   gs --version

3. Retry execution:
   /execute-phase chopstack-v2 phase-1

Alternative: Change mode in config
  ~/.chopstack/config.yaml:
    vcs:
      mode: merge-commit  # or remove to use merge-commit default
```

### Default Mode (No Configuration)

When **no mode is specified** in config or CLI:

- Uses `merge-commit` mode (requires only git)
- Always succeeds if git is available
- User can configure explicit mode for stacking workflows

**Rationale**: Simplifies configuration - merge-commit works everywhere git works. Users who want stacking (git-spice, graphite) must explicitly configure it, ensuring they understand the behavior change.

---

## VCS Mode Details

### git-spice Mode

**Status**: ✅ Fully Implemented

**Description**: Native stacking workflow using the git-spice CLI (`gs`). Creates parent/child branch relationships and supports automatic restacking and stack submission.

**Prerequisites**:
- `gs` binary installed
- Git repository initialized

**Installation**:
```bash
# macOS (Homebrew)
brew install abhinav/git-spice/git-spice

# Go
go install go.abhg.dev/gs@latest

# Verify
gs --version
```

**Configuration**:
```yaml
vcs:
  mode: git-spice
  trunk: main
  auto_restack: true
  submit_on_complete: false
```

**Workflow Characteristics**:
- Creates stacked branches with `gs branch create`
- Commits via `gs commit create`
- Automatic restacking with `gs upstack restack`
- Stack submission with `gs stack submit`
- Branch tracking: Parent/child relationships maintained

**When to Use**:
- Team uses stacked PRs
- Complex dependency chains between tasks
- Need automatic restacking after changes
- Want integrated PR submission

**Example Stack Result**:
```
main → task-1 → task-2 → task-3
```

---

### merge-commit Mode

**Status**: ✅ Fully Implemented

**Description**: Simple merge workflow without parent tracking. All task branches are created from the same base and merged with `--no-ff`.

**Prerequisites**:
- `git` binary installed (standard Git)

**Installation**:
No additional installation needed - uses standard Git.

**Configuration**:
```yaml
vcs:
  mode: merge-commit
  trunk: main
  cleanup_on_success: true
```

**Workflow Characteristics**:
- Creates branches from merge-base with `git checkout -b`
- Commits via standard `git commit`
- Merges with `--no-ff` (creates merge commits)
- No parent/child tracking (flat branch structure)
- Manual or API-based PR creation

**When to Use**:
- Team prefers simple merge-based workflows
- No stacking requirements
- Want minimal tooling dependencies
- Standard GitHub/GitLab PR workflow

**Example Stack Result**:
```
main ← task-1 (merged)
main ← task-2 (merged)
main ← task-3 (merged)
```

---

### graphite Mode

**Status**: 🚧 Stub (Placeholder)

**Description**: Alternative stacked PR workflow using Graphite CLI (`gt`). Similar to git-spice but with Graphite-specific features.

**Prerequisites**:
- `gt` binary installed (when implemented)

**Installation** (Future):
```bash
# npm
npm install -g @withgraphite/graphite-cli

# Verify
gt --version
```

**Configuration** (Future):
```yaml
vcs:
  mode: graphite
  trunk: main
  auto_restack: true
```

**Current Behavior**:
- `isAvailable()` returns `false`
- All operations throw error: "GraphiteBackend not yet implemented. Use git-spice or merge-commit mode."

**Future Implementation**:
- Estimated complexity: M (600-800 lines, 4-6 days)
- Reusability: 70% from git-spice patterns
- Commands: `gt branch create`, `gt commit create`, `gt restack`, `gt stack submit`

**Documentation**: [Graphite CLI Docs](https://graphite.dev/docs/graphite-cli)

---

### sapling Mode

**Status**: 🚧 Stub (Placeholder)

**Description**: Sapling workflow (Meta's VCS). Note: Sapling uses a different model incompatible with git worktrees.

**Prerequisites**:
- `sl` binary installed (when implemented)

**Current Behavior**:
- `isAvailable()` returns `false`
- All operations throw error: "SaplingBackend not yet implemented. Use git-spice or merge-commit mode."

**Note**: Sapling backend will require significant architecture changes due to worktree incompatibility. Future implementation is uncertain.

**Documentation**: [Sapling Docs](https://sapling-scm.com/docs/introduction/getting-started)

---

## Mode Selection Decision Tree

Use this decision tree to choose the right VCS mode:

```
Do you need stacked PRs?
├── Yes
│   ├── Using git-spice?
│   │   └── Choose: git-spice
│   ├── Using Graphite?
│   │   └── Choose: graphite (when implemented)
│   └── Neither?
│       └── Choose: git-spice (recommended)
└── No
    └── Choose: merge-commit (default)
```

**Quick Recommendations**:

- **Stacked PR team with git-spice**: `mode: git-spice`
- **Simple merge workflow**: `mode: merge-commit` (or omit mode entirely)
- **Graphite users**: Wait for graphite backend implementation
- **First-time user**: Start with default mode (merge-commit) and upgrade to git-spice if needed

---

## Configuration Fields Reference

### Core Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `git-spice \| merge-commit \| graphite \| sapling` | `merge-commit` | VCS mode selection |
| `trunk` | `string` | `main` | Main branch name |
| `enable_worktrees` | `boolean` | `true` | Enable isolated worktrees for parallel execution |

### Worktree Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `worktree_path` | `string` | `.chopstack/shadows` | Directory for worktrees (relative to repo root) |
| `cleanup_on_success` | `boolean` | `true` | Remove worktrees after successful integration |
| `cleanup_on_failure` | `boolean` | `false` | Remove worktrees after failed execution (keep for debugging) |

### Branch Naming

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `branch_prefix` | `string` | `task` | Prefix for task branches (e.g., `task/task-1`) |
| `include_run_id` | `boolean` | `false` | Include run ID in branch names for uniqueness |

### Stack Settings (git-spice, graphite only)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_restack` | `boolean` | `true` | Automatically restack after task completion |
| `submit_on_complete` | `boolean` | `false` | Automatically submit stack for review (create PRs) |

---

## Troubleshooting

### Issue: VCS tool not found

**Symptoms**:
```
Error: VCS mode 'git-spice' is not available.
Error: 'gs' binary not found in PATH
```

**Resolution**:

1. Check if tool is installed:
   ```bash
   # git-spice
   gs --version

   # graphite
   gt --version
   ```

2. Install the tool (see mode-specific installation instructions above)

3. Verify PATH includes tool location:
   ```bash
   which gs
   # Should output: /usr/local/bin/gs (or similar)
   ```

4. Retry operation or change mode to `merge-commit` in config

---

### Issue: Mode fallback not working

**Symptoms**:
```
Expected: Fallback to merge-commit
Actual: Error about missing tool
```

**Cause**: You have **explicitly configured** a mode in config or CLI.

**Resolution**:

**Option 1** (Install required tool):
```bash
# Install the explicitly configured tool
brew install abhinav/git-spice/git-spice
```

**Option 2** (Change to default mode):
```yaml
# Remove explicit mode from config
vcs:
  # mode: git-spice  # Comment out or remove
  trunk: main
```

**Option 3** (Use different explicit mode):
```yaml
vcs:
  mode: merge-commit  # Explicitly use merge-commit
  trunk: main
```

**Remember**: Fallback only works when **no mode is specified**. Explicit modes must be available.

---

### Issue: Worktree creation fails

**Symptoms**:
```
Error: Branch 'task/task-1' already exists
Error: Worktree path already exists
```

**Resolution**:

1. List existing worktrees:
   ```bash
   git worktree list
   ```

2. Remove leftover worktree:
   ```bash
   git worktree remove .chopstack/shadows/task-1
   git branch -d task/task-1
   ```

3. Clean up orphaned worktrees:
   ```bash
   git worktree prune
   ```

4. Retry execution

---

### Issue: Branch naming collisions

**Symptoms**:
```
Error: Branch 'task/my-feature' already exists
```

**Resolution**:

**Option 1** (Enable run ID in branch names):
```yaml
vcs:
  branch_prefix: task
  include_run_id: true  # Creates: task/run-abc123/my-feature
```

**Option 2** (Delete existing branch):
```bash
git branch -d task/my-feature
```

**Option 3** (Change branch prefix):
```yaml
vcs:
  branch_prefix: chopstack  # Creates: chopstack/my-feature
```

---

### Issue: Auto-restack fails

**Symptoms**:
```
Error: gs upstack restack failed
```

**Cause**: git-spice cannot restack due to conflicts or invalid stack state.

**Resolution**:

1. Check stack status:
   ```bash
   gs stack log
   ```

2. Manually resolve conflicts:
   ```bash
   # Navigate to worktree
   cd .chopstack/shadows/task-1

   # Check status
   git status

   # Resolve conflicts in affected files
   # Then continue restack
   gs upstack restack --continue
   ```

3. If restack is broken, disable auto-restack:
   ```yaml
   vcs:
     mode: git-spice
     auto_restack: false  # Manual restacking
   ```

---

## Migration from Old System

If you're migrating from an older version of chopstack or a custom VCS setup:

### Step 1: Identify Current Workflow

- **Using git-spice manually?** → `mode: git-spice`
- **Using merge-based workflow?** → `mode: merge-commit` (or omit mode)
- **Using Graphite?** → Wait for graphite backend implementation

### Step 2: Create Configuration

Create `~/.chopstack/config.yaml`:

```yaml
vcs:
  mode: <your-mode>
  trunk: main  # or your main branch name
```

### Step 3: Test Configuration

Verify mode is detected correctly:

```bash
# MCP tool will validate mode
chopstack execute --help
```

Check logs for:
```
VCS mode: git-spice (explicit)
Tool available: true
```

### Step 4: Update CI/CD

Ensure CI/CD environments have required tools:

```yaml
# GitHub Actions example
- name: Install git-spice
  run: brew install abhinav/git-spice/git-spice

# Or for merge-commit (no extra tools needed)
- name: Verify git
  run: git --version
```

### Step 5: Update Team Documentation

Document the chosen VCS mode in your team's README:

```markdown
## Development Setup

chopstack uses **git-spice** for stacked PRs.

Install git-spice:
```bash
brew install abhinav/git-spice/git-spice
```

Configure chopstack:
```bash
# Create ~/.chopstack/config.yaml
vcs:
  mode: git-spice
  trunk: main
```
```

---

## Advanced Configuration

### Per-Project Overrides

Use project-level config to override global settings:

**Global** (`~/.chopstack/config.yaml`):
```yaml
vcs:
  mode: merge-commit  # Default for all projects
  trunk: main
```

**Project** (`.chopstack/config.yaml` in repo):
```yaml
vcs:
  mode: git-spice  # Override for this project only
  trunk: develop  # Different main branch
  auto_restack: true
```

### Environment-Specific Configuration

Use environment variables for dynamic configuration:

```bash
# Override mode via environment
export CHOPSTACK_VCS_MODE=merge-commit
chopstack execute
```

**Note**: CLI args still have highest priority.

### Custom Worktree Paths

For teams with specific directory structures:

```yaml
vcs:
  worktree_path: .custom-shadows  # Custom worktree directory
  branch_prefix: feature  # Custom branch prefix
```

**Result**: Branches created as `feature/task-1` in `.custom-shadows/task-1`

---

## Best Practices

### 1. Explicit Configuration for Teams

Always use explicit mode in team repositories:

```yaml
# .chopstack/config.yaml in repo
vcs:
  mode: git-spice  # Explicit team standard
  trunk: main
  auto_restack: true
```

**Why**: Prevents confusion from different default modes on different machines.

### 2. Cleanup Configuration

Configure cleanup based on debugging needs:

**Development** (keep worktrees for debugging):
```yaml
vcs:
  cleanup_on_success: false  # Keep worktrees even on success
  cleanup_on_failure: false  # Keep worktrees for debugging
```

**CI/CD** (aggressive cleanup):
```yaml
vcs:
  cleanup_on_success: true  # Clean up immediately
  cleanup_on_failure: true  # Always clean up
```

### 3. Branch Naming Conventions

Use descriptive branch prefixes:

```yaml
vcs:
  branch_prefix: feature    # For features: feature/task-1
  # or
  branch_prefix: chopstack  # For chopstack tasks: chopstack/task-1
  # or
  branch_prefix: cs         # Short prefix: cs/task-1
```

### 4. Auto-Restack Strategy

**Enable auto-restack** for fast iteration:
```yaml
vcs:
  auto_restack: true  # Automatic restacking
```

**Disable auto-restack** for complex stacks:
```yaml
vcs:
  auto_restack: false  # Manual control
```

### 5. Stack Submission

**Disable for manual review**:
```yaml
vcs:
  submit_on_complete: false  # Manual PR creation
```

**Enable for automated workflows**:
```yaml
vcs:
  submit_on_complete: true  # Automatic PR creation
```

---

## Examples

### Example 1: Team Using git-spice

**Team Setup**:
- Uses stacked PRs
- git-spice installed on all dev machines
- Aggressive cleanup in CI/CD

**Configuration**:
```yaml
# .chopstack/config.yaml (in repo)
vcs:
  mode: git-spice
  trunk: main
  worktree_path: .chopstack/shadows
  cleanup_on_success: true
  cleanup_on_failure: false  # Keep for debugging
  branch_prefix: task
  auto_restack: true
  submit_on_complete: false  # Manual PR review
```

**Developer Workflow**:
1. Run `chopstack execute` (uses git-spice mode)
2. Parallel agents create stacked branches
3. Auto-restack after each task
4. Manual PR submission with `gs stack submit`

---

### Example 2: Team Using merge-commit

**Team Setup**:
- Simple merge-based workflow
- No stacking requirements
- Standard GitHub PR process

**Configuration**:
```yaml
# .chopstack/config.yaml (in repo)
vcs:
  mode: merge-commit
  trunk: main
  cleanup_on_success: true
```

**Developer Workflow**:
1. Run `chopstack execute` (uses merge-commit mode)
2. Parallel agents create independent branches
3. Branches merged to main with `--no-ff`
4. Manual PR creation via GitHub UI

---

### Example 3: Mixed Workflow (per-project)

**Setup**:
- Most projects use merge-commit
- One project uses git-spice

**Global Config** (`~/.chopstack/config.yaml`):
```yaml
vcs:
  mode: merge-commit  # Default for all projects
  trunk: main
```

**Project Config** (`.chopstack/config.yaml` in git-spice repo):
```yaml
vcs:
  mode: git-spice  # Override for this project
  auto_restack: true
```

**Result**:
- Most projects use merge-commit (global default)
- git-spice project uses git-spice (project override)

---

## FAQ

### Q: What happens if I don't configure any VCS mode?

**A**: chopstack defaults to `merge-commit` mode, which requires only the standard `git` binary. This is the simplest configuration and works for most teams.

### Q: Can I switch modes after starting a project?

**A**: Yes, but be aware:
- Existing branches may not follow the new mode's conventions
- Stack relationships (git-spice) won't be retroactively created
- Recommend starting fresh with new tasks

### Q: Why does explicit mode fail instead of falling back?

**A**: Explicit mode respects user intent. If you configured `git-spice`, you want git-spice - not a silent fallback to a different workflow. This prevents unexpected behavior changes.

### Q: How do I check which mode is active?

**A**: Check logs during execution:
```
VCS mode: git-spice (explicit)
Tool available: true
Capabilities: stacking=true, parallel=true
```

### Q: Can I use different modes for different phases?

**A**: No. VCS mode is configured once per execution. All phases use the same mode.

### Q: What if my team uses both git-spice and merge-commit?

**A**: Configure per-project:
- Set global default to `merge-commit`
- Override with `.chopstack/config.yaml` in repos that need git-spice

---

## Related Documentation

- **VCS Backend Abstraction**: See `CLAUDE.md` section "VCS Backend Abstraction"
- **MCP VCS Tools**: See `CLAUDE.md` section "MCP VCS Tools"
- **Troubleshooting**: See `docs/troubleshooting.md` (if available)
- **Slash Command Integration**: See `.claude/commands/execute-phase.md`

---

## Changelog

### Version 1.0 (2025-10-16)

- Initial documentation
- Documented git-spice and merge-commit modes
- Added configuration examples
- Added troubleshooting guide
- Added migration guide

---

**Questions or Issues?**

If you encounter configuration issues not covered in this guide, please:
1. Check the troubleshooting section
2. Verify tool installation and PATH
3. Review error messages for specific resolution steps
4. Consult team documentation for project-specific settings
