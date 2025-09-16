# E2E Integration Tests

This directory contains comprehensive end-to-end integration tests for chopstack that test the complete workflow against real codebases, including full execution testing with git worktrees.

## Setup

### 1. Clone Test Repository

The E2E tests expect the Next.js TypeScript starter to be available at `../typescript-nextjs-starter`:

```bash
# From the chopstack-mcp directory
cd ..
git clone https://github.com/jpedroschmitz/typescript-nextjs-starter
cd chopstack-mcp
```

### 2. Set Environment Variables

For tests that use the Claude agent, you need an Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### 3. Build Chopstack

Ensure chopstack is built before running E2E tests:

```bash
pnpm run build
```

## Running Tests

### Jest E2E Tests (Plan Generation)

```bash
# Run Jest-based E2E tests (plan generation only)
pnpm run test:e2e

# Run all tests (Unit + E2E)
pnpm run test

# Run unit tests only
pnpm run test:unit
```

### Chopstack Execution Tests

```bash
# Run all chopstack execution tests (safe dry-run mode)
pnpm run test:e2e:all

# Run specific test scenarios
pnpm run test:e2e:simple    # Single task execution
pnpm run test:e2e:parallel  # Parallel task execution with worktrees

# Manual test execution with different modes
./test/e2e/run-tests.sh parallel-tasks dry-run parallel
./test/e2e/run-tests.sh stacked-dependencies validate serial
./test/e2e/run-tests.sh complex-parallel-layers plan parallel

# Clean up test artifacts
pnpm run test:e2e:cleanup
```

## Test Structure

### Test Specs (`specs/`)

**Markdown Specifications (for Jest tests):**
- `add-dark-mode.md`: A realistic dark mode implementation spec for testing

**YAML Test Plans (for execution tests):**
- `simple-single-task.yaml`: Basic single task execution
- `parallel-tasks.yaml`: Two parallel tasks that trigger git worktree creation
- `stacked-dependencies.yaml`: Sequential tasks with dependencies
- `complex-parallel-layers.yaml`: Multi-layer execution with 6 tasks across 3 layers

**Test Runner:**
- `run-tests.sh`: Comprehensive test runner with cleanup functionality
- `TEST-SUITE.md`: Detailed documentation of all test scenarios

### Main Test File (`chopstack-e2e.test.ts`)

- Tests the complete chopstack workflow from spec to generated plan
- Validates plan structure and DAG integrity
- Tests against real API calls (when API key is available)
- Includes error handling tests

## What Gets Tested

### Jest E2E Tests (Plan Generation)
1. **CLI Integration**: Actual chopstack CLI invocation with real arguments
2. **Agent Integration**: Real API calls to Claude (when API key available)
3. **Plan Generation**: Complete YAML plan output parsing and validation
4. **DAG Validation**: Circular dependency detection, task structure validation
5. **File Targeting**: Verification that generated tasks target appropriate files

### Chopstack Execution Tests
1. **All Execution Modes**: `plan`, `dry-run`, `execute`, `validate`
2. **Parallel Execution**: Git worktree creation and management
3. **Task Orchestration**: Layer-based execution with proper state transitions
4. **Error Handling**: Meaningful error messages and failure recovery
5. **Claude CLI Integration**: Proper argument building and process management
6. **Multi-layer Dependencies**: Complex DAG execution across multiple layers

## Test Behavior

- **With API Key**: Full integration testing with real Claude API calls
- **Without API Key**: Tests are skipped with warning messages
- **Missing Dependencies**: Clear error messages for setup issues
- **Timeout Handling**: 60-second timeout for Claude API calls

## Adding New Tests

1. Create new spec files in `specs/` directory
2. Add test cases in `chopstack-e2e.test.ts`
3. Follow the pattern of checking for API key availability
4. Use appropriate timeouts for external API calls
5. Validate both successful and error scenarios

## Troubleshooting

### Tests Skipped

If you see "Skipping E2E test - ANTHROPIC_API_KEY not found", set your API key:

```bash
export ANTHROPIC_API_KEY="your-key"
```

### Build Errors

Ensure chopstack is built:

```bash
pnpm run build
```

### Repository Not Found

Ensure the Next.js starter is cloned at the correct location:

```bash
ls -la ../typescript-nextjs-starter
```

### Timeout Issues

E2E tests have a 70-second timeout. If Claude API is slow:

- Check your internet connection
- Verify API key is valid
- Consider increasing timeout in test file if needed
