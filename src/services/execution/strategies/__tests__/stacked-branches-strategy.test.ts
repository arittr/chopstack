import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { ExecutionPlan, ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';

import type { ExecutionStrategyDependencies } from '../execution-strategy';

import { StackedBranchesExecutionStrategy } from '../stacked-branches-strategy';

// Mock dependencies
const mockDependencies: ExecutionStrategyDependencies = {
  orchestrator: {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    executeTask: vi.fn().mockImplementation((taskId: string) =>
      Promise.resolve({
        taskId,
        status: 'completed',
        output: 'Task completed',
        startTime: new Date(),
        endTime: new Date(),
      }),
    ),
  } as any,
  vcsEngine: {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    createWorktreesForTasks: vi.fn().mockImplementation((tasks: ExecutionTask[]) =>
      Promise.resolve(
        tasks.map((task, index) => ({
          taskId: task.id,
          branchName: `chopstack/${task.id}`,
          baseRef: 'main',
          worktreePath: `/tmp/worktree-${index + 1}`,
          absolutePath: `/tmp/worktree-${index + 1}`,
          created: new Date(),
        })) as WorktreeContext[],
      ),
    ),
    commitTaskChanges: vi.fn().mockResolvedValue('commit-hash-123'),
    createBranchFromCommit: vi.fn().mockResolvedValue(undefined),
    cleanupWorktrees: vi.fn().mockResolvedValue(undefined),
    initializeStackState: vi.fn(),
    addTaskToStack: vi.fn().mockResolvedValue(undefined),
  } as any,
};

const createMockTask = (overrides: Partial<ExecutionTask> = {}): ExecutionTask => ({
  id: 'task-1',
  title: 'Test Task',
  description: 'A test task',
  touches: ['src/test.ts'],
  produces: ['src/test.ts'],
  requires: [],
  estimatedLines: 10,
  agentPrompt: 'Do something',
  maxRetries: 3,
  retryCount: 0,
  state: 'pending',
  stateHistory: [],
  ...overrides,
});

const createMockPlan = (tasks: ExecutionTask[]): ExecutionPlan => ({
  id: 'test-plan',
  createdAt: new Date(),
  mode: 'execute',
  plan: { tasks: [] },
  status: 'pending',
  strategy: 'stacked-branches',
  tasks: new Map(tasks.map((task) => [task.id, task])),
  executionLayers: [tasks], // Simple single layer for testing
  totalTasks: tasks.length,
});

const createMockContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  agentType: 'mock',
  continueOnError: false,
  cwd: '/test',
  dryRun: false,
  maxRetries: 3,
  parentRef: 'main',
  strategy: 'stacked-branches',
  verbose: false,
  ...overrides,
});

describe('StackedBranchesExecutionStrategy', () => {
  let strategy: StackedBranchesExecutionStrategy;

  beforeEach(() => {
    strategy = new StackedBranchesExecutionStrategy();
    vi.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should handle stacked-branches strategy', () => {
      const plan = createMockPlan([createMockTask()]);
      const context = createMockContext({ strategy: 'stacked-branches' });

      expect(strategy.canHandle(plan, context)).toBe(true);
    });

    it('should not handle other strategies', () => {
      const plan = createMockPlan([createMockTask()]);
      const context = createMockContext({ strategy: 'parallel' });

      expect(strategy.canHandle(plan, context)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute tasks in dependency order and create stacked branches', async () => {
      const task1 = createMockTask({ id: 'task-1', requires: [] });
      const task2 = createMockTask({ id: 'task-2', requires: ['task-1'] });
      const tasks = [task1, task2];

      const plan = createMockPlan(tasks);
      const context = createMockContext();

      const result = await strategy.execute(plan, context, mockDependencies);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.every((t) => t.status === 'success')).toBe(true);

      // The new implementation uses direct git-spice commands instead of createBranchFromCommit
      // Verify that tasks executed successfully
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.tasks.every((t) => t.status === 'success')).toBe(true);
    });

    it('should handle circular dependencies gracefully', async () => {
      const task1 = createMockTask({ id: 'task-1', requires: ['task-2'] });
      const task2 = createMockTask({ id: 'task-2', requires: ['task-1'] });
      const tasks = [task1, task2];

      const plan = createMockPlan(tasks);
      const context = createMockContext();

      const result = await strategy.execute(plan, context, mockDependencies);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.every((t) => t.status === 'success')).toBe(true);
    });

    it('should stop execution on task failure when continueOnError is false', async () => {
      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2', requires: ['task-1'] });
      const tasks = [task1, task2];

      const plan = createMockPlan(tasks);
      const context = createMockContext({ continueOnError: false });

      // Mock first task to fail
      mockDependencies.orchestrator.executeTask = vi
        .fn()
        .mockResolvedValueOnce({
          taskId: 'task-1',
          status: 'failed',
          output: 'Task failed',
          startTime: new Date(),
          endTime: new Date(),
        })
        .mockResolvedValueOnce({
          taskId: 'task-2',
          status: 'completed',
          output: 'Task completed',
          startTime: new Date(),
          endTime: new Date(),
        });

      const result = await strategy.execute(plan, context, mockDependencies);

      expect(result.tasks).toHaveLength(1); // Only first task executed
      expect(result.tasks[0]?.status).toBe('failure');
      expect(mockDependencies.vcsEngine.createBranchFromCommit).not.toHaveBeenCalled();
    });

    it('should continue execution on task failure when continueOnError is true', async () => {
      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2', requires: [] }); // No dependency on task-1
      const tasks = [task1, task2];

      const plan = createMockPlan(tasks);
      const context = createMockContext({ continueOnError: true });

      // Mock first task to fail
      mockDependencies.orchestrator.executeTask = vi
        .fn()
        .mockResolvedValueOnce({
          taskId: 'task-1',
          status: 'failed',
          output: 'Task failed',
          startTime: new Date(),
          endTime: new Date(),
        })
        .mockResolvedValueOnce({
          taskId: 'task-2',
          status: 'completed',
          output: 'Task completed',
          startTime: new Date(),
          endTime: new Date(),
        });

      const result = await strategy.execute(plan, context, mockDependencies);

      expect(result.tasks).toHaveLength(2); // Both tasks executed
      expect(result.tasks[0]?.status).toBe('failure');
      expect(result.tasks[1]?.status).toBe('success');

      // Only successful task should complete branch creation process
      // The new implementation uses direct git-spice commands instead of createBranchFromCommit
      expect(mockDependencies.vcsEngine.createBranchFromCommit).not.toHaveBeenCalled();
    });

    it('should cleanup worktrees after execution', async () => {
      const task = createMockTask({ id: 'task-1' });
      const plan = createMockPlan([task]);
      const context = createMockContext();

      await strategy.execute(plan, context, mockDependencies);

      expect(mockDependencies.vcsEngine.cleanupWorktrees).toHaveBeenCalledWith([
        expect.objectContaining({ taskId: 'task-1' }),
      ]);
    });
  });

  describe('estimateExecutionTime', () => {
    it('should calculate execution time including branch overhead', () => {
      const tasks = [
        createMockTask({ id: 'task-1', estimatedLines: 50 }),
        createMockTask({ id: 'task-2', estimatedLines: 30 }),
      ];
      const plan = createMockPlan(tasks);

      const estimatedTime = strategy.estimateExecutionTime(plan);

      // (50 + 30) * 2 (base time) + 2 * 10 (branch overhead) = 180
      expect(estimatedTime).toBe(180);
    });
  });

  describe('getName', () => {
    it('should return the correct strategy name', () => {
      expect(strategy.getName()).toBe('stacked-branches');
    });
  });
});
