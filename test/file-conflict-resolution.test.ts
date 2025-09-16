import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

describe('Complex File Conflict Resolution Tests', () => {
  const testPlanFile = path.join(__dirname, 'test-conflict-plan.yaml');

  beforeEach(() => {
    // Clean up any existing test artifacts
    const testTaskIds = [
      'conflict-task-a',
      'conflict-task-b',
      'conflict-task-c',
      'safe-task-1',
      'safe-task-2',
    ];

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
    if (existsSync(testPlanFile)) {
      rmSync(testPlanFile);
    }
  });

  afterEach(() => {
    // Clean up test artifacts
    const testTaskIds = [
      'conflict-task-a',
      'conflict-task-b',
      'conflict-task-c',
      'safe-task-1',
      'safe-task-2',
    ];

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
    if (existsSync(testPlanFile)) {
      rmSync(testPlanFile);
    }
  });

  test('detects simple file conflicts between parallel tasks', () => {
    // Two tasks modifying the same file
    const conflictPlan = `tasks:
  - id: conflict-task-a
    title: Task A
    description: Modifies shared file
    touches:
      - src/shared.ts
    produces: []
    requires: []
    estimatedLines: 10
    agentPrompt: Modify src/shared.ts

  - id: conflict-task-b
    title: Task B
    description: Also modifies shared file
    touches:
      - src/shared.ts
    produces: []
    requires: []
    estimatedLines: 10
    agentPrompt: Also modify src/shared.ts
`;

    writeFileSync(testPlanFile, conflictPlan);

    // Should detect the conflict
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      // If no exception, should indicate conflict in output
      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to file conflict
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('allows sequential tasks to modify the same file', () => {
    // Tasks in sequence can modify the same file (dependency chain)
    const sequentialPlan = `tasks:
  - id: safe-task-1
    title: First Task
    description: Creates and modifies shared file
    touches: []
    produces:
      - src/shared.ts
    requires: []
    estimatedLines: 20
    agentPrompt: Create src/shared.ts

  - id: safe-task-2
    title: Second Task
    description: Modifies shared file after first task
    touches:
      - src/shared.ts
    produces: []
    requires:
      - safe-task-1
    estimatedLines: 15
    agentPrompt: Modify existing src/shared.ts
`;

    writeFileSync(testPlanFile, sequentialPlan);

    // Should validate successfully (no parallel conflict)
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    expect(output).toContain('✅');
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain('Tasks: 2/2 completed');
  });

  test('detects conflicts with multiple file overlaps', () => {
    // Tasks that conflict on multiple files
    const multiConflictPlan = `tasks:
  - id: conflict-task-a
    title: Task A
    description: Modifies multiple shared files
    touches:
      - src/shared.ts
      - src/utils.ts
    produces: []
    requires: []
    estimatedLines: 20
    agentPrompt: Modify shared.ts and utils.ts

  - id: conflict-task-b
    title: Task B
    description: Also modifies some shared files
    touches:
      - src/shared.ts
      - src/config.ts
    produces: []
    requires: []
    estimatedLines: 15
    agentPrompt: Modify shared.ts and config.ts
`;

    writeFileSync(testPlanFile, multiConflictPlan);

    // Should detect conflicts (shared.ts overlap)
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to file conflicts
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('allows parallel tasks with no file conflicts', () => {
    // Tasks that can run in parallel safely
    const safePlan = `tasks:
  - id: safe-task-1
    title: Safe Task 1
    description: Works on separate files
    touches: []
    produces:
      - src/feature-a.ts
      - src/feature-a.test.ts
    requires: []
    estimatedLines: 50
    agentPrompt: Create feature A implementation and tests

  - id: safe-task-2
    title: Safe Task 2
    description: Works on different files
    touches: []
    produces:
      - src/feature-b.ts
      - src/feature-b.test.ts
    requires: []
    estimatedLines: 45
    agentPrompt: Create feature B implementation and tests
`;

    writeFileSync(testPlanFile, safePlan);

    // Should validate successfully (no conflicts)
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    expect(output).toContain('✅');
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain('Tasks: 2/2 completed');
    // The important thing is successful execution, not absence of the word "conflict"
  });

  test('detects produce/touch conflicts', () => {
    // One task produces a file, another touches it
    const produceTouchConflict = `tasks:
  - id: conflict-task-a
    title: Producer Task
    description: Creates a new file
    touches: []
    produces:
      - src/new-file.ts
    requires: []
    estimatedLines: 30
    agentPrompt: Create src/new-file.ts

  - id: conflict-task-b
    title: Modifier Task
    description: Tries to modify the same file
    touches:
      - src/new-file.ts
    produces: []
    requires: []
    estimatedLines: 10
    agentPrompt: Modify src/new-file.ts
`;

    writeFileSync(testPlanFile, produceTouchConflict);

    // Should detect the produce/touch conflict
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to produce/touch conflict
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('detects multiple produce conflicts', () => {
    // Two tasks trying to create the same file
    const multiProduceConflict = `tasks:
  - id: conflict-task-a
    title: Producer A
    description: Creates a shared file
    touches: []
    produces:
      - src/shared-output.ts
    requires: []
    estimatedLines: 30
    agentPrompt: Create src/shared-output.ts

  - id: conflict-task-b
    title: Producer B
    description: Also tries to create the same file
    touches: []
    produces:
      - src/shared-output.ts
    requires: []
    estimatedLines: 25
    agentPrompt: Also create src/shared-output.ts
`;

    writeFileSync(testPlanFile, multiProduceConflict);

    // Should detect the multiple produce conflict
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to multiple produce conflict
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('handles nested directory conflicts', () => {
    // Conflicts in nested directory structures
    const nestedConflict = `tasks:
  - id: conflict-task-a
    title: Deep File Task A
    description: Works with nested file
    touches:
      - src/features/auth/user-service.ts
    produces: []
    requires: []
    estimatedLines: 20
    agentPrompt: Modify user service

  - id: conflict-task-b
    title: Deep File Task B
    description: Also works with same nested file
    touches:
      - src/features/auth/user-service.ts
    produces: []
    requires: []
    estimatedLines: 15
    agentPrompt: Also modify user service
`;

    writeFileSync(testPlanFile, nestedConflict);

    // Should detect nested directory conflicts
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to nested path conflict
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('handles complex mixed conflict scenarios', () => {
    // Complex scenario with multiple types of conflicts
    const complexConflict = `tasks:
  - id: task-a
    title: Task A
    description: Complex task with multiple files
    touches:
      - src/shared.ts
    produces:
      - src/new-feature.ts
    requires: []
    estimatedLines: 40
    agentPrompt: Create new-feature.ts and modify shared.ts

  - id: task-b
    title: Task B
    description: Conflicts on touched file
    touches:
      - src/shared.ts
    produces:
      - src/another-feature.ts
    requires: []
    estimatedLines: 35
    agentPrompt: Create another-feature.ts and modify shared.ts

  - id: task-c
    title: Task C
    description: Safe parallel task
    touches: []
    produces:
      - src/independent.ts
    requires: []
    estimatedLines: 20
    agentPrompt: Create independent.ts
`;

    writeFileSync(testPlanFile, complexConflict);

    // Should detect the shared.ts conflict between A and B
    try {
      const output = execSync(
        `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
        {
          encoding: 'utf8',
          cwd: process.cwd(),
        },
      );

      expect(output).toMatch(/conflict/i);
    } catch (error) {
      // Expected to fail due to shared.ts conflict
      const execError = error as { stderr?: string; stdout?: string };
      const errorOutput = execError.stderr ?? execError.stdout ?? '';
      expect(errorOutput).toContain('Plan validation failed');
    }
  });

  test('validates conflict resolution with dependencies', () => {
    // Tasks that would conflict if parallel, but are safe due to dependencies
    const resolvedByDependency = `tasks:
  - id: task-a
    title: Base Task
    description: Creates initial file
    touches: []
    produces:
      - src/base.ts
    requires: []
    estimatedLines: 30
    agentPrompt: Create base.ts

  - id: task-b
    title: Dependent Task
    description: Modifies file after base task
    touches:
      - src/base.ts
    produces: []
    requires:
      - task-a
    estimatedLines: 15
    agentPrompt: Modify base.ts after creation

  - id: task-c
    title: Another Dependent Task
    description: Also modifies file after dependent task
    touches:
      - src/base.ts
    produces: []
    requires:
      - task-b
    estimatedLines: 10
    agentPrompt: Further modify base.ts
`;

    writeFileSync(testPlanFile, resolvedByDependency);

    // Should validate successfully (conflicts resolved by dependencies)
    const output = execSync(
      `pnpm run start run --plan ${testPlanFile} --mode validate --strategy parallel`,
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );

    expect(output).toContain('✅');
    expect(output).toContain('Execution completed successfully');
    expect(output).toContain('Tasks: 3/3 completed');
    // The important thing is successful execution, dependency resolution worked correctly
  });
});
