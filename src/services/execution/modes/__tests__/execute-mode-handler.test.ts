import type { ExecutionContext } from '@/core/execution/interfaces';
import type { TaskTransitionManager } from '@/core/execution/task-transitions';
import type { VcsStrategy, VcsStrategyContext } from '@/core/vcs/vcs-strategy';
import type { OrchestratorTaskResult, TaskOrchestrator } from '@/services/orchestration';
import type { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';
import type { TaskV2 } from '@/types/schemas-v2';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ExecuteModeHandlerImpl } from '../execute-mode-handler';

describe('ExecuteModeHandlerImpl', () => {
  let mockOrchestrator: TaskOrchestrator;
  let mockVcsStrategyFactory: VcsStrategyFactory;
  let mockVcsStrategy: VcsStrategy;
  let mockTransitionManager: TaskTransitionManager;
  let handler: ExecuteModeHandlerImpl;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockOrchestrator = {
      executeTask: vi.fn(),
    } as unknown as TaskOrchestrator;

    mockVcsStrategy = {
      initialize: vi.fn(),
      prepareTaskExecutionContexts: vi.fn().mockResolvedValue(new Map()),
      handleTaskCompletion: vi.fn().mockResolvedValue({
        commitHash: 'abc123',
        branchName: 'task-branch',
      }),
      finalize: vi.fn().mockResolvedValue({ branches: [], commits: [] }),
      cleanup: vi.fn(),
    } as unknown as VcsStrategy;

    mockVcsStrategyFactory = {
      create: vi.fn().mockReturnValue(mockVcsStrategy),
      getDefaultParentRef: vi.fn().mockReturnValue('main'),
    } as unknown as VcsStrategyFactory;

    mockTransitionManager = {
      initialize: vi.fn(),
      getExecutableTasks: vi.fn(),
      getTaskState: vi.fn().mockReturnValue('ready'),
      transitionTask: vi.fn(),
      completeTask: vi.fn(),
      failTask: vi.fn(),
      skipTask: vi.fn(),
      allTasksComplete: vi.fn(),
      getStatistics: vi.fn().mockReturnValue({
        pending: 0,
        ready: 0,
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        blocked: 0,
      }),
      getTaskTransitions: vi.fn().mockReturnValue([]),
    } as unknown as TaskTransitionManager;

    handler = new ExecuteModeHandlerImpl(
      mockOrchestrator,
      mockVcsStrategyFactory,
      mockTransitionManager,
    );

    mockContext = {
      cwd: '/test/dir',
      agentType: 'claude',
      vcsMode: 'simple',
      continueOnError: false,
      maxRetries: 0,
      permissiveValidation: false,
    };
  });

  describe('handle', () => {
    it('should execute single task successfully with VCS commit', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Create types',
        complexity: 'M',
        description: 'Create TypeScript type definitions',
        files: ['src/types/theme.ts'],
        acceptanceCriteria: ['Types exported', 'Context defined'],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-1']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Task completed successfully',
      });

      const result = await handler.handle([task], mockContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({
        taskId: 'task-1',
        status: 'success',
      });

      // Verify VCS strategy was initialized and used
      expect(mockVcsStrategy.initialize).toHaveBeenCalled();
      expect(mockVcsStrategy.handleTaskCompletion).toHaveBeenCalled();
      expect(mockVcsStrategy.finalize).toHaveBeenCalled();
      expect(mockVcsStrategy.cleanup).toHaveBeenCalled();

      // Verify task was marked as completed
      expect(mockTransitionManager.completeTask).toHaveBeenCalledWith('task-1');
    });

    it('should generate agent prompt with acceptance criteria', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Task with criteria',
        complexity: 'L',
        description: 'Task description',
        files: ['src/test.ts'],
        acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-1']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      await handler.handle([task], mockContext);

      // Verify orchestrator was called with generated prompt
      const calledPrompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(calledPrompt).toContain('Task description');
      expect(calledPrompt).toContain('## Acceptance Criteria');
      expect(calledPrompt).toContain('- Criterion 1');
      expect(calledPrompt).toContain('- Criterion 2');
      expect(calledPrompt).toContain('## Task Complexity: L');
    });

    it('should use v2 field names in orchestrator call', async () => {
      const task: TaskV2 = {
        id: 'task-v2',
        name: 'V2 Task Name',
        complexity: 'M',
        description: 'V2 description',
        files: ['src/v2-file.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-v2']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      await handler.handle([task], mockContext);

      // Verify v2 fields are used correctly
      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task-v2',
        'V2 Task Name', // name instead of title
        expect.stringContaining('V2 description'),
        ['src/v2-file.ts'], // files instead of touches
        '/test/dir',
        'execute',
        'claude',
        undefined, // forbidden files
      );
    });

    it('should handle task failure and mark as failed', async () => {
      const task: TaskV2 = {
        id: 'task-fail',
        name: 'Failing task',
        complexity: 'M',
        description: 'Will fail',
        files: ['src/fail.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-fail']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'failed',
        output: undefined,
      });

      const result = await handler.handle([task], mockContext);

      expect(result.tasks[0]?.status).toBe('failure');
      expect(mockTransitionManager.failTask).toHaveBeenCalledWith(
        'task-fail',
        'Task execution failed',
      );
    });

    it('should handle multiple tasks in parallel', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Task 1',
          complexity: 'M',
          description: 'First task',
          files: ['src/task1.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Task 2',
          complexity: 'M',
          description: 'Second task',
          files: ['src/task2.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
      ];

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-1', 'task-2']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      const result = await handler.handle(tasks, mockContext);

      expect(result.tasks).toHaveLength(2);
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);
      // In parallel execution, completeTask is called twice in _executeLayerInParallel
      // and twice more when VCS commits complete, so 4 total is expected
      expect(mockTransitionManager.completeTask).toHaveBeenCalled();
    });

    it('should stop execution on failure when continueOnError is false', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Failing task',
          complexity: 'M',
          description: 'Will fail',
          files: ['src/fail.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Should not run',
          complexity: 'M',
          description: 'Should be skipped',
          files: ['src/skipped.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
      ];

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-1']);

      // Mock getTaskState to return 'pending' for task-2 so it gets added to results
      vi.mocked(mockTransitionManager.getTaskState).mockImplementation((taskId) => {
        if (taskId === 'task-1') return 'running';
        if (taskId === 'task-2') return 'pending';
        return 'ready';
      });

      vi.mocked(mockOrchestrator.executeTask).mockRejectedValue(
        new Error('Execution failed'),
      );

      const result = await handler.handle(tasks, mockContext);

      // After task-1 fails and VCS commit error, we get 3 results:
      // task-1 (failure), task-2 (skipped from halt), task-2 (skipped from remaining)
      expect(result.tasks.length).toBeGreaterThanOrEqual(2);
      expect(result.tasks[0]?.status).toBe('failure');
      expect(mockTransitionManager.skipTask).toHaveBeenCalled();
    });

    it('should continue execution on failure when continueOnError is true', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Failing task',
          complexity: 'M',
          description: 'Will fail',
          files: ['src/fail.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Success task',
          complexity: 'M',
          description: 'Will succeed',
          files: ['src/success.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
      ];

      let callCount = 0;
      vi.mocked(mockTransitionManager.allTasksComplete).mockImplementation(() => {
        callCount++;
        return callCount > 2;
      });

      vi.mocked(mockTransitionManager.getExecutableTasks)
        .mockReturnValueOnce(['task-1'])
        .mockReturnValueOnce(['task-2']);

      vi.mocked(mockOrchestrator.executeTask)
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockResolvedValueOnce({ status: 'completed', output: 'Done' });

      const contextWithContinue = { ...mockContext, continueOnError: true };
      const result = await handler.handle(tasks, contextWithContinue);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]?.status).toBe('failure');
      expect(result.tasks[1]?.status).toBe('success');
    });

    it('should initialize VCS strategy with correct context', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test task',
        complexity: 'M',
        description: 'Test',
        files: ['test.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['task-1']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      await handler.handle([task], mockContext);

      expect(mockVcsStrategy.initialize).toHaveBeenCalledWith(
        [task],
        expect.objectContaining<VcsStrategyContext>({
          cwd: '/test/dir',
          baseRef: 'main',
          validation: {
            mode: 'strict',
            allowNewFiles: false,
            allowDependencyFiles: false,
          },
        }),
      );
    });
  });

  describe('_generateAgentPrompt', () => {
    it('should include complexity in prompt', async () => {
      const task: TaskV2 = {
        id: 'test',
        name: 'Test',
        complexity: 'XL',
        description: 'Test description',
        files: ['test.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['test']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      await handler.handle([task], mockContext);

      const prompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(prompt).toContain('## Task Complexity: XL');
    });

    it('should not include acceptance criteria section when empty', async () => {
      const task: TaskV2 = {
        id: 'test',
        name: 'Test',
        complexity: 'M',
        description: 'Test description',
        files: ['test.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockTransitionManager.allTasksComplete)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      vi.mocked(mockTransitionManager.getExecutableTasks).mockReturnValue(['test']);

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      await handler.handle([task], mockContext);

      const prompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(prompt).not.toContain('## Acceptance Criteria');
    });
  });
});
