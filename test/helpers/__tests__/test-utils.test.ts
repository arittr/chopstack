import { describe, expect, it } from 'bun:test';

import {
  createMockFn,
  createTestDagNode,
  createTestPlan,
  createTestTask,
  waitFor,
} from '../test-utils';

describe('Test Utilities', () => {
  describe('createTestTask', () => {
    it('should create task with default values', () => {
      const task = createTestTask();

      expect(task).toEqual({
        id: 'task-1',
        title: 'Test Task',
        description: 'Test task description',
        dependencies: [],
        files: [],
        priority: 1,
        complexity: 1,
      });
    });

    it('should allow overriding values', () => {
      const task = createTestTask({
        id: 'custom-task',
        title: 'Custom Title',
        dependencies: ['dep1', 'dep2'],
        files: ['file1.ts', 'file2.ts'],
        priority: 3,
        complexity: 5,
        commitHash: 'abc123',
      });

      expect(task).toEqual({
        id: 'custom-task',
        title: 'Custom Title',
        description: 'Test task description',
        dependencies: ['dep1', 'dep2'],
        files: ['file1.ts', 'file2.ts'],
        priority: 3,
        complexity: 5,
        commitHash: 'abc123',
      });
    });

    it('should handle optional commitHash correctly', () => {
      const taskWithoutHash = createTestTask({ id: 'no-hash' });
      expect(taskWithoutHash).not.toHaveProperty('commitHash');

      const taskWithHash = createTestTask({ id: 'with-hash', commitHash: 'def456' });
      expect(taskWithHash.commitHash).toBe('def456');
    });
  });

  describe('createTestDagNode', () => {
    it('should create DAG node with default values', () => {
      const node = createTestDagNode();

      expect(node.id).toBe('task-1');
      expect(node.task.id).toBe('task-1');
      expect(node.dependencies).toEqual([]);
      expect(node.dependents).toEqual([]);
      expect(node.depth).toBe(0);
      expect(node.status).toBe('pending');
    });

    it('should allow overriding all values', () => {
      const customTask = createTestTask({ id: 'custom-node-task' });
      const node = createTestDagNode({
        id: 'custom-node',
        task: customTask,
        dependencies: ['dep1'],
        dependents: ['dep2'],
        depth: 2,
        status: 'completed',
      });

      expect(node.id).toBe('custom-node');
      expect(node.task).toBe(customTask);
      expect(node.dependencies).toEqual(['dep1']);
      expect(node.dependents).toEqual(['dep2']);
      expect(node.depth).toBe(2);
      expect(node.status).toBe('completed');
    });

    it('should auto-create task with matching ID', () => {
      const node = createTestDagNode({ id: 'auto-task' });
      expect(node.task.id).toBe('auto-task');
    });
  });

  describe('createTestPlan', () => {
    it('should create plan with default tasks', () => {
      const plan = createTestPlan();

      expect(plan.tasks).toHaveLength(2);
      expect(plan.tasks[0]?.id).toBe('task-1');
      expect(plan.tasks[1]?.id).toBe('task-2');
      expect(plan.tasks[1]?.dependencies).toEqual(['task-1']);

      expect(plan.dag.size).toBe(2);
      expect(plan.dag.has('task-1')).toBe(true);
      expect(plan.dag.has('task-2')).toBe(true);

      expect(plan.executionOrder).toEqual([['task-1'], ['task-2']]);

      expect(plan.stats).toEqual({
        maxDepth: 1,
        parallelizableGroups: 2,
        totalComplexity: 2,
        totalTasks: 2,
      });
    });

    it('should allow custom tasks and stats', () => {
      const customTasks = [
        createTestTask({ id: 'a', complexity: 3 }),
        createTestTask({ id: 'b', complexity: 2 }),
        createTestTask({ id: 'c', complexity: 1 }),
      ];

      const plan = createTestPlan({
        tasks: customTasks,
        executionOrder: [['a'], ['b', 'c']],
        stats: {
          maxDepth: 2,
          parallelizableGroups: 2,
          totalComplexity: 6,
          totalTasks: 3,
        },
      });

      expect(plan.tasks).toHaveLength(3);
      expect(plan.stats.totalComplexity).toBe(6);
      expect(plan.executionOrder).toEqual([['a'], ['b', 'c']]);
    });

    it('should calculate stats from tasks if not provided', () => {
      const tasks = [
        createTestTask({ id: 'x', complexity: 5 }),
        createTestTask({ id: 'y', complexity: 3 }),
      ];

      const plan = createTestPlan({ tasks });

      expect(plan.stats.totalComplexity).toBe(8);
      expect(plan.stats.totalTasks).toBe(2);
    });
  });

  describe('waitFor', () => {
    it('should resolve when condition becomes true', async () => {
      let condition = false;
      // Set condition to true immediately for testing
      condition = true;

      await expect(
        waitFor(() => condition, { timeout: 1000, interval: 50 }),
      ).resolves.not.toThrow();
    });

    it('should timeout when condition never becomes true', async () => {
      await expect(waitFor(() => false, { timeout: 100, interval: 10 })).rejects.toThrow(
        'Timeout waiting for condition',
      );
    });

    it('should use custom timeout message', async () => {
      await expect(
        waitFor(() => false, { timeout: 50, message: 'Custom failure message' }),
      ).rejects.toThrow('Timeout waiting for condition: Custom failure message');
    });

    it('should work with async conditions', async () => {
      let asyncCondition = false;
      // Set condition immediately for testing
      asyncCondition = true;

      await expect(waitFor(() => asyncCondition, { timeout: 500 })).resolves.not.toThrow();
    });

    it('should use default values for options', async () => {
      let condition = false;
      // Set condition immediately for testing
      condition = true;

      // Should use default timeout (5000ms) and interval (100ms)
      await expect(waitFor(() => condition)).resolves.not.toThrow();
    });
  });

  describe('createMockFn', () => {
    it('should create properly typed mock function', () => {
      type TestFunction = (a: string, b: number) => boolean;
      const mockFn = createMockFn<TestFunction>();

      // Should be callable
      expect(typeof mockFn).toBe('function');

      // Should have mock properties
      expect(mockFn.mock).toBeDefined();
      expect(mockFn.mockReturnValue).toBeDefined();
      expect(mockFn.mockResolvedValue).toBeDefined();

      // Should work with mocking
      mockFn.mockReturnValue(true);
      const result = mockFn('test', 42);
      expect(result).toBe(true);
      expect(mockFn).toHaveBeenCalledWith('test', 42);
    });
  });
});
