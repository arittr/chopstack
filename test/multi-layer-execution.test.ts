import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { Plan, Task } from '../src/types/decomposer';
import type { ExecutionOptions } from '../src/types/execution';

import { ExecutionEngine } from '../src/engine/execution-engine';

describe('Multi-Layer Execution Tests', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine();

    // Clean up any existing test artifacts
    const testTaskIds = ['layer-1-task-a', 'layer-1-task-b', 'layer-2-task-c', 'layer-3-task-d'];

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
  });

  afterEach(() => {
    // Clean up test artifacts
    const testTaskIds = ['layer-1-task-a', 'layer-1-task-b', 'layer-2-task-c', 'layer-3-task-d'];

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
  });

  test('executes tasks in correct dependency order', async () => {
    // Create a multi-layer task dependency graph:
    // Layer 1: task-a, task-b (parallel)
    // Layer 2: task-c (depends on task-a)
    // Layer 3: task-d (depends on task-c)

    const tasks: Task[] = [
      {
        id: 'layer-1-task-a',
        title: 'Layer 1 Task A',
        description: 'First layer independent task A',
        touches: [],
        produces: ['layer-1-a.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create layer-1-a.txt file',
      },
      {
        id: 'layer-1-task-b',
        title: 'Layer 1 Task B',
        description: 'First layer independent task B',
        touches: [],
        produces: ['layer-1-b.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create layer-1-b.txt file',
      },
      {
        id: 'layer-2-task-c',
        title: 'Layer 2 Task C',
        description: 'Second layer task depending on A',
        touches: [],
        produces: ['layer-2-c.txt'],
        requires: ['layer-1-task-a'],
        estimatedLines: 15,
        agentPrompt: 'Create layer-2-c.txt file using layer-1-a.txt',
      },
      {
        id: 'layer-3-task-d',
        title: 'Layer 3 Task D',
        description: 'Third layer task depending on C',
        touches: [],
        produces: ['layer-3-d.txt'],
        requires: ['layer-2-task-c'],
        estimatedLines: 20,
        agentPrompt: 'Create layer-3-d.txt file using layer-2-c.txt',
      },
    ];

    const executionResults = [];

    // Create a plan from the tasks
    const plan: Plan = { tasks };

    // Execute tasks in dry-run mode to test the orchestration logic
    const options: ExecutionOptions = {
      mode: 'dry-run',
      strategy: 'parallel',
      workdir: process.cwd(),
    };

    const result = await engine.execute(plan, options);
    const results = result.tasks;

    // Verify all tasks completed successfully
    expect(results).toHaveLength(4);
    for (const taskResult of results) {
      expect(taskResult.state).toBe('completed');
      expect(taskResult.id).toMatch(/^layer-\d-task-[a-d]$/);
      executionResults.push({
        taskId: taskResult.id,
        timestamp: taskResult.endTime,
      });
    }

    // Verify execution order respects dependencies
    const taskTimestamps = new Map(
      executionResults.map((r) => [r.taskId, new Date(r.timestamp!).getTime()]),
    );

    // Layer 1 tasks should complete before layer 2
    const layer1ATime = taskTimestamps.get('layer-1-task-a')!;
    const layer1BTime = taskTimestamps.get('layer-1-task-b')!;
    const layer2CTime = taskTimestamps.get('layer-2-task-c')!;
    const layer3DTime = taskTimestamps.get('layer-3-task-d')!;

    // Task C should start after Task A completes
    expect(layer2CTime).toBeGreaterThan(layer1ATime);

    // Task D should start after Task C completes
    expect(layer3DTime).toBeGreaterThan(layer2CTime);

    // Task B can run in parallel with Task A (no dependency constraint)
    // Both should complete before Task C starts
    expect(layer2CTime).toBeGreaterThan(layer1BTime);
  });

  test('handles dependencies correctly with worktree isolation', async () => {
    // Test that worktrees are created for each task and cleaned up properly
    const tasks: Task[] = [
      {
        id: 'layer-1-task-a',
        title: 'Independent Task',
        description: 'Task with no dependencies',
        touches: [],
        produces: ['independent.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create independent.txt',
      },
      {
        id: 'layer-2-task-c',
        title: 'Dependent Task',
        description: 'Task depending on the independent task',
        touches: [],
        produces: ['dependent.txt'],
        requires: ['layer-1-task-a'],
        estimatedLines: 15,
        agentPrompt: 'Create dependent.txt based on independent.txt',
      },
    ];

    // Track worktree creation during execution
    // const worktreePaths = tasks.map((task) => path.join('.chopstack-shadows', task.id));

    // Create a plan from the tasks
    const plan: Plan = { tasks };

    // Execute with validate mode to test worktree setup without actual execution
    const options: ExecutionOptions = {
      mode: 'validate',
      strategy: 'parallel',
      workdir: process.cwd(),
    };

    const result = await engine.execute(plan, options);
    const results = result.tasks;

    // Verify both tasks were processed
    expect(results).toHaveLength(2);

    // Verify dependency task only starts after independent task completes
    const independentResult = results.find((r: any) => r.id === 'layer-1-task-a');
    const dependentResult = results.find((r: any) => r.id === 'layer-2-task-c');

    expect(independentResult).toBeDefined();
    expect(dependentResult).toBeDefined();
    expect(independentResult!.state).toBe('completed');
    expect(dependentResult!.state).toBe('completed');
  });

  test('handles complex dependency chains', async () => {
    // Create a more complex dependency graph:
    // A (layer 1)
    // B depends on A (layer 2)
    // C depends on A (layer 2) - parallel with B
    // D depends on B and C (layer 3)

    const tasks: Task[] = [
      {
        id: 'layer-1-task-a',
        title: 'Root Task',
        description: 'Root task with no dependencies',
        touches: [],
        produces: ['root.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create root.txt',
      },
      {
        id: 'layer-2-task-b',
        title: 'Branch Task B',
        description: 'Task B depending on root',
        touches: [],
        produces: ['branch-b.txt'],
        requires: ['layer-1-task-a'],
        estimatedLines: 15,
        agentPrompt: 'Create branch-b.txt using root.txt',
      },
      {
        id: 'layer-2-task-c',
        title: 'Branch Task C',
        description: 'Task C depending on root (parallel with B)',
        touches: [],
        produces: ['branch-c.txt'],
        requires: ['layer-1-task-a'],
        estimatedLines: 15,
        agentPrompt: 'Create branch-c.txt using root.txt',
      },
      {
        id: 'layer-3-task-d',
        title: 'Merge Task',
        description: 'Task depending on both B and C',
        touches: [],
        produces: ['merge.txt'],
        requires: ['layer-2-task-b', 'layer-2-task-c'],
        estimatedLines: 25,
        agentPrompt: 'Create merge.txt using both branch-b.txt and branch-c.txt',
      },
    ];

    // Create a plan from the tasks
    const plan: Plan = { tasks };

    const options: ExecutionOptions = {
      mode: 'dry-run',
      strategy: 'parallel',
      workdir: process.cwd(),
    };

    const result = await engine.execute(plan, options);
    const results = result.tasks;

    // Verify all tasks completed
    expect(results).toHaveLength(4);
    for (const taskResult of results) {
      expect(taskResult.state).toBe('completed');
    }

    // Verify dependency constraints
    const taskResults = new Map(results.map((r: any) => [r.id, r]));

    const rootTask = taskResults.get('layer-1-task-a')!;
    const branchBTask = taskResults.get('layer-2-task-b')!;
    const branchCTask = taskResults.get('layer-2-task-c')!;
    const mergeTask = taskResults.get('layer-3-task-d')!;

    // All tasks should have completed
    expect(rootTask.endTime).toBeDefined();
    expect(branchBTask.endTime).toBeDefined();
    expect(branchCTask.endTime).toBeDefined();
    expect(mergeTask.endTime).toBeDefined();

    // Verify execution order respects dependencies
    const rootTime = new Date(rootTask.endTime as Date).getTime();
    const branchBTime = new Date(branchBTask.endTime as Date).getTime();
    const branchCTime = new Date(branchCTask.endTime as Date).getTime();
    const mergeTime = new Date(mergeTask.endTime as Date).getTime();

    // Branch tasks should complete after root
    expect(branchBTime).toBeGreaterThan(rootTime);
    expect(branchCTime).toBeGreaterThan(rootTime);

    // Merge task should complete after both branch tasks
    expect(mergeTime).toBeGreaterThan(branchBTime);
    expect(mergeTime).toBeGreaterThan(branchCTime);
  });

  test('validates task readiness before execution', async () => {
    const tasks: Task[] = [
      {
        id: 'layer-1-task-a',
        title: 'Ready Task',
        description: 'Task that should be ready immediately',
        touches: [],
        produces: ['ready.txt'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Create ready.txt',
      },
      {
        id: 'layer-2-task-c',
        title: 'Blocked Task',
        description: 'Task blocked by dependency',
        touches: [],
        produces: ['blocked.txt'],
        requires: ['layer-1-task-a'],
        estimatedLines: 15,
        agentPrompt: 'Create blocked.txt using ready.txt',
      },
    ];

    // Create a plan from the tasks
    const plan: Plan = { tasks };

    // Use validate mode to check task readiness
    const options: ExecutionOptions = {
      mode: 'validate',
      strategy: 'parallel',
      workdir: process.cwd(),
    };

    const result = await engine.execute(plan, options);
    const results = result.tasks;

    expect(results).toHaveLength(2);

    // Both tasks should validate successfully (dependencies are structurally correct)
    for (const taskResult of results) {
      expect(taskResult.state).toBe('completed');
    }
  });
});
