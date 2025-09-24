import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { vi } from 'vitest';

import type { DecomposeOptions, DecomposerAgent } from '@/types/decomposer';

import { createDecomposerAgent } from '@/agents';
import { DagValidator } from '@/utils/dag-validator';
import { generatePlanWithRetry } from '@/utils/plan-generator';
import { PlanOutputter } from '@/utils/plan-outputter';

import { decomposeCommand } from '../decompose';

// Mock external dependencies
vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('../../agents');
vi.mock('../../utils/dag-validator');
vi.mock('../../utils/plan-generator');
vi.mock('../../utils/plan-outputter');

const mockReadFile = vi.mocked(readFile);
const mockResolve = vi.mocked(resolve);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);
const mockGeneratePlanWithRetry = vi.mocked(generatePlanWithRetry);
const mockDagValidator = vi.mocked(DagValidator);
const mockPlanOutputter = vi.mocked(PlanOutputter);

// Spy on console methods (these are needed for proper test isolation)
// eslint-disable-next-line @typescript-eslint/naming-convention
const _mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
// eslint-disable-next-line @typescript-eslint/naming-convention
const _mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('decomposeCommand', () => {
  const mockPlan = {
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        touches: ['file.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      },
    ],
  };

  const mockAgent: DecomposerAgent = {
    decompose: vi.fn().mockResolvedValue(mockPlan),
  };

  const mockOptions: DecomposeOptions = {
    spec: 'test-spec.md',
    agent: 'claude',
    output: 'test-output.yaml',
    verbose: false,
  };

  const mockMetrics = {
    taskCount: 1,
    totalEstimatedLines: 10,
    maxParallelization: 1,
    executionLayers: 1,
    criticalPathLength: 10,
    estimatedSpeedup: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks
    mockResolve.mockReturnValue('/resolved/path/test-spec.md');
    mockReadFile.mockResolvedValue('# Test Specification\n\nThis is a test spec.');
    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);
    mockGeneratePlanWithRetry.mockResolvedValue({
      plan: mockPlan,
      success: true,
      attempts: 1,
      conflicts: [],
    });
    mockDagValidator.calculateMetrics.mockReturnValue(mockMetrics);
    mockDagValidator.validatePlan.mockReturnValue({
      valid: true,
      errors: [],
    });
    mockPlanOutputter.outputPlan.mockResolvedValue();
    mockPlanOutputter.logMetrics.mockImplementation(() => {});

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful execution', () => {
    it('should successfully decompose a specification', async () => {
      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(0);
      expect(mockResolve).toHaveBeenCalledWith('test-spec.md');
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/path/test-spec.md', 'utf8');
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        '# Test Specification\n\nThis is a test spec.',
        '/test/cwd',
        {
          maxRetries: 3,
          verbose: false,
        },
      );
      expect(mockDagValidator.calculateMetrics).toHaveBeenCalledWith(mockPlan);
      expect(mockPlanOutputter.outputPlan).toHaveBeenCalledWith(
        mockPlan,
        mockMetrics,
        'test-output.yaml',
      );
    });

    it('should pass verbose flag to dependencies when verbose is enabled', async () => {
      const verboseOptions = { ...mockOptions, verbose: true };

      const result = await decomposeCommand(verboseOptions);

      expect(result).toBe(0);
      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        '# Test Specification\n\nThis is a test spec.',
        '/test/cwd',
        {
          maxRetries: 3,
          verbose: true,
        },
      );
      expect(mockPlanOutputter.logMetrics).toHaveBeenCalledWith(mockMetrics);
    });

    it('should use default verbose: false when not specified', async () => {
      const optionsWithoutVerbose = { ...mockOptions };
      delete optionsWithoutVerbose.verbose;

      await decomposeCommand(optionsWithoutVerbose);

      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        '# Test Specification\n\nThis is a test spec.',
        '/test/cwd',
        {
          maxRetries: 3,
          verbose: false,
        },
      );
    });
  });

  describe('validation failure handling', () => {
    it('should return error code 1 when validation fails', async () => {
      mockGeneratePlanWithRetry.mockResolvedValue({
        plan: mockPlan,
        success: false,
        attempts: 3,
        conflicts: ['file1.ts', 'file2.ts'],
      });

      mockDagValidator.validatePlan.mockReturnValue({
        valid: false,
        errors: ['Error 1', 'Error 2'],
        conflicts: ['file1.ts', 'file2.ts'],
        circularDependencies: ['task-a -> task-b -> task-a'],
      });

      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(1);
      expect(mockDagValidator.validatePlan).toHaveBeenCalledWith(mockPlan);
    });

    it('should still output plan even when validation fails', async () => {
      mockGeneratePlanWithRetry.mockResolvedValue({
        plan: mockPlan,
        success: false,
        attempts: 3,
        conflicts: ['file1.ts', 'file2.ts'],
      });

      await decomposeCommand(mockOptions);

      // Plan should still be output even with validation failure
      expect(mockPlanOutputter.outputPlan).toHaveBeenCalledWith(
        mockPlan,
        mockMetrics,
        'test-output.yaml',
      );
    });
  });

  describe('error handling', () => {
    it('should return error code 1 for file reading errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(1);
    });

    it('should return error code 1 for agent creation errors', async () => {
      mockCreateDecomposerAgent.mockRejectedValue(new Error('Invalid agent'));

      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(1);
    });

    it('should return error code 1 for plan generation errors', async () => {
      mockGeneratePlanWithRetry.mockRejectedValue(new Error('Plan generation failed'));

      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(1);
    });

    it('should handle unknown errors gracefully', async () => {
      mockReadFile.mockRejectedValue('String error'); // Non-Error object

      const result = await decomposeCommand(mockOptions);

      expect(result).toBe(1);
    });
  });

  describe('integration with dependencies', () => {
    it('should call dependencies with correct parameters', async () => {
      await decomposeCommand(mockOptions);

      expect(mockResolve).toHaveBeenCalledWith('test-spec.md');
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/path/test-spec.md', 'utf8');
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      expect(mockDagValidator.calculateMetrics).toHaveBeenCalledWith(mockPlan);
      expect(mockPlanOutputter.outputPlan).toHaveBeenCalledWith(
        mockPlan,
        mockMetrics,
        'test-output.yaml',
      );
    });

    it('should validate the plan after generation', async () => {
      mockGeneratePlanWithRetry.mockResolvedValue({
        plan: mockPlan,
        success: false,
        attempts: 1,
        conflicts: [],
      });

      await decomposeCommand(mockOptions);

      expect(mockDagValidator.validatePlan).toHaveBeenCalledWith(mockPlan);
    });
  });
});
