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
      createStackBranch: vi.fn().mockResolvedValue(undefined),
      commitInStack: vi.fn().mockResolvedValue('abc123'),
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
        expect.arrayContaining([expect.objectContaining({ branchName: 'chopstack/task1' })]),
        'chopstack/task1', // Should use the newly created branch
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

      const worktreeContext: WorktreeContext = {
        taskId: 'task2',
        branchName: 'chopstack/task2',
        baseRef: 'main',
        worktreePath: '.chopstack/shadows/task2',
        absolutePath: '/test/repo/.chopstack/shadows/task2',
        created: new Date(),
      };

      (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValue([worktreeContext]);

      await strategy.initialize([task], context);
      await strategy.prepareTaskExecution(task, executionTask, context);

      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ branchName: 'chopstack/task2' })]),
        'chopstack/task2', // Should use the newly created branch
        '/test/repo',
      );
    });
  });

  describe('handleTaskCompletion', () => {
    it('should use git-spice commit for task completion', async () => {
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
        branchName: 'chopstack/task1',
        baseRef: 'main',
        worktreePath: '.chopstack/shadows/task1',
        absolutePath: '/test/repo/.chopstack/shadows/task1',
        created: new Date(),
      };

      await strategy.initialize([task], context);
      const result = await strategy.handleTaskCompletion(task, executionTask, worktreeContext);

      expect(result).toEqual({
        taskId: 'task1',
        commitHash: 'abc123',
        branchName: 'chopstack/task1',
      });

      // Should use git-spice commit
      expect(mockVcsEngine.commitInStack).toHaveBeenCalledWith(
        executionTask,
        worktreeContext,
        expect.objectContaining({ generateMessage: true, includeAll: true }),
      );
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

      // Mock restack to succeed
      (mockVcsEngine.restack as any).mockResolvedValue();

      const results = [
        { taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' },
        { taskId: 'task2', commitHash: 'commit2', branchName: 'chopstack/task2' },
      ];

      // Set up the internal branch stack to simulate task completion
      (strategy as any)._branchStack = ['main', 'chopstack/task1', 'chopstack/task2'];

      const finalResult = await strategy.finalize(results, context);

      // Check that restack was called
      expect(mockVcsEngine.restack).toHaveBeenCalledWith('/test/repo');

      // Check the returned branches and commits
      expect(finalResult.branches).toEqual(['chopstack/task1', 'chopstack/task2']);
      expect(finalResult.commits).toEqual(['commit1', 'commit2']);

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

      // Mock restack to fail
      (mockVcsEngine.restack as any).mockRejectedValueOnce(new Error('Restack failed'));

      const results = [{ taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' }];

      // Set up the internal branch stack to simulate task completion
      (strategy as any)._branchStack = ['main', 'chopstack/task1'];

      // Should not throw, but log error
      await expect(strategy.finalize(results, context)).resolves.not.toThrow();

      // Check the result still contains the data
      const finalResult = await strategy.finalize(results, context);
      expect(finalResult.branches).toContain('chopstack/task1');
      expect(finalResult.commits).toContain('commit1');
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

      // Mock restack
      (mockVcsEngine.restack as any).mockResolvedValue();

      // Set up results as if tasks completed in order
      const results = [
        { taskId: 'task1', commitHash: 'commit1', branchName: 'chopstack/task1' },
        { taskId: 'task2', commitHash: 'commit2', branchName: 'chopstack/task2' },
        { taskId: 'task3', commitHash: 'commit3', branchName: 'chopstack/task3' },
      ];

      // Set up the internal branch stack to simulate proper stacking order
      // task1 and task2 are independent (no deps), task3 depends on both
      (strategy as any)._branchStack = [
        'main',
        'chopstack/task1',
        'chopstack/task2',
        'chopstack/task3',
      ];

      const finalResult = await strategy.finalize(results, context);

      // Should call restack
      expect(mockVcsEngine.restack).toHaveBeenCalledWith('/test/repo');

      // Check the final result
      expect(finalResult.branches).toEqual([
        'chopstack/task1',
        'chopstack/task2',
        'chopstack/task3',
      ]);
      expect(finalResult.commits).toEqual(['commit1', 'commit2', 'commit3']);
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
