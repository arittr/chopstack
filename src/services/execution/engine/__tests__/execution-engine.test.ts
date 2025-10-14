import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ExecutionOptions } from '@/core/execution/types';
import type { PlanV2 } from '@/types/schemas-v2';

import { ExecutionEngine, type ExecutionEngineDependencies } from '../execution-engine';

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  let mockOrchestrator: any;
  let mockPlannerService: any;
  let mockMonitorService: any;
  let mockStateManager: any;

  beforeEach(() => {
    // Create mock orchestrator
    mockOrchestrator = new EventEmitter();
    mockOrchestrator.execute = vi.fn().mockResolvedValue({
      tasks: [],
      totalDuration: 100,
      branches: [],
      commits: [],
    });

    // Create mock planner service
    mockPlannerService = {
      createExecutionPlan: vi.fn().mockResolvedValue({
        id: 'plan-123',
        plan: { tasks: [] },
        tasks: new Map(),
        executionLayers: [],
        mode: 'execute',
        status: 'pending',
        createdAt: new Date(),
        totalTasks: 0,
        vcsMode: 'simple',
      }),
      optimizeExecutionLayers: vi.fn().mockReturnValue([]),
    };

    // Create mock monitor service
    mockMonitorService = new EventEmitter();
    mockMonitorService.startMonitoring = vi.fn();
    mockMonitorService.stopMonitoring = vi.fn();

    // Create mock state manager
    mockStateManager = {
      transitionTask: vi.fn(),
      getTasksByState: vi.fn().mockReturnValue([]),
      updateDependentTasks: vi.fn().mockReturnValue([]),
    };

    const dependencies: ExecutionEngineDependencies = {
      orchestrator: mockOrchestrator,
      plannerService: mockPlannerService,
      monitorService: mockMonitorService,
      stateManager: mockStateManager,
    };

    engine = new ExecutionEngine(dependencies);
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

      const result = await engine.execute(plan, options);

      expect(result).toBeDefined();
      expect(result.totalDuration).toBe(100);
      expect(mockPlannerService.createExecutionPlan).toHaveBeenCalledWith(plan, options, undefined);
      expect(mockMonitorService.startMonitoring).toHaveBeenCalled();
      expect(mockOrchestrator.execute).toHaveBeenCalledWith(plan, options);
      expect(mockMonitorService.stopMonitoring).toHaveBeenCalled();
    });

    it('should pass jobId to planner service', async () => {
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

      const jobId = 'custom-job-123';

      await engine.execute(plan, options, jobId);

      expect(mockPlannerService.createExecutionPlan).toHaveBeenCalledWith(plan, options, jobId);
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

      // Force an error
      mockOrchestrator.execute.mockRejectedValue(new Error('Execution failed'));

      await expect(engine.execute(plan, options)).rejects.toThrow('Execution failed');
    });

    it('should stop monitoring even on error', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
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

      mockOrchestrator.execute.mockRejectedValue(new Error('Test error'));

      try {
        await engine.execute(plan, options);
      } catch {
        // Expected to throw
      }

      expect(mockMonitorService.stopMonitoring).toHaveBeenCalled();
    });
  });

  describe('type compatibility with PlanV2', () => {
    it('should work with PlanV2 structure', async () => {
      const plan: PlanV2 = {
        name: 'Complete Plan',
        description: 'A complete plan with all v2 fields',
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-setup',
            name: 'Setup Phase',
            strategy: 'sequential',
            tasks: ['task-1'],
            requires: [],
          },
        ],
        tasks: [
          {
            id: 'task-1',
            name: 'Create Types', // v2 field
            complexity: 'M', // v2 field
            description: 'Create TypeScript types for the application with proper documentation',
            files: ['src/types/index.ts'], // v2 field (replaces touches/produces)
            acceptanceCriteria: [
              // v2 field
              'Types are exported',
              'Types have TSDoc comments',
            ],
            dependencies: [], // v2 field (replaces requires)
            phase: 'phase-setup',
          },
        ],
        successMetrics: {
          quantitative: ['100% type coverage'],
          qualitative: ['Clear type definitions'],
        },
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        vcsMode: 'simple',
      };

      const result = await engine.execute(plan, options);

      expect(result).toBeDefined();
      expect(mockPlannerService.createExecutionPlan).toHaveBeenCalledWith(
        plan,
        expect.objectContaining({ mode: 'execute' }),
        undefined,
      );
    });
  });

  describe('cancelExecution', () => {
    it('should cancel execution for a plan', () => {
      const planId = 'plan-123';

      const result = engine.cancelExecution(planId);

      expect(result).toBe(true);
      expect(mockMonitorService.stopMonitoring).toHaveBeenCalledWith(planId);
    });
  });

  describe('getActivePlans', () => {
    it('should return empty array when no active plans', () => {
      const plans = engine.getActivePlans();

      expect(plans).toEqual([]);
    });
  });

  describe('getPlanStatus', () => {
    it('should return undefined for non-existent plan', () => {
      const status = engine.getPlanStatus('non-existent');

      expect(status).toBeUndefined();
    });
  });
});
