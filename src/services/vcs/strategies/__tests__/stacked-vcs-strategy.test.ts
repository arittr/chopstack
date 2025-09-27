import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionTask } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { VcsStrategyContext, WorktreeContext } from '@/core/vcs/vcs-strategy';
import type { Task } from '@/types/decomposer';

import { StackedVcsStrategy } from '../stacked-vcs-strategy';

describe('StackedVcsStrategy', () => {
  let strategy: StackedVcsStrategy;
  let mockVcsEngine: VcsEngineService;
  let context: VcsStrategyContext;

  beforeEach(() => {
    mockVcsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      initializeStackState: vi.fn(),
      createWorktreesForTasks: vi.fn().mockResolvedValue([]),
      addTaskToStack: vi.fn().mockResolvedValue('chopstack/test-branch'),
      restack: vi.fn().mockResolvedValue(undefined),
      cleanupWorktrees: vi.fn().mockResolvedValue(undefined),
    } as unknown as VcsEngineService;

    strategy = new StackedVcsStrategy(mockVcsEngine);

    context = {
      cwd: '/test/repo',
      baseRef: 'main',
    };
  });

  describe('initialize', () => {
    it('should initialize with base branch and set currentStackTip', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'Test task 1',
          touches: ['file1.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
      ];

      await strategy.initialize(tasks, context);

      expect(mockVcsEngine.initialize).toHaveBeenCalledWith('/test/repo');
      expect(mockVcsEngine.initializeStackState).toHaveBeenCalledWith('main');
    });

    it('should handle HEAD as baseRef', async () => {
      const tasks: Task[] = [];
      context.baseRef = 'HEAD';

      await strategy.initialize(tasks, context);

      expect(mockVcsEngine.initializeStackState).toHaveBeenCalledWith('HEAD');
    });
  });

  describe('prepareTaskExecution', () => {
    it('should always use base branch for worktree creation', async () => {
      const task: Task = {
        id: 'task1',
        title: 'Task 1',
        description: 'Test task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      };

      const executionTask: ExecutionTask = {
        ...task,
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const worktreeContext: WorktreeContext = {
        taskId: 'task1',
        branchName: 'tmp-chopstack/task1',
        baseRef: 'main',
        worktreePath: '.chopstack/shadows/task1',
        absolutePath: '/test/repo/.chopstack/shadows/task1',
        created: new Date(),
      };

      (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValue([worktreeContext]);

      await strategy.initialize([task], context);
      const result = await strategy.prepareTaskExecution(task, executionTask, context);

      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        [executionTask],
        'main', // Should always use base branch
        '/test/repo',
      );
      expect(result).toEqual(worktreeContext);
    });

    it('should use base branch even for tasks with dependencies', async () => {
      const task: Task = {
        id: 'task2',
        title: 'Task 2',
        description: 'Dependent task',
        touches: ['file2.ts'],
        produces: [],
        requires: ['task1'], // Has dependency
        estimatedLines: 10,
        agentPrompt: 'Do task 2',
      };

      const executionTask: ExecutionTask = {
        ...task,
        state: 'pending',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      await strategy.initialize([task], context);
      await strategy.prepareTaskExecution(task, executionTask, context);

      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        [executionTask],
        'main', // Should still use base branch, not dependency branch
        '/test/repo',
      );
    });
  });

  describe('handleTaskCompletion', () => {
    it('should add task to completion queue without immediate stacking', async () => {
      const task: Task = {
        id: 'task1',
        title: 'Task 1',
        description: 'Test task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      };

      const executionTask: ExecutionTask = {
        ...task,
        state: 'completed',
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
        commitHash: 'abc123',
      };

      const worktreeContext: WorktreeContext = {
        taskId: 'task1',
        branchName: 'tmp-chopstack/task1',
        baseRef: 'main',
        worktreePath: '.chopstack/shadows/task1',
        absolutePath: '/test/repo/.chopstack/shadows/task1',
        created: new Date(),
      };

      const { commitService } = strategy as any;
      commitService.commitChanges = vi.fn().mockResolvedValue('abc123');

      await strategy.initialize([task], context);
      const result = await strategy.handleTaskCompletion(task, executionTask, worktreeContext);

      expect(result).toEqual({
        taskId: 'task1',
        commitHash: 'abc123',
        branchName: 'chopstack/task1',
      });

      // Should NOT call addTaskToStack immediately
      expect(mockVcsEngine.addTaskToStack).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('should process completion queue in order and update currentStackTip', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['file1.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Second task',
          touches: ['file2.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 2',
        },
      ];

      await strategy.initialize(tasks, context);

      // Simulate task completions
      const queue = (strategy as any).completionQueue;
      queue.push(
        { taskId: 'task1', commitHash: 'commit1' },
        { taskId: 'task2', commitHash: 'commit2' },
      );

      // Mock addTaskToStack to return branch names
      (mockVcsEngine.addTaskToStack as any)
        .mockResolvedValueOnce('chopstack/task1')
        .mockResolvedValueOnce('chopstack/task2');

      const results = [
        { taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' },
        { taskId: 'task2', commitHash: 'commit2', branchName: 'chopstack/task2' },
      ];

      await strategy.finalize(results, context);

      // Check that tasks were stacked in order
      expect(mockVcsEngine.addTaskToStack).toHaveBeenCalledTimes(2);

      // First task should be stacked on main
      expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'task1', commitHash: 'commit1' }),
        '/test/repo',
        expect.objectContaining({ baseRef: 'main' }),
      );

      // Second task should be stacked on first task's branch
      expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'task2', commitHash: 'commit2' }),
        '/test/repo',
        expect.objectContaining({ baseRef: 'chopstack/task1' }),
      );

      // Should call restack at the end
      expect(mockVcsEngine.restack).toHaveBeenCalledWith('/test/repo');
    });

    it('should handle stacking failures gracefully', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'Task that fails to stack',
          touches: ['file1.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
      ];

      await strategy.initialize(tasks, context);

      const queue = (strategy as any).completionQueue;
      queue.push({ taskId: 'task1', commitHash: 'commit1' });

      // Mock addTaskToStack to throw error
      (mockVcsEngine.addTaskToStack as any).mockRejectedValue(new Error('Stack failed'));

      const results = [{ taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' }];

      // Should not throw, but log error
      await expect(strategy.finalize(results, context)).resolves.not.toThrow();
    });

    it('should create cumulative stack with proper parent relationships', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First layer task',
          touches: ['file1.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'First layer task',
          touches: ['file2.ts'],
          produces: [],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 2',
        },
        {
          id: 'task3',
          title: 'Task 3',
          description: 'Second layer task',
          touches: ['file3.ts'],
          produces: [],
          requires: ['task1', 'task2'],
          estimatedLines: 10,
          agentPrompt: 'Do task 3',
        },
      ];

      await strategy.initialize(tasks, context);

      // Simulate completion order: task2, task1, task3
      const queue = (strategy as any).completionQueue;
      queue.push(
        { taskId: 'task2', commitHash: 'commit2' },
        { taskId: 'task1', commitHash: 'commit1' },
        { taskId: 'task3', commitHash: 'commit3' },
      );

      (mockVcsEngine.addTaskToStack as any)
        .mockResolvedValueOnce('chopstack/task2')
        .mockResolvedValueOnce('chopstack/task1')
        .mockResolvedValueOnce('chopstack/task3');

      const results = [
        { taskId: 'task2', commitHash: 'commit2', branchName: 'chopstack/task2' },
        { taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' },
        { taskId: 'task3', commitHash: 'commit3', branchName: 'chopstack/task3' },
      ];

      const finalResult = await strategy.finalize(results, context);

      // Verify stacking order matches completion order
      expect(mockVcsEngine.addTaskToStack).toHaveBeenCalledTimes(3);

      // task2 stacked on main
      expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'task2' }),
        '/test/repo',
        expect.objectContaining({ baseRef: 'main' }),
      );

      // task1 stacked on task2
      expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'task1' }),
        '/test/repo',
        expect.objectContaining({ baseRef: 'chopstack/task2' }),
      );

      // task3 stacked on task1
      expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ id: 'task3' }),
        '/test/repo',
        expect.objectContaining({ baseRef: 'chopstack/task1' }),
      );

      expect(finalResult.branches).toEqual([
        'chopstack/task2',
        'chopstack/task1',
        'chopstack/task3',
      ]);
      expect(finalResult.commits).toEqual(['commit2', 'commit1', 'commit3']);
    });
  });

  describe('cleanup', () => {
    it('should clean up worktrees', async () => {
      const worktreeContext: WorktreeContext = {
        taskId: 'task1',
        branchName: 'tmp-chopstack/task1',
        baseRef: 'main',
        worktreePath: '.chopstack/shadows/task1',
        absolutePath: '/test/repo/.chopstack/shadows/task1',
        created: new Date(),
      };

      const worktreeContexts = (strategy as any).worktreeContexts as Map<string, WorktreeContext>;
      worktreeContexts.set('task1', worktreeContext);

      await strategy.cleanup();

      expect(mockVcsEngine.cleanupWorktrees).toHaveBeenCalledWith([worktreeContext]);
    });
  });
});
