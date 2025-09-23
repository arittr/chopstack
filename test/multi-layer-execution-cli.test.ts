import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

describe('Multi-Layer Execution CLI Tests', () => {
  const testSpecFile = path.join(__dirname, 'test-multi-layer-spec.md');
  const testPlanFile = path.join(__dirname, 'test-multi-layer-plan.yaml');

  beforeEach(() => {
    // Clean up any existing test artifacts
    const testTaskIds = ['setup-types', 'impl-api', 'impl-ui', 'write-tests'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack/shadows', taskId);
      const branchName = `chopstack/${taskId}`;

      try {
        if (existsSync(testPath)) {
          execSync(`git worktree remove ${testPath} --force`, { stdio: 'ignore' });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        execSync(`git branch -D ${branchName}`, { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors if branch doesn't exist
      }
    }

    // Clean up test files
    if (existsSync(testSpecFile)) {
      rmSync(testSpecFile);
    }
    if (existsSync(testPlanFile)) {
      rmSync(testPlanFile);
    }
  });

  afterEach(() => {
    // Clean up test artifacts
    const testTaskIds = ['setup-types', 'impl-api', 'impl-ui', 'write-tests'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack/shadows', taskId);
      const branchName = `chopstack/${taskId}`;

      try {
        if (existsSync(testPath)) {
          execSync(`git worktree remove ${testPath} --force`, { stdio: 'ignore' });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        execSync(`git branch -D ${branchName}`, { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors if branch doesn't exist
      }
    }

    // Clean up test files
    if (existsSync(testSpecFile)) {
      rmSync(testSpecFile);
    }
    if (existsSync(testPlanFile)) {
      rmSync(testPlanFile);
    }
  });

  test('generates execution plan with proper layer dependencies', () => {
    // Create a multi-layer specification
    const specContent = `# Multi-Layer Feature Implementation

Implement a simple user management system with the following components:

## Requirements
- User type definitions and interfaces
- API layer with CRUD operations
- UI components for user management
- Comprehensive test coverage

## Dependencies
- API implementation depends on type definitions
- UI components depend on API implementation
- Tests should cover all layers
`;

    writeFileSync(testSpecFile, specContent);

    // Generate plan using mock agent to avoid external dependencies
    execSync(
      `pnpm run start decompose --spec ${testSpecFile} --agent mock --output ${testPlanFile}`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    // Verify plan was generated
    expect(existsSync(testPlanFile)).toBe(true);

    // Read and verify the generated plan
    const planContent = execSync(`cat ${testPlanFile}`, { encoding: 'utf8' });
    expect(planContent).toContain('tasks:');
    expect(planContent).toContain('id: create-user-types');
    expect(planContent).toContain('id: create-user-crud');
    expect(planContent).toContain('id: add-validation');
    expect(planContent).toContain('id: write-tests');

    // Verify dependency structure in the YAML
    expect(planContent).toContain('requires: []'); // first task has no dependencies
    expect(planContent).toContain('requires:\n      - create-user-types'); // second task depends on first
    expect(planContent).toContain('requires:\n      - create-user-crud'); // third task depends on second
    expect(planContent).toContain('requires:\n      - add-validation'); // tests depend on validation
  });

  test('validates execution plan correctly', () => {
    // Create the plan file first
    const planContent = `tasks:
  - id: setup-types
    title: Setup Type Definitions
    description: Create user type definitions
    touches: []
    produces:
      - src/types/user.ts
    requires: []
    estimatedLines: 20
    agentPrompt: Create basic user types

  - id: impl-api
    title: Implement API Layer
    description: Create user API endpoints
    touches: []
    produces:
      - src/api/user-api.ts
    requires:
      - setup-types
    estimatedLines: 80
    agentPrompt: Implement user CRUD API using types

  - id: impl-ui
    title: Implement UI Components
    description: Create user management UI
    touches: []
    produces:
      - src/components/user-list.tsx
      - src/components/user-form.tsx
    requires:
      - impl-api
    estimatedLines: 120
    agentPrompt: Create UI components using API

  - id: write-tests
    title: Write Tests
    description: Add comprehensive test coverage
    touches: []
    produces:
      - src/api/user-api.test.ts
      - src/components/user-list.test.tsx
    requires:
      - impl-ui
    estimatedLines: 100
    agentPrompt: Write tests for all components
`;

    writeFileSync(testPlanFile, planContent);

    // Validate the plan using chopstack CLI
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    // Verify validation output indicates success
    expect(output).toContain('✅'); // Should contain success indicators
    expect(output).toContain('Execution completed successfully');
    expect(output).not.toContain('❌'); // Should not contain error indicators
    expect(output).not.toContain('FAILED'); // Should not contain failure messages

    // Verify all tasks were validated (4 tasks total)
    expect(output).toContain('Tasks: 4/4 completed');
    expect(output).toContain('Validation: PASSED');
  });

  test('executes dry-run with dependency order', () => {
    // Create the plan file first
    const planContent = `tasks:
  - id: setup-types
    title: Setup Type Definitions
    description: Create user type definitions
    touches: []
    produces:
      - src/types/user.ts
    requires: []
    estimatedLines: 20
    agentPrompt: Create basic user types

  - id: impl-api
    title: Implement API Layer
    description: Create user API endpoints
    touches: []
    produces:
      - src/api/user-api.ts
    requires:
      - setup-types
    estimatedLines: 80
    agentPrompt: Implement user CRUD API using types
`;

    writeFileSync(testPlanFile, planContent);

    // Run dry-run execution
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode dry-run --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    // Verify execution output shows completion
    expect(output).toContain('✅'); // Should contain completion indicators
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain('Tasks: 2/2 completed'); // Both tasks completed

    // Look for dry-run execution indicators
    expect(output).toContain('dry-run mode'); // Should mention dry-run mode
  });

  test('handles execution plan with parallel tasks', () => {
    // Create a plan with parallel opportunities
    const planContent = `tasks:
  - id: setup-types
    title: Setup Type Definitions
    description: Create user type definitions
    touches: []
    produces:
      - src/types/user.ts
    requires: []
    estimatedLines: 20
    agentPrompt: Create basic user types

  - id: setup-utils
    title: Setup Utilities
    description: Create utility functions
    touches: []
    produces:
      - src/utils/validation.ts
    requires: []
    estimatedLines: 30
    agentPrompt: Create validation utilities

  - id: impl-api
    title: Implement API Layer
    description: Create user API endpoints
    touches: []
    produces:
      - src/api/user-api.ts
    requires:
      - setup-types
      - setup-utils
    estimatedLines: 80
    agentPrompt: Implement user CRUD API using types and utils
`;

    writeFileSync(testPlanFile, planContent);

    // Run validation to check parallel task handling
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    // Verify output indicates successful parallel validation
    expect(output).toContain('✅');
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain('Tasks: 3/3 completed'); // All 3 tasks completed

    // Should not have any errors about conflicting parallel tasks
    expect(output).not.toContain('conflict');
    expect(output).not.toContain('❌');
  });

  test('detects file conflicts in parallel tasks', () => {
    // Create a plan with conflicting file modifications
    const planContent = `tasks:
  - id: task-a
    title: Task A
    description: Modify shared file
    touches:
      - src/shared.ts
    produces: []
    requires: []
    estimatedLines: 20
    agentPrompt: Modify shared.ts file

  - id: task-b
    title: Task B
    description: Also modify shared file
    touches:
      - src/shared.ts
    produces: []
    requires: []
    estimatedLines: 25
    agentPrompt: Also modify shared.ts file
`;

    writeFileSync(testPlanFile, planContent);

    // Run validation - should detect the conflict
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If it doesn't throw, check for conflict indicators in output
      expect(output).toMatch(/conflict|error|fail/i);
    } catch (error) {
      // Validation should fail due to file conflicts
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';

      // The validation should fail - this is expected behavior
      expect(errorOutput).toContain('Plan validation failed');
      // For now, just verify it failed as expected
    }
  });
});
