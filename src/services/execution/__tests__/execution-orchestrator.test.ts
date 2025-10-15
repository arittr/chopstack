import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionOptions } from '@/core/execution/types';
import type { PlanV2, TaskV2 } from '@/types/schemas-v2';

import {
  ExecutionOrchestrator,
  type ExecutionOrchestratorDependencies,
} from '../execution-orchestrator';

describe('ExecutionOrchestrator', () => {
  let orchestrator: ExecutionOrchestrator;
  let mockTaskOrchestrator: any;
  let mockVcsEngine: any;

  beforeEach(() => {
    // Create mock task orchestrator
    mockTaskOrchestrator = new EventEmitter();
    mockTaskOrchestrator.executeTasks = vi.fn().mockResolvedValue({
      tasks: [],
      totalDuration: 0,
      branches: [],
      commits: [],
    });

    // Create mock VCS engine
    mockVcsEngine = {
      ensureCleanWorkingDirectory: vi.fn().mockResolvedValue(undefined),
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      createBranch: vi.fn().mockResolvedValue(undefined),
      checkoutBranch: vi.fn().mockResolvedValue(undefined),
      commitChanges: vi.fn().mockResolvedValue('abc123'),
    };

    const dependencies: ExecutionOrchestratorDependencies = {
      taskOrchestrator: mockTaskOrchestrator,
      vcsEngine: mockVcsEngine,
    };

    orchestrator = new ExecutionOrchestrator(dependencies);
  });

  describe('execute', () => {
    it('should execute a plan successfully', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        description: 'A test plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'Test task description that is long enough to meet minimum requirements',
            files: ['file1.ts'],
            acceptanceCriteria: ['Criterion 1'],
            dependencies: [],
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        workdir: '/test/dir',
        verbose: false,
        vcsMode: 'simple',
      };

      const result = await orchestrator.execute(plan, options);

      expect(result).toBeDefined();
      expect(result.tasks).toBeInstanceOf(Array);
    });

    it('should emit executionStart event', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'S',
            description: 'Test task description that is long enough to meet minimum requirements',
            files: ['file1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        vcsMode: 'simple',
      };

      const eventPromise = new Promise((resolve) => {
        orchestrator.once('executionStart', resolve);
      });

      // Start execution (don't await to allow event to fire)
      orchestrator.execute(plan, options).catch(() => {
        // Ignore errors for this test
      });

      const event = await eventPromise;
      expect(event).toBeDefined();
      expect((event as any).plan).toBe(plan);
      expect((event as any).options).toBe(options);
    });

    it('should handle execution errors', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'L',
            description: 'Test task description that is long enough to meet minimum requirements',
            files: ['file1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        vcsMode: 'simple',
      };

      // Force an error by making the task orchestrator throw
      mockTaskOrchestrator.executeTasks.mockRejectedValue(new Error('Test error'));

      await expect(orchestrator.execute(plan, options)).rejects.toThrow();
    });
  });

  describe('type compatibility', () => {
    it('should accept PlanV2 with all required fields', () => {
      const plan: PlanV2 = {
        name: 'Complete Plan',
        description: 'A complete plan with all fields',
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            strategy: 'sequential',
            tasks: ['task-1'],
            requires: [],
          },
        ],
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'Test task description that is long enough to meet minimum requirements',
            files: ['file1.ts', 'file2.ts'],
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            dependencies: [],
            phase: 'phase-1',
          },
        ],
        successMetrics: {
          quantitative: ['Metric 1'],
          qualitative: ['Quality 1'],
        },
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        vcsMode: 'simple',
      };

      // Should not throw type errors
      expect(() => {
        orchestrator.execute(plan, options);
      }).not.toThrow();
    });

    it('should accept TaskV2 with v2 field names', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Task Name', // v2 uses 'name' instead of 'title'
        complexity: 'M', // v2 uses 'complexity' instead of 'estimatedLines'
        description: 'Task description that is long enough to meet minimum requirements',
        files: ['file1.ts'], // v2 uses 'files' instead of 'touches'/'produces'
        acceptanceCriteria: ['Criterion'], // v2 has acceptance criteria
        dependencies: [], // v2 uses 'dependencies' instead of 'requires'
      };

      // Should compile without errors
      expect(task.name).toBe('Task Name');
      expect(task.files).toEqual(['file1.ts']);
      expect(task.dependencies).toEqual([]);
    });
  });
});
