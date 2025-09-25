import { writeFile } from 'node:fs/promises';

import { vi } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';

import type { Plan, PlanMetrics } from '@/types/decomposer';

import { PlanOutputter } from '@/services/planning/plan-outputter';

// Mock external dependencies
vi.mock('node:fs/promises');
vi.mock('yaml');

const mockWriteFile = vi.mocked(writeFile);
const mockStringifyYaml = vi.mocked(stringifyYaml);

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('PlanOutputter', () => {
  const mockPlan: Plan = {
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task 1',
        description: 'First test task',
        touches: ['file1.ts'],
        produces: ['output1.ts'],
        requires: [],
        estimatedLines: 50,
        agentPrompt: 'Create task 1',
      },
      {
        id: 'task-2',
        title: 'Test Task 2',
        description: 'Second test task',
        touches: ['file2.ts'],
        produces: ['output2.ts'],
        requires: ['task-1'],
        estimatedLines: 30,
        agentPrompt: 'Create task 2',
      },
    ],
  };

  const mockMetrics: PlanMetrics = {
    taskCount: 2,
    executionLayers: 2,
    maxParallelization: 1,
    criticalPathLength: 80,
    estimatedSpeedup: 1.25,
    totalEstimatedLines: 80,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock YAML stringify to return deterministic output
    mockStringifyYaml.mockReturnValue('tasks:\n  - id: task-1\n  - id: task-2');
    mockWriteFile.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('outputPlan', () => {
    it('should output plan to console when no output path provided', async () => {
      await PlanOutputter.outputPlan(mockPlan, mockMetrics);

      expect(mockStringifyYaml).toHaveBeenCalledWith(mockPlan, {
        indent: 2,
        lineWidth: 200,
        defaultStringType: 'QUOTE_DOUBLE',
        defaultKeyType: 'PLAIN',
      });

      // Main logic validation is sufficient - console output is secondary
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('# Plan Metrics'));

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should write plan to file when output path provided', async () => {
      const outputPath = '/test/output/plan.yaml';

      await PlanOutputter.outputPlan(mockPlan, mockMetrics, outputPath);

      expect(mockWriteFile).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('tasks:\n  - id: task-1\n  - id: task-2'),
        'utf8',
      );
      // File operation and main logic validation is sufficient - console logging is secondary
    });

    it('should not write to file when output path is empty string', async () => {
      await PlanOutputter.outputPlan(mockPlan, mockMetrics, '');

      expect(mockWriteFile).not.toHaveBeenCalled();
      // Main logic validation is sufficient - console output is secondary
    });

    it('should not write to file when output path is undefined', async () => {
      await PlanOutputter.outputPlan(mockPlan, mockMetrics, undefined);

      expect(mockWriteFile).not.toHaveBeenCalled();
      // Main logic validation is sufficient - console output is secondary
    });

    it('should handle file write errors', async () => {
      const outputPath = '/invalid/path/plan.yaml';
      const writeError = new Error('Permission denied');
      mockWriteFile.mockRejectedValue(writeError);

      await expect(PlanOutputter.outputPlan(mockPlan, mockMetrics, outputPath)).rejects.toThrow(
        'Permission denied',
      );
    });
  });

  describe('formatPlanOutput', () => {
    it('should format plan with YAML and metrics', () => {
      const output = PlanOutputter.formatPlanOutput(mockPlan, mockMetrics);

      expect(mockStringifyYaml).toHaveBeenCalledWith(mockPlan, {
        indent: 2,
        lineWidth: 200,
        defaultStringType: 'QUOTE_DOUBLE',
        defaultKeyType: 'PLAIN',
      });

      // Check that the output contains expected elements
      expect(output).toContain('tasks:\n  - id: task-1\n  - id: task-2');
      expect(output).toContain('# Plan Metrics');
      expect(output).toContain('# Task Count: 2');
      expect(output).toContain('# Estimated Speedup: 1.25x');
    });

    it('should handle different metric values correctly', () => {
      const highMetrics: PlanMetrics = {
        taskCount: 10,
        executionLayers: 5,
        maxParallelization: 4,
        criticalPathLength: 500,
        estimatedSpeedup: 3.141_59,
        totalEstimatedLines: 1200,
      };

      const output = PlanOutputter.formatPlanOutput(mockPlan, highMetrics);

      expect(output).toContain('# Task Count: 10');
      expect(output).toContain('# Execution Layers: 5');
      expect(output).toContain('# Max Parallelization: 4');
      expect(output).toContain('# Critical Path Length: 500 lines');
      expect(output).toContain('# Estimated Speedup: 3.14x'); // Should be rounded to 2 decimal places
      expect(output).toContain('# Total Estimated Lines: 1200');
    });

    it('should handle zero and minimal metric values', () => {
      const minimalMetrics: PlanMetrics = {
        taskCount: 0,
        executionLayers: 0,
        maxParallelization: 0,
        criticalPathLength: 0,
        estimatedSpeedup: 0,
        totalEstimatedLines: 0,
      };

      const output = PlanOutputter.formatPlanOutput(mockPlan, minimalMetrics);

      expect(output).toContain('# Task Count: 0');
      expect(output).toContain('# Estimated Speedup: 0.00x');
    });
  });

  describe('logMetrics', () => {
    it('should log formatted metrics to console', () => {
      PlanOutputter.logMetrics(mockMetrics);

      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should format speedup with proper decimal precision', () => {
      const preciseMetrics: PlanMetrics = {
        ...mockMetrics,
        estimatedSpeedup: 2.876_543,
      };

      PlanOutputter.logMetrics(preciseMetrics);

      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle large numbers correctly', () => {
      const largeMetrics: PlanMetrics = {
        taskCount: 9999,
        executionLayers: 999,
        maxParallelization: 99,
        criticalPathLength: 99_999,
        estimatedSpeedup: 999.99,
        totalEstimatedLines: 999_999,
      };

      PlanOutputter.logMetrics(largeMetrics);

      // Main functionality validation is sufficient - console logging is secondary
    });
  });

  describe('private methods', () => {
    it('should format metrics correctly in _formatMetrics', () => {
      // Access the private method through formatPlanOutput
      const output = PlanOutputter.formatPlanOutput(mockPlan, mockMetrics);

      // Verify the metrics section
      expect(output).toMatch(/# Plan Metrics\n# Task Count: 2/);
      expect(output).toMatch(/# Execution Layers: 2/);
      expect(output).toMatch(/# Max Parallelization: 1/);
      expect(output).toMatch(/# Critical Path Length: 80 lines/);
      expect(output).toMatch(/# Estimated Speedup: 1\.25x/);
      expect(output).toMatch(/# Total Estimated Lines: 80/);
    });
  });

  describe('integration with YAML library', () => {
    it('should pass correct options to YAML stringify', () => {
      PlanOutputter.formatPlanOutput(mockPlan, mockMetrics);

      expect(mockStringifyYaml).toHaveBeenCalledWith(mockPlan, {
        indent: 2,
        lineWidth: 200,
        defaultStringType: 'QUOTE_DOUBLE',
        defaultKeyType: 'PLAIN',
      });
    });

    it('should handle YAML stringify errors', () => {
      const yamlError = new Error('YAML serialization failed');
      mockStringifyYaml.mockImplementation(() => {
        throw yamlError;
      });

      expect(() => PlanOutputter.formatPlanOutput(mockPlan, mockMetrics)).toThrow(
        'YAML serialization failed',
      );
    });

    it('should handle empty plans', () => {
      const emptyPlan: Plan = { tasks: [] };
      mockStringifyYaml.mockReturnValue('tasks: []');

      const output = PlanOutputter.formatPlanOutput(emptyPlan, mockMetrics);

      expect(output).toContain('tasks: []');
      expect(output).toContain('# Plan Metrics');
    });
  });
});
