import { beforeEach, describe, expect, it, mock } from 'bun:test';

import type { ExecutionTask } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { VcsStrategyContext } from '@/core/vcs/vcs-strategy';
import type { TaskV2 } from '@/types/schemas-v2';

import { StackedVcsStrategy } from '@/services/vcs/strategies/stacked-vcs-strategy';

describe('StackedVcsStrategy - Branch Suffix Handling', () => {
  let strategy: StackedVcsStrategy;
  let mockVcsEngine: VcsEngineService;

  beforeEach(() => {
    mockVcsEngine = {
      initialize: mock().mockResolvedValue(undefined),
      createWorktreesForTasks: mock().mockResolvedValue([]),
      removeWorktree: mock(),
      removeAllWorktrees: mock(),
      addTaskToStack: mock(),
      restack: mock().mockResolvedValue(undefined),
      initializeStackState: mock(),
      getStackInfo: mock(),
      submitStack: mock(),
      cleanupWorktrees: mock().mockResolvedValue(undefined),
      createStackBranch: mock().mockResolvedValue(undefined),
      commitInStack: mock().mockResolvedValue('commit123'),
    } as unknown as VcsEngineService;

    strategy = new StackedVcsStrategy(mockVcsEngine);
  });

  it('should handle branch creation in the Spice-first workflow', async () => {
    // With the new Spice-first workflow:
    // 1. Branch is created upfront in prepareTaskExecution
    // 2. Worktree is created from the new branch
    // 3. Commit happens using git-spice commit

    const tasks: TaskV2[] = [
      {
        id: 'create-theme-types',
        name: 'Create theme types',
        description: 'Create TypeScript type definitions',
        files: ['theme.types.ts'],
        dependencies: [],
        complexity: 'S',
        acceptanceCriteria: ['Types created'],
      },
      {
        id: 'update-css-variables',
        name: 'Update CSS variables',
        description: 'Update CSS for theming',
        files: ['globals.css'],
        dependencies: [], // No dependencies - parallel task
        complexity: 'M',
        acceptanceCriteria: ['CSS updated'],
      },
    ];

    const context: VcsStrategyContext = {
      cwd: '/test/repo',
      baseRef: 'main',
    };

    await strategy.initialize(tasks, context);

    // Prepare execution for first task (creates branch first)
    const task1ExecutionTask: ExecutionTask = {
      ...tasks[0]!,
      state: 'pending',
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
    };

    // Mock worktree creation
    (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValueOnce([
      {
        taskId: 'create-theme-types',
        worktreePath: '.chopstack/shadows/create-theme-types',
        absolutePath: '/test/repo/.chopstack/shadows/create-theme-types',
        branchName: 'chopstack/create-theme-types',
        baseRef: 'main',
        created: new Date(),
      },
    ]);

    const task1Context = await strategy.prepareTaskExecution(
      tasks[0]!,
      task1ExecutionTask,
      context,
    );

    // Branch should be created first
    expect(mockVcsEngine.createStackBranch).toHaveBeenCalledWith(
      'chopstack/create-theme-types',
      'main',
      '/test/repo',
    );

    // Then worktree from the new branch
    expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ branchName: 'chopstack/create-theme-types' }),
      ]),
      'chopstack/create-theme-types',
      '/test/repo',
    );

    // Complete first task
    const result1 = await strategy.handleTaskCompletion(
      tasks[0]!,
      { ...tasks[0]!, commitHash: 'commit123' } as ExecutionTask,
      task1Context!,
    );

    // Commit should use git-spice
    expect(mockVcsEngine.commitInStack).toHaveBeenCalled();
    expect(result1.commitHash).toBe('commit123');
    expect(result1.branchName).toBe('chopstack/create-theme-types');
  });

  it('should handle dependencies correctly in the Spice-first workflow', async () => {
    // Test for dependent tasks
    const tasks: TaskV2[] = [
      {
        id: 'task-1',
        name: 'Task 1',
        description: 'First task',
        files: ['file1.ts'],
        dependencies: [],
        complexity: 'S',
        acceptanceCriteria: ['Task 1 completed'],
      },
      {
        id: 'task-2',
        name: 'Task 2',
        description: 'Second task',
        files: ['file2.ts'],
        dependencies: ['task-1'], // Depends on task-1
        complexity: 'S',
        acceptanceCriteria: ['Task 2 completed'],
      },
    ];

    const context: VcsStrategyContext = {
      cwd: '/test/repo',
      baseRef: 'main',
    };

    await strategy.initialize(tasks, context);

    // Prepare and complete first task
    const task1ExecutionTask: ExecutionTask = {
      ...tasks[0]!,
      state: 'pending',
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
    };

    // Mock worktree creation for task-1
    (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValueOnce([
      {
        taskId: 'task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: '/test/repo/.chopstack/shadows/task-1',
        branchName: 'chopstack/task-1',
        baseRef: 'main',
        created: new Date(),
      },
    ]);

    const task1Context = await strategy.prepareTaskExecution(
      tasks[0]!,
      task1ExecutionTask,
      context,
    );

    // Complete task-1
    await strategy.handleTaskCompletion(
      tasks[0]!,
      { ...tasks[0]!, commitHash: 'commit123' } as ExecutionTask,
      task1Context!,
    );

    // Now prepare task-2 with dependency on task-1
    const task2ExecutionTask: ExecutionTask = {
      ...tasks[1]!,
      state: 'pending',
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
    };

    // Mock worktree creation for task-2
    (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValueOnce([
      {
        taskId: 'task-2',
        worktreePath: '.chopstack/shadows/task-2',
        absolutePath: '/test/repo/.chopstack/shadows/task-2',
        branchName: 'chopstack/task-2',
        baseRef: 'chopstack/task-1',
        created: new Date(),
      },
    ]);

    const task2Context = await strategy.prepareTaskExecution(
      tasks[1]!,
      task2ExecutionTask,
      context,
    );

    // Branch for task-2 should be created with task-1's branch as parent
    expect(mockVcsEngine.createStackBranch).toHaveBeenCalledWith(
      'chopstack/task-2',
      'chopstack/task-1', // Should use task-1's branch as parent
      '/test/repo',
    );

    // Worktree should be created from task-2's new branch
    expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ branchName: 'chopstack/task-2' })]),
      'chopstack/task-2',
      '/test/repo',
    );

    expect(task2Context).not.toBeNull();
  });
});
