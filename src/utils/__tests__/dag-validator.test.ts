import type { PlanV2, TaskV2 } from '@/types/schemas-v2';

import { DagValidator } from '@/validation/dag-validator';

describe('DagValidator', () => {
  const createTask = (overrides: Partial<TaskV2> = {}): TaskV2 => ({
    id: 'test-task',
    name: 'Test Task',
    complexity: 'S',
    description: 'A test task with sufficient detail for validation requirements',
    files: [],
    acceptanceCriteria: [],
    dependencies: [],
    ...overrides,
  });

  const createPlan = (tasks: TaskV2[]): PlanV2 => ({
    name: 'Test Plan',
    strategy: 'parallel',
    tasks,
  });

  describe('validatePlan', () => {
    it('validates a simple valid plan', () => {
      const tasks = [
        createTask({ id: 'task1', dependencies: [] }),
        createTask({ id: 'task2', dependencies: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects circular dependencies', () => {
      const tasks = [
        createTask({ id: 'task1', dependencies: ['task2'] }),
        createTask({ id: 'task2', dependencies: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies!.length).toBeGreaterThan(0);
    });

    it('detects file conflicts', () => {
      const tasks = [
        createTask({ id: 'task1', files: ['file.ts'] }),
        createTask({ id: 'task2', files: ['file.ts'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts![0]).toContain('file.ts');
    });

    it('detects missing dependencies', () => {
      const tasks = [createTask({ id: 'task1', dependencies: ['missing-task'] })];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.missingDependencies).toBeDefined();
      expect(result.missingDependencies![0]).toContain('missing-task');
    });

    it('detects orphaned tasks', () => {
      const tasks = [
        createTask({ id: 'task1', dependencies: [] }),
        createTask({ id: 'task2', dependencies: [] }), // Orphaned
        createTask({ id: 'task3', dependencies: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.orphanedTasks).toBeDefined();
      expect(result.orphanedTasks).toContain('task2');
    });

    it('validates task structure', () => {
      const tasks = [
        createTask({ id: '', name: 'Bad Task' }), // Missing ID
        createTask({ id: 'task2', name: '', description: 'Good description with sufficient detail for validation' }), // Missing name
        createTask({ id: 'task3', complexity: 'INVALID' as any }), // Invalid complexity
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((error) => error.includes('missing ID'))).toBe(true);
      expect(result.errors.some((error) => error.includes('missing name') || error.includes('missing title'))).toBe(true);
      expect(result.errors.some((error) => error.includes('invalid complexity') || error.includes('invalid estimated lines'))).toBe(true);
    });
  });

  describe('calculateMetrics', () => {
    it('calculates metrics for a linear plan', () => {
      const tasks = [
        createTask({ id: 'task1', complexity: 'S' }),
        createTask({ id: 'task2', dependencies: ['task1'], complexity: 'M' }),
        createTask({ id: 'task3', dependencies: ['task2'], complexity: 'S' }),
      ];
      const plan = createPlan(tasks);

      const metrics = DagValidator.calculateMetrics(plan);

      expect(metrics.taskCount).toBe(3);
      expect(metrics.maxParallelization).toBe(1); // Linear execution
      expect(metrics.executionLayers).toBe(3);
      // Note: metrics may calculate differently for complexity vs estimatedLines
      expect(metrics.totalEstimatedLines).toBeGreaterThan(0);
    });

    it('calculates metrics for a parallel plan', () => {
      const tasks = [
        createTask({ id: 'task1', complexity: 'S' }),
        createTask({ id: 'task2', dependencies: ['task1'], complexity: 'M' }),
        createTask({ id: 'task3', dependencies: ['task1'], complexity: 'S' }),
        createTask({ id: 'task4', dependencies: ['task2', 'task3'], complexity: 'S' }),
      ];
      const plan = createPlan(tasks);

      const metrics = DagValidator.calculateMetrics(plan);

      expect(metrics.taskCount).toBe(4);
      expect(metrics.maxParallelization).toBe(2); // task2 and task3 can run in parallel
      expect(metrics.executionLayers).toBe(3);
      expect(metrics.totalEstimatedLines).toBeGreaterThan(0);
    });
  });

  describe('getExecutionOrder', () => {
    it('returns tasks in topological order', () => {
      const tasks = [
        createTask({ id: 'task3', dependencies: ['task1', 'task2'] }),
        createTask({ id: 'task1', dependencies: [] }),
        createTask({ id: 'task2', dependencies: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const ordered = DagValidator.getExecutionOrder(plan);

      expect(ordered).toHaveLength(3);
      expect(ordered[0]!.id).toBe('task1');
      expect(ordered[1]!.id).toBe('task2');
      expect(ordered[2]!.id).toBe('task3');
    });
  });

  describe('getExecutionLayers', () => {
    it('groups tasks by execution layers', () => {
      const tasks = [
        createTask({ id: 'task1', dependencies: [] }),
        createTask({ id: 'task2', dependencies: [] }),
        createTask({ id: 'task3', dependencies: ['task1'] }),
        createTask({ id: 'task4', dependencies: ['task2'] }),
        createTask({ id: 'task5', dependencies: ['task3', 'task4'] }),
      ];
      const plan = createPlan(tasks);

      const layers = DagValidator.getExecutionLayers(plan);

      expect(layers).toHaveLength(3);
      expect(layers[0]).toHaveLength(2); // task1, task2
      expect(layers[1]).toHaveLength(2); // task3, task4
      expect(layers[2]).toHaveLength(1); // task5

      // Check that dependencies are respected
      expect(layers[0]!.map((t) => t.id).sort()).toEqual(['task1', 'task2']);
      expect(layers[1]!.map((t) => t.id).sort()).toEqual(['task3', 'task4']);
      expect(layers[2]!.map((t) => t.id)).toEqual(['task5']);
    });
  });

  describe('file conflict detection', () => {
    it('does not report conflicts for sequential tasks touching the same file', () => {
      const tasks = [
        createTask({
          id: 'task-a',
          name: 'Task A',
          files: ['file.txt'],
          dependencies: [],
        }),
        createTask({
          id: 'task-b',
          name: 'Task B',
          files: ['file.txt'],
          dependencies: ['task-a'],
        }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.conflicts).toBeUndefined();
    });

    it('reports conflicts for parallel tasks touching the same file', () => {
      const tasks = [
        createTask({
          id: 'task-a',
          name: 'Task A',
          files: ['file.txt'],
          dependencies: [],
        }),
        createTask({
          id: 'task-b',
          name: 'Task B',
          files: ['file.txt'],
          dependencies: [],
        }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts?.[0]).toContain('file.txt');
      expect(result.conflicts?.[0]).toContain('task-a, task-b');
    });

    it('handles complex dependency chains with file conflicts', () => {
      const tasks = [
        createTask({
          id: 'task-a',
          name: 'Task A',
          files: ['shared.txt'],
          dependencies: [],
        }),
        createTask({
          id: 'task-b',
          name: 'Task B',
          files: ['shared.txt'],
          dependencies: ['task-a'],
        }),
        createTask({
          id: 'task-c',
          name: 'Task C',
          files: ['shared.txt'],
          dependencies: [],
        }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts).toHaveLength(1);
      // Should detect conflicts between task-a & task-c, and task-b & task-c
      expect(result.conflicts?.[0]).toContain('shared.txt');
      expect(result.conflicts?.[0]).toMatch(/task-[ac], task-[ac]/);
    });
  });

  describe('complex scenarios', () => {
    it('handles diamond dependency pattern', () => {
      const tasks = [
        createTask({ id: 'root', dependencies: [] }),
        createTask({ id: 'left', dependencies: ['root'] }),
        createTask({ id: 'right', dependencies: ['root'] }),
        createTask({ id: 'merge', dependencies: ['left', 'right'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);
      const metrics = DagValidator.calculateMetrics(plan);
      const layers = DagValidator.getExecutionLayers(plan);

      expect(result.valid).toBe(true);
      expect(metrics.maxParallelization).toBe(2); // left and right in parallel
      expect(layers).toHaveLength(3);
    });

    it('handles multiple independent chains', () => {
      const tasks = [
        createTask({ id: 'chain1-1', dependencies: [] }),
        createTask({ id: 'chain1-2', dependencies: ['chain1-1'] }),
        createTask({ id: 'chain2-1', dependencies: [] }),
        createTask({ id: 'chain2-2', dependencies: ['chain2-1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);
      const metrics = DagValidator.calculateMetrics(plan);

      expect(result.valid).toBe(true);
      expect(metrics.maxParallelization).toBe(2); // Both chains can run in parallel
      expect(metrics.executionLayers).toBe(2);
    });
  });
});
