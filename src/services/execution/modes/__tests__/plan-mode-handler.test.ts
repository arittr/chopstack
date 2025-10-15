import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { OrchestratorTaskResult, TaskOrchestrator } from '@/services/orchestration';
import type { TaskV2 } from '@/types/schemas-v2';

import { PlanModeHandlerImpl } from '../plan-mode-handler';

describe('PlanModeHandlerImpl', () => {
  let mockOrchestrator: TaskOrchestrator;
  let handler: PlanModeHandlerImpl;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockOrchestrator = {
      executeTask: vi.fn(),
    } as unknown as TaskOrchestrator;

    handler = new PlanModeHandlerImpl(mockOrchestrator);

    mockContext = {
      cwd: '/test/dir',
      agentType: 'claude',
      vcsMode: 'simple',
      continueOnError: false,
      maxRetries: 0,
      permissiveValidation: false,
      dryRun: false,
      verbose: false,
    };
  });

  describe('handle', () => {
    it('should execute single task successfully', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Create types',
        complexity: 'M',
        description: 'Create TypeScript type definitions',
        files: ['src/types/theme.ts'],
        acceptanceCriteria: ['Types exported', 'Context defined'],
        dependencies: [],
      };

      const mockResult: OrchestratorTaskResult = {
        status: 'completed',
        output: 'Task completed',
        mode: 'plan',
        taskId: 'task-1',
      };

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue(mockResult);

      const result = await handler.handle([task], mockContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({
        taskId: 'task-1',
        status: 'success',
        output: 'Task completed',
      });
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.skippedCount).toBe(0);

      // Verify orchestrator was called with correct parameters including generated prompt
      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task-1',
        'Create types',
        expect.stringContaining('Create TypeScript type definitions'),
        ['src/types/theme.ts'],
        '/test/dir',
        'plan',
        'claude',
      );

      // Verify generated prompt includes acceptance criteria
      const calledPrompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(calledPrompt).toContain('## Acceptance Criteria');
      expect(calledPrompt).toContain('- Types exported');
      expect(calledPrompt).toContain('- Context defined');
      expect(calledPrompt).toContain('## Task Complexity: M');
    });

    it('should execute multiple tasks successfully', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Create types',
          complexity: 'S',
          description: 'Create types',
          files: ['src/types/theme.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Create context',
          complexity: 'M',
          description: 'Create context',
          files: ['src/context/ThemeContext.tsx'],
          acceptanceCriteria: [],
          dependencies: ['task-1'],
        },
      ];

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
        mode: 'plan',
        taskId: 'task-1',
      });

      const result = await handler.handle(tasks, mockContext);

      expect(result.tasks).toHaveLength(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);
    });

    it('should handle task failure', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Failing task',
        complexity: 'L',
        description: 'This will fail',
        files: ['src/broken.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'failed',
        mode: 'plan',
        taskId: 'task-1',
      });

      const result = await handler.handle([task], mockContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]?.status).toBe('failure');
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
    });

    it('should handle exceptions during task execution', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Exception task',
        complexity: 'M',
        description: 'Will throw',
        files: ['src/error.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockOrchestrator.executeTask).mockRejectedValue(new Error('Orchestrator failed'));

      const result = await handler.handle([task], mockContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({
        taskId: 'task-1',
        status: 'failure',
        error: 'Orchestrator failed',
      });
      expect(result.failureCount).toBe(1);
    });

    it('should stop on first failure when continueOnError is false', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'First task',
          complexity: 'M',
          description: 'Will fail',
          files: ['src/first.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Second task',
          complexity: 'M',
          description: 'Should not run',
          files: ['src/second.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
      ];

      vi.mocked(mockOrchestrator.executeTask).mockRejectedValue(new Error('Task failed'));

      const result = await handler.handle(tasks, mockContext);

      expect(result.tasks).toHaveLength(1);
      expect(result.failureCount).toBe(1);
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(1);
    });

    it('should continue executing tasks when continueOnError is true', async () => {
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

      vi.mocked(mockOrchestrator.executeTask)
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockResolvedValueOnce({
          status: 'completed',
          output: 'Done',
          mode: 'plan',
          taskId: 'task-2',
        });

      const contextWithContinue = { ...mockContext, continueOnError: true };
      const result = await handler.handle(tasks, contextWithContinue);

      expect(result.tasks).toHaveLength(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(mockOrchestrator.executeTask).toHaveBeenCalledTimes(2);
    });

    it('should generate prompt without acceptance criteria when not provided', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Simple task',
        complexity: 'S',
        description: 'Simple description',
        files: ['src/simple.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
        mode: 'plan',
        taskId: 'task-1',
      });

      await handler.handle([task], mockContext);

      const calledPrompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(calledPrompt).toContain('Simple description');
      expect(calledPrompt).not.toContain('## Acceptance Criteria');
      expect(calledPrompt).toContain('## Task Complexity: S');
    });

    it('should track duration for each task', async () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Timed task',
        complexity: 'M',
        description: 'Task with timing',
        files: ['src/timed.ts'],
        acceptanceCriteria: [],
        dependencies: [],
      };

      vi.mocked(mockOrchestrator.executeTask).mockImplementation(
        async () =>
          new Promise((resolve) => {
            globalThis.setTimeout(() => {
              resolve({
                status: 'completed',
                output: 'Done',
                mode: 'plan',
                taskId: 'task-1',
              });
            }, 10);
          }),
      );

      const result = await handler.handle([task], mockContext);

      expect(result.tasks[0]?.duration).toBeGreaterThan(0);
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should handle task with v2 fields correctly', async () => {
      const task: TaskV2 = {
        id: 'task-v2',
        name: 'V2 Task Name',
        complexity: 'XL',
        description: 'Detailed v2 task description',
        files: ['src/file1.ts', 'src/file2.ts'],
        acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'],
        dependencies: ['other-task'],
        phase: 'phase-1',
      };

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Success',
        mode: 'plan',
        taskId: 'task-v2',
      });

      await handler.handle([task], mockContext);

      // Verify all v2 fields are used correctly
      expect(mockOrchestrator.executeTask).toHaveBeenCalledWith(
        'task-v2',
        'V2 Task Name', // name field
        expect.stringContaining('Detailed v2 task description'),
        ['src/file1.ts', 'src/file2.ts'], // files field
        '/test/dir',
        'plan',
        'claude',
      );

      const calledPrompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(calledPrompt).toContain('- Criterion 1');
      expect(calledPrompt).toContain('- Criterion 2');
      expect(calledPrompt).toContain('- Criterion 3');
      expect(calledPrompt).toContain('## Task Complexity: XL');
    });
  });

  describe('_generateAgentPrompt', () => {
    it('should include all acceptance criteria in prompt', async () => {
      const task: TaskV2 = {
        id: 'test',
        name: 'Test',
        complexity: 'M',
        description: 'Base description',
        files: ['test.ts'],
        acceptanceCriteria: ['AC1', 'AC2', 'AC3'],
        dependencies: [],
      };

      vi.mocked(mockOrchestrator.executeTask).mockResolvedValue({
        status: 'completed',
        output: 'Done',
        mode: 'plan',
        taskId: 'test',
      });

      await handler.handle([task], mockContext);

      const prompt = vi.mocked(mockOrchestrator.executeTask).mock.calls[0]?.[2];
      expect(prompt).toContain('Base description');
      expect(prompt).toContain('## Acceptance Criteria');
      expect(prompt).toContain('- AC1');
      expect(prompt).toContain('- AC2');
      expect(prompt).toContain('- AC3');
      expect(prompt).toContain('## Task Complexity: M');
    });
  });
});
