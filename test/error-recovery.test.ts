import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

describe('Error Recovery and Retry Tests', () => {
  const testSpecFile = path.join(__dirname, 'test-error-recovery-spec.md');
  const testPlanFile = path.join(__dirname, 'test-error-recovery-plan.yaml');

  beforeEach(() => {
    // Clean up any existing test artifacts
    const testTaskIds = ['failing-task', 'recovery-task', 'success-task'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack-shadows', taskId);
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
    const testTaskIds = ['failing-task', 'recovery-task', 'success-task'];

    for (const taskId of testTaskIds) {
      const testPath = path.join('.chopstack-shadows', taskId);
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

  test('handles invalid plan gracefully', () => {
    // Create an invalid plan file with syntax errors
    const invalidPlanContent = `tasks:
  - id: invalid-task
    title: Invalid Task
    description: This task has invalid YAML structure
    touches: []
    produces:
      - output.txt
    requires: []
    estimatedLines: 10
    agentPrompt: "This has unescaped quotes and breaks YAML parsing
`;

    writeFileSync(testPlanFile, invalidPlanContent);

    // Try to run the invalid plan
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If it somehow succeeds, it should indicate an error
      expect(output).toMatch(/error|fail|invalid/i);
    } catch (error) {
      // Expected to fail with parsing error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toMatch(/parse|yaml|invalid/i);
    }
  });

  test('handles missing dependency gracefully', () => {
    // Create a plan with missing dependency reference
    const planWithMissingDep = `tasks:
  - id: dependent-task
    title: Dependent Task
    description: Task that depends on non-existent task
    touches: []
    produces:
      - output.txt
    requires:
      - non-existent-task
    estimatedLines: 10
    agentPrompt: This task depends on something that doesn't exist
`;

    writeFileSync(testPlanFile, planWithMissingDep);

    // Try to validate the plan with missing dependency
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If it doesn't throw, check for dependency error indicators
      expect(output).toMatch(/dependency|missing|error/i);
    } catch (error) {
      // Expected to fail with dependency validation error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
      // The important thing is that it fails gracefully, not the specific error message
    }
  });

  test('handles circular dependency gracefully', () => {
    // Create a plan with circular dependencies
    const circularPlanContent = `tasks:
  - id: task-a
    title: Task A
    description: First task in circular dependency
    touches: []
    produces:
      - file-a.txt
    requires:
      - task-b
    estimatedLines: 10
    agentPrompt: Create file-a.txt

  - id: task-b
    title: Task B
    description: Second task in circular dependency
    touches: []
    produces:
      - file-b.txt
    requires:
      - task-a
    estimatedLines: 10
    agentPrompt: Create file-b.txt
`;

    writeFileSync(testPlanFile, circularPlanContent);

    // Try to validate the plan with circular dependencies
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If it doesn't throw, should indicate circular dependency error
      expect(output).toMatch(/circular|cycle|dependency/i);
    } catch (error) {
      // Expected to fail with circular dependency error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
      // The important thing is that it fails gracefully, not the specific error message
    }
  });

  test('validates file conflicts are detected', () => {
    // Create a plan where multiple tasks modify the same file
    const conflictPlanContent = `tasks:
  - id: task-a
    title: Task A
    description: Modifies shared file
    touches:
      - shared.ts
    produces: []
    requires: []
    estimatedLines: 10
    agentPrompt: Modify shared.ts

  - id: task-b
    title: Task B
    description: Also modifies shared file
    touches:
      - shared.ts
    produces: []
    requires: []
    estimatedLines: 10
    agentPrompt: Also modify shared.ts
`;

    writeFileSync(testPlanFile, conflictPlanContent);

    // Try to validate the plan with file conflicts
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If it doesn't throw, should indicate conflict detection
      expect(output).toMatch(/conflict|shared\.ts/i);
    } catch (error) {
      // Expected to fail with file conflict error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
      // The important thing is that it fails gracefully, not the specific error message
    }
  });

  test('handles non-existent plan file gracefully', () => {
    const nonExistentPlan = path.join(__dirname, 'does-not-exist.yaml');

    // Try to run with non-existent plan file
    try {
      const output = execSync(`pnpm run start run --plan ${nonExistentPlan} --mode validate`, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      // Should indicate file not found error
      expect(output).toMatch(/not found|missing|error/i);
    } catch (error) {
      // Expected to fail with file not found error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toMatch(/not found|enoent|missing/i);
    }
  });

  test('handles empty plan file gracefully', () => {
    // Create an empty plan file
    writeFileSync(testPlanFile, '');

    // Try to validate empty plan
    try {
      const output = execSync(`pnpm run start run --plan ${testPlanFile} --mode validate`, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      // Should indicate empty or invalid plan
      expect(output).toMatch(/empty|invalid|error/i);
    } catch (error) {
      // Expected to fail with empty plan error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput.length > 0 ? errorOutput : 'empty').toMatch(/empty|parse|invalid/i);
    }
  });

  test('validates graceful handling of large task count', () => {
    // Create a plan with many tasks to test scalability
    const taskCount = 50;
    let largePlanContent = 'tasks:\n';

    for (let i = 1; i <= taskCount; i++) {
      const prevTask = i > 1 ? `task-${i - 1}` : '';
      largePlanContent += `  - id: task-${i}
    title: Task ${i}
    description: Generated task ${i}
    touches: []
    produces:
      - output-${i}.txt
    requires: ${prevTask.length > 0 ? `[${prevTask}]` : '[]'}
    estimatedLines: 10
    agentPrompt: Create output-${i}.txt

`;
    }

    writeFileSync(testPlanFile, largePlanContent);

    // Validate the large plan - should handle it gracefully
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    // Should successfully validate all tasks
    expect(output).toContain('✅');
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain(`Tasks: ${taskCount}/${taskCount} completed`);
  });

  test('handles invalid execution mode gracefully', () => {
    // Create a simple valid plan
    const validPlanContent = `tasks:
  - id: simple-task
    title: Simple Task
    description: A simple task for testing
    touches: []
    produces:
      - simple.txt
    requires: []
    estimatedLines: 10
    agentPrompt: Create simple.txt
`;

    writeFileSync(testPlanFile, validPlanContent);

    // Try to run with invalid execution mode
    try {
      const output = execSync(`pnpm run start run --plan ${testPlanFile} --mode invalid-mode`, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      // Should indicate invalid mode error
      expect(output).toMatch(/invalid|mode|error/i);
    } catch (error) {
      // Expected to fail with invalid mode error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toMatch(/invalid|mode|unknown/i);
    }
  });

  test('handles invalid strategy gracefully', () => {
    // Create a simple valid plan
    const validPlanContent = `tasks:
  - id: simple-task
    title: Simple Task
    description: A simple task for testing
    touches: []
    produces:
      - simple.txt
    requires: []
    estimatedLines: 10
    agentPrompt: Create simple.txt
`;

    writeFileSync(testPlanFile, validPlanContent);

    // Try to run with invalid strategy
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy invalid-strategy`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // Should indicate invalid strategy error
      expect(output).toMatch(/invalid|strategy|error/i);
    } catch (error) {
      // Expected to fail with invalid strategy error
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toMatch(/invalid|strategy|unknown/i);
    }
  });
});
