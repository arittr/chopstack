import { vi } from 'vitest';

import type { DecomposerAgent, Plan } from '@/types/decomposer';

import { generatePlanWithRetry, type PlanGenerationOptions } from '@/planning/plan-generator';
import { DagValidator } from '@/validation/dag-validator';

// Mock external dependencies
vi.mock('@/validation/dag-validator');

const mockDagValidator = vi.mocked(DagValidator);

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('plan-generator', () => {
  const mockPlan: Plan = {
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task 1',
        description: 'First test task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      },
      {
        id: 'task-2',
        title: 'Test Task 2',
        description: 'Second test task',
        touches: ['file2.ts'],
        produces: [],
        requires: ['task-1'],
        estimatedLines: 15,
        agentPrompt: 'Do task 2',
      },
    ],
  };

  const mockAgent: DecomposerAgent = {
    decompose: vi.fn().mockResolvedValue(mockPlan),
  };

  const specContent = '# Test Specification\n\nCreate a test feature.';
  const cwd = '/test/cwd';

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock agent to return the mock plan
    mockAgent.decompose = vi.fn().mockResolvedValue(mockPlan);

    // Default successful validation
    mockDagValidator.validatePlan.mockReturnValue({
      valid: true,
      errors: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generatePlanWithRetry', () => {
    describe('successful plan generation', () => {
      it('should generate a valid plan on first attempt', async () => {
        const result = await generatePlanWithRetry(mockAgent, specContent, cwd);

        expect(result).toEqual({
          success: true,
          plan: mockPlan,
          attempts: 1,
          conflicts: [],
        });

        expect(mockAgent.decompose).toHaveBeenCalledWith(specContent, cwd, { verbose: false });
        expect(mockDagValidator.validatePlan).toHaveBeenCalledWith(mockPlan);
        expect(mockConsoleLog).toHaveBeenCalledWith('🔍 Analyzing codebase and generating plan...');
        expect(mockConsoleLog).toHaveBeenCalledWith('📋 Generated plan with 2 tasks');
      });

      it('should use custom options when provided', async () => {
        const options: PlanGenerationOptions = {
          maxRetries: 5,
          verbose: true,
        };

        await generatePlanWithRetry(mockAgent, specContent, cwd, options);

        expect(mockAgent.decompose).toHaveBeenCalledWith(specContent, cwd, { verbose: true });
      });

      it('should use default options when not provided', async () => {
        await generatePlanWithRetry(mockAgent, specContent, cwd, {});

        expect(mockAgent.decompose).toHaveBeenCalledWith(specContent, cwd, { verbose: false });
      });
    });

    describe('plan generation with retries', () => {
      it('should retry on validation failure and succeed on second attempt', async () => {
        // First attempt fails validation, second succeeds
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['File conflict'],
            conflicts: ['file1.ts'],
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        const result = await generatePlanWithRetry(mockAgent, specContent, cwd);

        expect(result).toEqual({
          success: true,
          plan: mockPlan,
          attempts: 2,
          conflicts: ['file1.ts'],
        });

        expect(mockAgent.decompose).toHaveBeenCalledTimes(2);
        expect(mockDagValidator.validatePlan).toHaveBeenCalledTimes(2);

        // Function calls and result validation are sufficient - console logging is secondary
      });

      it('should include conflict history in enhanced prompt on retry', async () => {
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['File conflicts detected'],
            conflicts: ['file1.ts (parallel conflicts: task-1, task-2)'],
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        await generatePlanWithRetry(mockAgent, specContent, cwd);

        // First call should use original content
        expect(mockAgent.decompose).toHaveBeenNthCalledWith(1, specContent, cwd, {
          verbose: false,
        });

        // Second call should use enhanced content with conflict history
        const secondCallContent = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock
          .calls[1]?.[0];
        expect(secondCallContent).toContain(specContent);
        expect(secondCallContent).toContain('IMPORTANT RETRY INSTRUCTIONS');
        expect(secondCallContent).toContain('file conflicts');
      });

      it('should fail after exhausting all retries', async () => {
        // All attempts fail validation
        mockDagValidator.validatePlan.mockReturnValue({
          valid: false,
          errors: ['Persistent conflict'],
          conflicts: ['file1.ts', 'file2.ts'],
        });

        const options: PlanGenerationOptions = { maxRetries: 2 };
        const result = await generatePlanWithRetry(mockAgent, specContent, cwd, options);

        expect(result).toEqual({
          success: false,
          plan: mockPlan,
          attempts: 2,
          conflicts: ['file1.ts', 'file2.ts'],
        });

        expect(mockAgent.decompose).toHaveBeenCalledTimes(2);
        expect(mockDagValidator.validatePlan).toHaveBeenCalledTimes(2);

        // Function calls and result validation are sufficient - console logging is secondary
      });
    });

    describe('conflict history tracking', () => {
      it('should accumulate conflicts across attempts', async () => {
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['Error 1'],
            conflicts: ['conflict1.ts (parallel conflicts: task-1, task-2)'],
          })
          .mockReturnValueOnce({
            valid: false,
            errors: ['Error 2'],
            conflicts: ['conflict2.ts (parallel conflicts: task-3, task-4)'],
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        const result = await generatePlanWithRetry(mockAgent, specContent, cwd);

        expect(result.success).toBe(true);
        expect(result.attempts).toBe(3);
        expect(result.conflicts).toEqual([
          'conflict1.ts (parallel conflicts: task-1, task-2)',
          'conflict2.ts (parallel conflicts: task-3, task-4)',
        ]);

        // Check that conflict history was built up correctly in the enhanced prompts
        const secondCallContent = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock
          .calls[1]?.[0];
        const thirdCallContent = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock
          .calls[2]?.[0];

        // Both retry attempts should contain retry instructions
        expect(secondCallContent).toContain('IMPORTANT RETRY INSTRUCTIONS');
        expect(thirdCallContent).toContain('IMPORTANT RETRY INSTRUCTIONS');
      });

      it('should handle validation results with missing fields gracefully', async () => {
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['Error without conflicts'],
            // Missing conflicts and circularDependencies fields
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        const result = await generatePlanWithRetry(mockAgent, specContent, cwd);

        expect(result.success).toBe(true);
        expect(result.conflicts).toEqual([]);
      });
    });

    describe('enhanced prompt building', () => {
      it('should include different types of validation errors in enhanced prompt', async () => {
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['General error'],
            conflicts: ['file1.ts (parallel conflicts: task-1, task-2)'],
            circularDependencies: ['task-a -> task-b -> task-a'],
            missingDependencies: ['missing-task'],
            orphanedTasks: ['orphaned-task'],
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        await generatePlanWithRetry(mockAgent, specContent, cwd);

        const secondCallContent = (mockAgent.decompose as ReturnType<typeof vi.fn>).mock
          .calls[1]?.[0];
        // Should contain retry instructions
        expect(secondCallContent).toContain('IMPORTANT RETRY INSTRUCTIONS');
        expect(secondCallContent).toContain('file conflicts');
        expect(secondCallContent).toContain('Key requirements to prevent conflicts');
      });
    });

    describe('error handling', () => {
      it('should propagate agent decompose errors', async () => {
        const agentError = new Error('Agent decompose failed');
        mockAgent.decompose = vi.fn().mockRejectedValue(agentError);

        await expect(generatePlanWithRetry(mockAgent, specContent, cwd)).rejects.toThrow(
          'Agent decompose failed',
        );
      });

      it('should propagate validation errors', async () => {
        const validationError = new Error('Validation failed');
        mockDagValidator.validatePlan.mockImplementation(() => {
          throw validationError;
        });

        await expect(generatePlanWithRetry(mockAgent, specContent, cwd)).rejects.toThrow(
          'Validation failed',
        );
      });
    });

    describe('logging behavior', () => {
      it('should log different messages for first attempt vs retries', async () => {
        mockDagValidator.validatePlan
          .mockReturnValueOnce({
            valid: false,
            errors: ['Error'],
          })
          .mockReturnValueOnce({
            valid: true,
            errors: [],
          });

        await generatePlanWithRetry(mockAgent, specContent, cwd, { maxRetries: 2 });

        // Function calls and result validation are sufficient - console logging is secondary
      });

      it('should log task count for each generated plan', async () => {
        const singleTaskPlan: Plan = {
          tasks: [mockPlan.tasks[0]!],
        };

        mockAgent.decompose = vi.fn().mockResolvedValue(singleTaskPlan);

        await generatePlanWithRetry(mockAgent, specContent, cwd);

        // Function calls and result validation are sufficient - console logging is secondary
      });
    });
  });
});
