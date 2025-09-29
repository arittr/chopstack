import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionTask } from '@/core/execution/types';
import type { WorktreeContext } from '@/core/vcs/domain-services';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { VcsStrategyContext } from '@/core/vcs/vcs-strategy';
import type { Task } from '@/types/decomposer';

import { StackedVcsStrategy } from '@/services/vcs/strategies/stacked-vcs-strategy';

describe('StackedVcsStrategy - Branch Suffix Handling', () => {
  let strategy: StackedVcsStrategy;
  let mockVcsEngine: VcsEngineService;

  beforeEach(() => {
    mockVcsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      createWorktreesForTasks: vi.fn().mockResolvedValue([]),
      removeWorktree: vi.fn(),
      removeAllWorktrees: vi.fn(),
      addTaskToStack: vi.fn(),
      restack: vi.fn().mockResolvedValue(undefined),
      initializeStackState: vi.fn(),
      getStackInfo: vi.fn(),
      submitStack: vi.fn(),
    } as unknown as VcsEngineService;

    strategy = new StackedVcsStrategy(mockVcsEngine);

    // Mock the internal commit service
    (strategy as any).commitService = {
      commitChanges: vi.fn().mockResolvedValue('commit123'),
      generateCommitMessage: vi.fn(),
    };
  });

  it('should track branches with suffixes correctly when collisions occur', async () => {
    // This test reproduces the actual production bug where:
    // 1. First task creates branch with suffix (e.g., chopstack/task-1-abc123)
    // 2. Second task tries to use the suffixed name as parent
    // 3. Git-spice tracking fails because it gets the wrong parent name

    const tasks: Task[] = [
      {
        id: 'create-theme-types',
        title: 'Create theme types',
        description: 'Create TypeScript type definitions',
        touches: ['theme.types.ts'],
        produces: [],
        requires: [],
        estimatedLines: 50,
        agentPrompt: 'Create theme types',
      },
      {
        id: 'update-css-variables',
        title: 'Update CSS variables',
        description: 'Update CSS for theming',
        touches: ['globals.css'],
        produces: [],
        requires: [], // No dependencies - parallel task
        estimatedLines: 100,
        agentPrompt: 'Update CSS variables',
      },
    ];

    const context: VcsStrategyContext = {
      cwd: '/test/repo',
      baseRef: 'main',
    };

    // Commit service already mocked in beforeEach

    // Mock addTaskToStack to simulate branch name collision
    // First call returns branch with suffix
    (mockVcsEngine.addTaskToStack as any).mockImplementation((task: ExecutionTask) => {
      if (task.id === 'create-theme-types') {
        // Simulate collision - return suffixed name
        return 'chopstack/create-theme-types-mg44cztn';
      }
      // Second task should get the CORRECT parent (with suffix)
      // But in production, it's getting the wrong parent name
      return 'chopstack/update-css-variables';
    });

    await strategy.initialize(tasks, context);

    // Complete first task
    const task1Context: WorktreeContext = {
      taskId: 'create-theme-types',
      worktreePath: '.chopstack/shadows/create-theme-types',
      absolutePath: '/test/repo/.chopstack/shadows/create-theme-types',
      branchName: 'tmp-chopstack/create-theme-types',
      baseRef: 'main',
      created: new Date(),
    };

    const result1 = await strategy.handleTaskCompletion(
      tasks[0]!,
      { ...tasks[0]!, commitHash: 'commit123' } as ExecutionTask,
      task1Context,
    );

    expect(result1.branchName).toBe('chopstack/create-theme-types-mg44cztn');

    // Verify the internal state is tracking the suffixed name
    expect((strategy as any)._currentStackTip).toBe('chopstack/create-theme-types-mg44cztn');

    // Complete second task - this is where the bug happens
    const task2Context: WorktreeContext = {
      taskId: 'update-css-variables',
      worktreePath: '.chopstack/shadows/update-css-variables',
      absolutePath: '/test/repo/.chopstack/shadows/update-css-variables',
      branchName: 'tmp-chopstack/update-css-variables',
      baseRef: 'main', // It's a parallel task, so base is still main
      created: new Date(),
    };

    const _result2 = await strategy.handleTaskCompletion(
      tasks[1]!,
      { ...tasks[1]!, commitHash: 'commit456' } as ExecutionTask,
      task2Context,
    );

    // The second task should be stacked on the ACTUAL branch name (with suffix)
    expect(mockVcsEngine.addTaskToStack).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'update-css-variables' }),
      '/test/repo',
      expect.objectContaining({
        // THIS IS THE BUG: In production, this is 'chopstack/create-theme-types'
        // but it should be 'chopstack/create-theme-types-mg44cztn'
        baseRef: 'chopstack/create-theme-types-mg44cztn',
      }),
    );
  });

  it('should pass suffixed branch names correctly through the dependency chain', async () => {
    // Test for dependent tasks (not parallel)
    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 50,
        agentPrompt: 'Do task 1',
      },
      {
        id: 'task-2',
        title: 'Task 2',
        description: 'Second task',
        touches: ['file2.ts'],
        produces: [],
        requires: ['task-1'], // Depends on task-1
        estimatedLines: 50,
        agentPrompt: 'Do task 2',
      },
    ];

    const context: VcsStrategyContext = {
      cwd: '/test/repo',
      baseRef: 'main',
    };

    // Commit service already mocked in beforeEach

    // Simulate branch collision on first task
    (mockVcsEngine.addTaskToStack as any).mockImplementation((task: ExecutionTask) => {
      if (task.id === 'task-1') {
        return 'chopstack/task-1-suffix123';
      }
      return `chopstack/${task.id}`;
    });

    await strategy.initialize(tasks, context);

    // Complete first task
    const task1Context: WorktreeContext = {
      taskId: 'task-1',
      worktreePath: '.chopstack/shadows/task-1',
      absolutePath: '/test/repo/.chopstack/shadows/task-1',
      branchName: 'tmp-chopstack/task-1',
      baseRef: 'main',
      created: new Date(),
    };

    await strategy.handleTaskCompletion(
      tasks[0]!,
      { ...tasks[0]!, commitHash: 'commit123' } as ExecutionTask,
      task1Context,
    );

    // Now when we prepare task-2, it should find the suffixed branch name
    const task2ExecutionTask: ExecutionTask = {
      ...tasks[1]!,
      state: 'pending',
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
    };

    const _task2Context = await strategy.prepareTaskExecution(
      tasks[1]!,
      task2ExecutionTask,
      context,
    );

    // The key test: task-2's worktree should be created from the SUFFIXED branch
    expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
      [task2ExecutionTask],
      'chopstack/task-1-suffix123', // Should use the suffixed name!
      '/test/repo',
    );
  });
});
