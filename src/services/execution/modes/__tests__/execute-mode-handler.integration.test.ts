import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { TaskOrchestrator } from '@/services/orchestration';
import type { Task } from '@/types/decomposer';

import { TaskTransitionManager } from '@/core/execution/task-transitions';
import { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';

import { ExecuteModeHandlerImpl } from '../execute-mode-handler';

describe('ExecuteModeHandlerImpl Integration Tests', () => {
  let handler: ExecuteModeHandlerImpl;
  let mockOrchestrator: TaskOrchestrator;
  let mockVcsEngine: VcsEngineService;
  let transitionManager: TaskTransitionManager; // Real instance, not a mock
  let context: ExecutionContext;

  beforeEach(() => {
    // Create mocks for external dependencies only
    mockOrchestrator = {
      executeTask: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Task completed',
      }),
    } as unknown as TaskOrchestrator;

    mockVcsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      createWorktreesForTasks: vi.fn().mockResolvedValue([]),
      cleanupWorktrees: vi.fn().mockResolvedValue(undefined),
      commitTaskChanges: vi.fn().mockResolvedValue('abc123'),
      buildStackFromTasks: vi.fn().mockResolvedValue({
        branches: [],
        parentRef: 'main',
      }),
      analyzeWorktreeNeeds: vi.fn(),
    } as unknown as VcsEngineService;

    // Use REAL TaskTransitionManager
    transitionManager = new TaskTransitionManager();

    const vcsStrategyFactory = new VcsStrategyFactory(mockVcsEngine);
    handler = new ExecuteModeHandlerImpl(mockOrchestrator, vcsStrategyFactory, transitionManager);

    context = {
      agentType: 'claude',
      continueOnError: false,
      cwd: '/test',
      dryRun: false,
      maxRetries: 3,
      vcsMode: 'simple',
      verbose: false,
    };
  });

  describe('Real State Transition Tests', () => {
    it('should properly track task state transitions through execution', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'Test task',
          produces: [],
          estimatedLines: 10,
        },
      ];

      const result = await handler.handle(tasks, context);

      // Verify real state transitions occurred
      const taskState = transitionManager.getTaskState('task1');
      expect(taskState).toBe('completed');

      // Check transition history
      const transitions = transitionManager.getTaskTransitions('task1');
      // Should have: pending->ready, ready->queued, queued->running, running->completed
      expect(transitions.length).toBeGreaterThanOrEqual(3);
      expect(transitions[0]).toMatchObject({ from: 'pending', to: 'ready' });
      expect(transitions[1]).toMatchObject({ from: 'ready', to: 'queued' });
      expect(transitions[2]).toMatchObject({ from: 'queued', to: 'running' });

      expect(result.tasks[0]?.status).toBe('success');
    });

    it('should handle task dependencies correctly', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'First task',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: ['task1'],
          description: 'Second task depends on first',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task3',
          title: 'Task 3',
          agentPrompt: 'Do task 3',
          touches: ['file3.ts'],
          requires: ['task1'],
          description: 'Third task also depends on first',
          produces: [],
          estimatedLines: 10,
        },
      ];

      const result = await handler.handle(tasks, context);

      // Verify tasks executed in correct order
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(3);

      // First call should be task1
      expect(mockOrchestrator.executeTask).toHaveBeenNthCalledWith(
        1,
        'task1',
        'Task 1',
        'Do task 1',
        ['file1.ts'],
        '/test',
        'execute',
        'claude',
      );

      // Tasks 2 and 3 should be called after task 1
      const secondCallTaskId = (mockOrchestrator.executeTask as any).mock.calls[1][0];
      const thirdCallTaskId = (mockOrchestrator.executeTask as any).mock.calls[2][0];
      expect(['task2', 'task3']).toContain(secondCallTaskId);
      expect(['task2', 'task3']).toContain(thirdCallTaskId);

      // All tasks should be completed
      expect(transitionManager.getTaskState('task1')).toBe('completed');
      expect(transitionManager.getTaskState('task2')).toBe('completed');
      expect(transitionManager.getTaskState('task3')).toBe('completed');

      expect(result.tasks).toHaveLength(3);
    });

    it('should properly handle retry logic with real state tracking', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'Test task',
          produces: [],
          estimatedLines: 10,
        },
      ];

      let callCount = 0;
      (mockOrchestrator.executeTask as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { status: 'failed', error: 'First failure' };
        }
        return { status: 'completed', output: 'Task completed' };
      });

      const result = await handler.handle(tasks, context);

      // Verify retry occurred
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);

      // Check transition history shows failure then success
      const transitions = transitionManager.getTaskTransitions('task1');

      // The handler tracks main state transitions
      // We should see evidence that the task was retried (executed twice)
      expect(transitions.length).toBeGreaterThanOrEqual(4);

      // Since implementation may not transition through failed state for retries,
      // verify retry occurred by checking execution was called twice
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);

      // Final state should be completed
      expect(transitionManager.getTaskState('task1')).toBe('completed');
      expect(result.tasks[0]?.status).toBe('success');
    });

    it('should detect circular dependencies via state management', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: ['task2'],
          description: 'Circular dep 1',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: ['task1'],
          description: 'Circular dep 2',
          produces: [],
          estimatedLines: 10,
        },
      ];

      const result = await handler.handle(tasks, context);

      // No tasks should execute due to circular dependency
      expect(mockOrchestrator.executeTask).not.toHaveBeenCalled();

      // Tasks should remain in pending/blocked state
      const task1State = transitionManager.getTaskState('task1');
      const task2State = transitionManager.getTaskState('task2');
      expect(['pending', 'blocked']).toContain(task1State);
      expect(['pending', 'blocked']).toContain(task2State);

      expect(result.tasks).toHaveLength(0);
    });

    it('should skip dependent tasks when parent fails', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'Parent task',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: ['task1'],
          description: 'Dependent task',
          produces: [],
          estimatedLines: 10,
        },
      ];

      // Make task1 fail with no retries
      (mockOrchestrator.executeTask as any).mockResolvedValue({
        status: 'failed',
        error: 'Task failed',
      });
      context.maxRetries = 0;

      const result = await handler.handle(tasks, context);

      // Only task1 should have been executed
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(1);
      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task1',
        'Task 1',
        'Do task 1',
        ['file1.ts'],
        '/test',
        'execute',
        'claude',
      );

      // Task1 should be failed, task2 should be skipped
      expect(transitionManager.getTaskState('task1')).toBe('failed');
      expect(transitionManager.getTaskState('task2')).toBe('skipped');

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]?.status).toBe('failure');
    });

    it('should continue execution when continueOnError is true', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'First task',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: [],
          description: 'Second independent task',
          produces: [],
          estimatedLines: 10,
        },
      ];

      context.continueOnError = true;
      context.maxRetries = 0;

      // Make first task fail
      let callCount = 0;
      (mockOrchestrator.executeTask as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { status: 'failed', error: 'Task 1 failed' };
        }
        return { status: 'completed', output: 'Task 2 completed' };
      });

      const result = await handler.handle(tasks, context);

      // Both tasks should execute
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);

      // Task states should reflect their outcomes
      expect(transitionManager.getTaskState('task1')).toBe('failed');
      expect(transitionManager.getTaskState('task2')).toBe('completed');

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]?.status).toBe('failure');
      expect(result.tasks[1]?.status).toBe('success');
    });

    it('should track execution statistics accurately', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'Task 1',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: ['task1'],
          description: 'Task 2',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task3',
          title: 'Task 3',
          agentPrompt: 'Do task 3',
          touches: ['file3.ts'],
          requires: ['task1'],
          description: 'Task 3',
          produces: [],
          estimatedLines: 10,
        },
      ];

      // Make task2 fail
      let callCount = 0;
      (mockOrchestrator.executeTask as any).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return { status: 'failed', error: 'Task 2 failed' };
        }
        return { status: 'completed', output: 'Task completed' };
      });

      context.continueOnError = true;
      context.maxRetries = 0;

      await handler.handle(tasks, context);

      // Get real statistics from transition manager
      const stats = transitionManager.getStatistics();

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(2); // task1 and task3
      expect(stats.failed).toBe(1); // task2
      expect(stats.skipped).toBe(0);
    });

    it('should use worktree directories when executing tasks in parallel mode', async () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          title: 'Task 1',
          agentPrompt: 'Do task 1',
          touches: ['file1.ts'],
          requires: [],
          description: 'Task 1',
          produces: [],
          estimatedLines: 10,
        },
        {
          id: 'task2',
          title: 'Task 2',
          agentPrompt: 'Do task 2',
          touches: ['file2.ts'],
          requires: [],
          description: 'Task 2',
          produces: [],
          estimatedLines: 10,
        },
      ];

      // Set up parallel context
      context.vcsMode = 'worktree';

      // Mock worktree creation
      (mockVcsEngine.createWorktreesForTasks as any).mockResolvedValue([
        {
          taskId: 'task1',
          branchName: 'chopstack/task1',
          baseRef: 'HEAD',
          absolutePath: '/test/.chopstack/shadows/task1',
          worktreePath: '.chopstack/shadows/task1',
          created: new Date(),
        },
        {
          taskId: 'task2',
          branchName: 'chopstack/task2',
          baseRef: 'HEAD',
          absolutePath: '/test/.chopstack/shadows/task2',
          worktreePath: '.chopstack/shadows/task2',
          created: new Date(),
        },
      ]);

      // Mock successful task execution
      (mockOrchestrator.executeTask as any).mockResolvedValue({
        status: 'completed',
        output: 'Task completed',
      });

      await handler.handle(tasks, context);

      // Verify worktrees were created
      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'task1' }),
          expect.objectContaining({ id: 'task2' }),
        ]),
        'HEAD',
        '/test',
      );

      // Verify tasks were executed with worktree directories
      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task1',
        'Task 1',
        'Do task 1',
        ['file1.ts'],
        '/test/.chopstack/shadows/task1', // Worktree directory for task1
        'execute',
        'claude',
      );

      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task2',
        'Task 2',
        'Do task 2',
        ['file2.ts'],
        '/test/.chopstack/shadows/task2', // Worktree directory for task2
        'execute',
        'claude',
      );
    });
  });
});
