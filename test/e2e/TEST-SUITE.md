# Chopstack E2E Test Suite

This directory contains comprehensive end-to-end tests for the chopstack execution engine, covering all execution modes and parallel/serial strategies.

## Test Cases

### 🔹 `simple-single-task.yaml`
**Purpose**: Basic functionality test with a single task
- **Tasks**: 1 task (create README file)
- **Execution**: Serial (single task)
- **Files**: Creates `README-test.md`
- **Use Case**: Validate basic execution modes work

### 🔹 `parallel-tasks.yaml`
**Purpose**: Parallel execution with independent tasks
- **Tasks**: 2 parallel tasks (create fileA.txt, fileB.txt)
- **Execution**: Parallel (triggers worktree creation)
- **Files**: Creates `test-files/fileA.txt` and `test-files/fileB.txt`
- **Use Case**: Validate git worktree system and parallel execution

### 🔹 `stacked-dependencies.yaml`
**Purpose**: Sequential execution with dependencies
- **Tasks**: 3 tasks with linear dependencies (base-config → add-feature-auth → add-feature-api)
- **Execution**: Serial due to dependencies
- **Files**: Creates and modifies `chopstack-test-config.json`
- **Use Case**: Validate dependency resolution and file modification chains

### 🔹 `complex-parallel-layers.yaml`
**Purpose**: Multi-layer execution with complex dependencies
- **Tasks**: 6 tasks in 3 execution layers
  - Layer 1: 2 parallel tasks (setup-types, setup-utils)
  - Layer 2: 3 parallel tasks (config, logger, validator components)
  - Layer 3: 1 task (main integration)
- **Execution**: Mixed parallel/serial across layers
- **Files**: Creates complete TypeScript project structure
- **Use Case**: Validate complex DAG execution and layer management

## Quick Start

```bash
# Navigate to test directory
cd test/e2e

# Run a single test in dry-run mode (safe)
./run-tests.sh simple-single-task dry-run parallel

# Run parallel tasks test to see worktree creation
./run-tests.sh parallel-tasks dry-run parallel

# Run all tests in validate mode
./run-tests.sh all validate parallel

# Clean up any test artifacts
./run-tests.sh cleanup
```

## Execution Modes

| Mode | Description | Safety | Purpose |
|------|-------------|---------|---------|
| `dry-run` | Simulates execution, shows what would happen | ✅ Safe | Testing task flow and validation |
| `validate` | Checks task readiness and dependencies | ✅ Safe | Validation testing |
| `plan` | Generates Claude execution plans | ✅ Safe | Plan generation testing |
| `execute` | **Actually runs Claude and makes changes** | ⚠️ Modifies files | Real execution testing |

## Expected Outputs

### Dry-Run Mode
```
[chopstack] Starting execution in dry-run mode
[chopstack] Strategy: parallel
[chopstack] Tasks: 2
[chopstack] Running in dry-run mode (no actual changes)...
[chopstack] Would execute 2 tasks in parallel:
[chopstack]   - task-a: Create file A
[chopstack]   - task-b: Create file B
✅ Execution completed successfully
📊 Tasks: 2/2 completed, 0 failed, 0 skipped
```

### Execute Mode with Parallel Tasks
```
[chopstack] Starting execution in execute mode
[chopstack] Strategy: parallel
[chopstack] Tasks: 2
[chopstack] Executing tasks with full changes...
[orchestrator] Working directory: .chopstack-shadows/task-a
[orchestrator] Working directory: .chopstack-shadows/task-b
```

### Git Worktree Status (during/after parallel execution)
```bash
git worktree list
# /main-repo [main]
# /main-repo/.chopstack-shadows/create-file-a [chopstack/create-file-a]
# /main-repo/.chopstack-shadows/create-file-b [chopstack/create-file-b]
```

## Test Validation Checklist

### ✅ All Execution Modes
- [ ] `dry-run` completes without errors
- [ ] `validate` passes validation checks
- [ ] `plan` generates execution plans
- [ ] `execute` creates actual files (use with caution)

### ✅ Parallel Execution
- [ ] Multiple tasks trigger worktree creation
- [ ] Tasks run in isolated `.chopstack-shadows/` directories
- [ ] Git branches created per task (`chopstack/task-id`)
- [ ] No conflicts between parallel tasks

### ✅ Dependency Resolution
- [ ] Sequential tasks wait for dependencies
- [ ] Complex DAG creates proper execution layers
- [ ] File conflicts detected and resolved

### ✅ Error Handling
- [ ] Clear error messages (no "[object Object]")
- [ ] Failed tasks show meaningful errors
- [ ] Proper cleanup on failures

## Development Workflow

### Adding New Tests
1. Create `test-name.yaml` in `specs/` directory
2. Add test name to `AVAILABLE_TESTS` array in `run-tests.sh`
3. Test with dry-run mode first
4. Add cleanup logic if test creates files

### Debugging Tests
```bash
# Run with verbose output
./run-tests.sh test-name dry-run parallel

# Check test workspace for artifacts
ls -la /Users/drewritter/projects/typescript-nextjs-starter/

# Check git worktree status
cd /Users/drewritter/projects/typescript-nextjs-starter
git worktree list

# Clean up if needed
./run-tests.sh cleanup
```

### CI/CD Integration
```bash
# Safe CI tests (no file modifications)
./run-tests.sh all validate parallel
./run-tests.sh all dry-run parallel

# Full integration tests (with cleanup)
./run-tests.sh all execute parallel
./run-tests.sh cleanup
```

## Test Results Interpretation

### Success Indicators
- All tasks show "completed" status
- No error messages in output
- Expected file structure created (in execute mode)
- Git worktrees created and cleaned up properly

### Failure Indicators
- Tasks show "failed" status
- Error messages with specific details
- Unexpected file modifications
- Orphaned git worktrees

## Performance Benchmarks

Track these metrics across test runs:
- **Execution time** per test case
- **Parallelization efficiency** (actual vs theoretical speedup)
- **Memory usage** during parallel execution
- **Git worktree creation/cleanup time**

## Contributing

When adding new test cases:
1. Follow the existing YAML structure
2. Use descriptive task IDs and titles
3. Include cleanup in the test runner
4. Test all execution modes
5. Document expected behavior