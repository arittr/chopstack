import { vi } from 'vitest';

import type { DecomposerAgent, Plan } from '@/types/decomposer';

import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { DagValidator } from '@/validation/dag-validator';

describe('plan-generator integration tests', () => {
  const mockValidPlan: Plan = {
    tasks: [
      {
        id: 'create-auth',
        title: 'Create Authentication Module',
        description: 'Build user authentication with JWT',
        touches: [],
        produces: ['src/auth/AuthService.ts', 'src/auth/types.ts'],
        requires: [],
        estimatedLines: 80,
        agentPrompt: 'Create a complete authentication service with JWT tokens',
      },
      {
        id: 'create-middleware',
        title: 'Create Auth Middleware',
        description: 'Add authentication middleware for protected routes',
        touches: ['src/app.ts'],
        produces: ['src/middleware/auth.ts'],
        requires: ['create-auth'],
        estimatedLines: 35,
        agentPrompt: 'Create Express middleware to protect authenticated routes',
      },
    ],
  };

  const mockConflictingPlan: Plan = {
    tasks: [
      {
        id: 'task-a',
        title: 'Task A',
        description: 'First concurrent task',
        touches: ['shared-file.ts'],
        produces: [],
        requires: [],
        estimatedLines: 20,
        agentPrompt: 'Modify shared file in first way',
      },
      {
        id: 'task-b',
        title: 'Task B',
        description: 'Second concurrent task',
        touches: ['shared-file.ts'], // File conflict - both tasks modify same file
        produces: [],
        requires: [], // No dependency = can run in parallel = conflict
        estimatedLines: 25,
        agentPrompt: 'Modify shared file in different way',
      },
    ],
  };

  const mockCircularPlan: Plan = {
    tasks: [
      {
        id: 'task-x',
        title: 'Task X',
        description: 'First task with circular dependency',
        touches: ['file-x.ts'],
        produces: [],
        requires: ['task-y'], // X requires Y
        estimatedLines: 15,
        agentPrompt: 'Do task X',
      },
      {
        id: 'task-y',
        title: 'Task Y',
        description: 'Second task with circular dependency',
        touches: ['file-y.ts'],
        produces: [],
        requires: ['task-x'], // Y requires X = circular
        estimatedLines: 18,
        agentPrompt: 'Do task Y',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful plan generation', () => {
    it('should generate valid plan on first attempt using real DagValidator', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(mockValidPlan),
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Auth System\n\nBuild authentication with middleware',
        '/test/project',
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.plan).toEqual(mockValidPlan);
      expect(result.conflicts).toEqual([]);

      // Verify real validation was called
      expect(mockAgent.decompose).toHaveBeenCalledTimes(1);
      expect(mockAgent.decompose).toHaveBeenCalledWith(
        '# Auth System\n\nBuild authentication with middleware',
        '/test/project',
        { verbose: false },
      );
    });

    it('should calculate real metrics for valid plan', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(mockValidPlan),
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Auth System\n\nBuild authentication with middleware',
        '/test/project',
      );

      expect(result.success).toBe(true);

      // Verify we can calculate real metrics on the result
      const metrics = DagValidator.calculateMetrics(result.plan);
      expect(metrics.taskCount).toBe(2);
      expect(metrics.totalEstimatedLines).toBe(115); // 80 + 35
      expect(metrics.executionLayers).toBe(2); // Sequential dependency
      expect(metrics.maxParallelization).toBe(1); // One task depends on the other
    });
  });

  describe('conflict detection and retry logic', () => {
    it('should detect file conflicts using real DagValidator and retry', async () => {
      let callCount = 0;
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockConflictingPlan; // First call: conflicting plan
          }
          return mockValidPlan; // Second call: fixed plan
        }),
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Conflicting Tasks\n\nTasks that modify the same file',
        '/test/project',
        { maxRetries: 3, verbose: false },
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toContain('shared-file.ts');

      // Verify retry was called with enhanced prompt
      expect(mockAgent.decompose).toHaveBeenCalledTimes(2);

      const secondCallArgs = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(secondCallArgs?.[0]).toContain('IMPORTANT RETRY INSTRUCTIONS');
      expect(secondCallArgs?.[0]).toContain('file conflicts');
    });

    it('should detect circular dependencies using real DagValidator', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(mockCircularPlan),
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Circular Dependencies\n\nTasks with circular deps',
        '/test/project',
        { maxRetries: 2 },
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);

      // Verify validation caught the circular dependency
      const validation = DagValidator.validatePlan(result.plan);
      expect(validation.valid).toBe(false);
      expect(validation.circularDependencies).toBeDefined();
      expect(validation.circularDependencies?.length).toBeGreaterThan(0);
    });

    it('should build enhanced prompts with real conflict information', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi
          .fn()
          .mockResolvedValueOnce(mockConflictingPlan) // First: conflicts
          .mockResolvedValueOnce(mockCircularPlan) // Second: circular deps
          .mockResolvedValueOnce(mockValidPlan), // Third: success
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Complex Conflicts\n\nMultiple conflict types',
        '/test/project',
        { maxRetries: 5, verbose: false },
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.conflicts).toHaveLength(1); // Only file conflicts tracked

      // Check enhanced prompts were built correctly
      const thirdCallArgs = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock.calls[2];
      expect(thirdCallArgs?.[0]).toContain('IMPORTANT RETRY INSTRUCTIONS');
      expect(thirdCallArgs?.[0]).toContain('shared-file.ts');
    });
  });

  describe('error handling', () => {
    it('should handle agent failures properly', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockRejectedValue(new Error('Agent API timeout')),
      };

      await expect(
        generatePlanWithRetry(mockAgent, '# Failing Agent\n\nThis will fail', '/test/project'),
      ).rejects.toThrow('Agent API timeout');

      expect(mockAgent.decompose).toHaveBeenCalledTimes(1);
    });

    it('should handle validation errors properly', async () => {
      // This test ensures our error handling works with real validation
      const malformedPlan = {
        tasks: [
          {
            // Missing required fields to trigger validation error
            id: 'incomplete-task',
            title: 'Incomplete Task',
            // description missing
            // touches missing
            // produces missing
            // requires missing
            // estimatedLines missing
            // agentPrompt missing
          } as any,
        ],
      };

      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(malformedPlan),
      };

      // This should not throw, but should handle validation gracefully
      await generatePlanWithRetry(
        mockAgent,
        '# Malformed Plan\n\nThis will create malformed plan',
        '/test/project',
        { maxRetries: 1 },
      );

      // The result depends on how gracefully our validation handles malformed data
      // This tests the real validation error handling path
      expect(mockAgent.decompose).toHaveBeenCalled();
    });
  });

  describe('options handling', () => {
    it('should pass options correctly to agent', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(mockValidPlan),
      };

      await generatePlanWithRetry(
        mockAgent,
        '# Test Options\n\nTest option passing',
        '/custom/workdir',
        { maxRetries: 5, verbose: true },
      );

      expect(mockAgent.decompose).toHaveBeenCalledWith(
        '# Test Options\n\nTest option passing',
        '/custom/workdir',
        { verbose: true },
      );
    });

    it('should use default options when not provided', async () => {
      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(mockValidPlan),
      };

      await generatePlanWithRetry(
        mockAgent,
        '# Default Options\n\nTest defaults',
        '/default/workdir',
      );

      expect(mockAgent.decompose).toHaveBeenCalledWith(
        '# Default Options\n\nTest defaults',
        '/default/workdir',
        { verbose: false },
      );
    });
  });

  describe('real world scenarios', () => {
    it('should handle large plans with complex dependencies', async () => {
      const largePlan: Plan = {
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i}`,
          title: `Task ${i}`,
          description: `Description for task ${i}`,
          touches: i > 0 ? [`file-${i - 1}.ts`] : [],
          produces: [`file-${i}.ts`],
          requires: i > 0 ? [`task-${i - 1}`] : [],
          estimatedLines: 20 + i * 5,
          agentPrompt: `Create file ${i}`,
        })),
      };

      const mockAgent: DecomposerAgent = {
        decompose: vi.fn().mockResolvedValue(largePlan),
      };

      const result = await generatePlanWithRetry(
        mockAgent,
        '# Large Project\n\nCreate a multi-file project',
        '/test/project',
      );

      expect(result.success).toBe(true);
      expect(result.plan.tasks).toHaveLength(10);

      // Verify real metrics calculation works with large plans
      const metrics = DagValidator.calculateMetrics(result.plan);
      expect(metrics.taskCount).toBe(10);
      expect(metrics.executionLayers).toBe(10); // Sequential chain
      expect(metrics.maxParallelization).toBe(1); // Sequential
      expect(metrics.totalEstimatedLines).toBe(425); // Sum of all estimated lines
    });
  });
});
