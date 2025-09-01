import type { Plan, Task } from '../../types/decomposer';

import { DagValidator } from '../dag-validator';

describe('DagValidator', () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'test-task',
    title: 'Test Task',
    description: 'A test task',
    touches: [],
    produces: [],
    requires: [],
    estimatedLines: 10,
    agentPrompt: 'Do something',
    ...overrides,
  });

  const createPlan = (tasks: Task[]): Plan => ({ tasks });

  describe('validatePlan', () => {
    it('validates a simple valid plan', () => {
      const tasks = [
        createTask({ id: 'task1', requires: [] }),
        createTask({ id: 'task2', requires: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects circular dependencies', () => {
      const tasks = [
        createTask({ id: 'task1', requires: ['task2'] }),
        createTask({ id: 'task2', requires: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies!.length).toBeGreaterThan(0);
    });

    it('detects file conflicts', () => {
      const tasks = [
        createTask({ id: 'task1', touches: ['file.ts'] }),
        createTask({ id: 'task2', touches: ['file.ts'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts![0]).toContain('file.ts');
    });

    it('detects missing dependencies', () => {
      const tasks = [createTask({ id: 'task1', requires: ['missing-task'] })];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.missingDependencies).toBeDefined();
      expect(result.missingDependencies![0]).toContain('missing-task');
    });

    it('detects orphaned tasks', () => {
      const tasks = [
        createTask({ id: 'task1', requires: [] }),
        createTask({ id: 'task2', requires: [] }), // Orphaned
        createTask({ id: 'task3', requires: ['task1'] }),
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.orphanedTasks).toBeDefined();
      expect(result.orphanedTasks).toContain('task2');
    });

    it('validates task structure', () => {
      const tasks = [
        createTask({ id: '', title: 'Bad Task' }), // Missing ID
        createTask({ id: 'task2', title: '', description: 'Good desc' }), // Missing title
        createTask({ id: 'task3', estimatedLines: -1 }), // Invalid lines
      ];
      const plan = createPlan(tasks);

      const result = DagValidator.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((error) => error.includes('missing ID'))).toBe(true);
      expect(result.errors.some((error) => error.includes('missing title'))).toBe(true);
      expect(result.errors.some((error) => error.includes('invalid estimated lines'))).toBe(true);
    });
  });

  describe('calculateMetrics', () => {
    it('calculates metrics for a linear plan', () => {
      const tasks = [
        createTask({ id: 'task1', estimatedLines: 10 }),
        createTask({ id: 'task2', requires: ['task1'], estimatedLines: 20 }),
        createTask({ id: 'task3', requires: ['task2'], estimatedLines: 15 }),
      ];
      const plan = createPlan(tasks);

      const metrics = DagValidator.calculateMetrics(plan);

      expect(metrics.taskCount).toBe(3);
      expect(metrics.maxParallelization).toBe(1); // Linear execution
      expect(metrics.executionLayers).toBe(3);
      expect(metrics.criticalPathLength).toBe(45); // 10 + 20 + 15
      expect(metrics.totalEstimatedLines).toBe(45);
    });

    it('calculates metrics for a parallel plan', () => {
      const tasks = [
        createTask({ id: 'task1', estimatedLines: 10 }),
        createTask({ id: 'task2', requires: ['task1'], estimatedLines: 20 }),
        createTask({ id: 'task3', requires: ['task1'], estimatedLines: 15 }),
        createTask({ id: 'task4', requires: ['task2', 'task3'], estimatedLines: 5 }),
      ];
      const plan = createPlan(tasks);

      const metrics = DagValidator.calculateMetrics(plan);

      expect(metrics.taskCount).toBe(4);
      expect(metrics.maxParallelization).toBe(2); // task2 and task3 can run in parallel
      expect(metrics.executionLayers).toBe(3);
      expect(metrics.criticalPathLength).toBe(35); // 10 + 20 + 5 (longest path)
      expect(metrics.totalEstimatedLines).toBe(50);
    });
  });

  describe('getExecutionOrder', () => {
    it('returns tasks in topological order', () => {
      const tasks = [
        createTask({ id: 'task3', requires: ['task1', 'task2'] }),
        createTask({ id: 'task1', requires: [] }),
        createTask({ id: 'task2', requires: ['task1'] }),
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
        createTask({ id: 'task1', requires: [] }),
        createTask({ id: 'task2', requires: [] }),
        createTask({ id: 'task3', requires: ['task1'] }),
        createTask({ id: 'task4', requires: ['task2'] }),
        createTask({ id: 'task5', requires: ['task3', 'task4'] }),
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

  describe('complex scenarios', () => {
    it('handles diamond dependency pattern', () => {
      const tasks = [
        createTask({ id: 'root', requires: [] }),
        createTask({ id: 'left', requires: ['root'] }),
        createTask({ id: 'right', requires: ['root'] }),
        createTask({ id: 'merge', requires: ['left', 'right'] }),
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
        createTask({ id: 'chain1-1', requires: [] }),
        createTask({ id: 'chain1-2', requires: ['chain1-1'] }),
        createTask({ id: 'chain2-1', requires: [] }),
        createTask({ id: 'chain2-2', requires: ['chain2-1'] }),
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
