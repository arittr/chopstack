# E2E Integration Tests

This directory contains end-to-end integration tests for chopstack that test the complete workflow against real codebases.

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

### Run E2E Tests Only

```bash
pnpm run test:e2e
```

### Run All Tests (Unit + E2E)

```bash
pnpm run test
```

### Run Unit Tests Only

```bash
pnpm run test:unit
```

## Test Structure

### Test Specs (`specs/`)

- Contains markdown specifications that serve as input to chopstack
- `add-dark-mode.md`: A realistic dark mode implementation spec for testing

### Main Test File (`chopstack-e2e.test.ts`)

- Tests the complete chopstack workflow from spec to generated plan
- Validates plan structure and DAG integrity
- Tests against real API calls (when API key is available)
- Includes error handling tests

## What Gets Tested

1. **CLI Integration**: Actual chopstack CLI invocation with real arguments
2. **Agent Integration**: Real API calls to Claude (when API key available)
3. **Plan Generation**: Complete YAML plan output parsing and validation
4. **DAG Validation**: Circular dependency detection, task structure validation
5. **File Targeting**: Verification that generated tasks target appropriate files
6. **Execution Planning**: Topological sorting and parallel execution planning
7. **Error Handling**: Graceful handling of invalid inputs and missing resources

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
