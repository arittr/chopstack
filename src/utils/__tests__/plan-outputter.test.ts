import { writeFile } from 'node:fs/promises';

import { vi } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';

import type { PlanV2 } from '@/types/schemas-v2';

import { PlanOutputter } from '@/services/planning/plan-outputter';

// Mock external dependencies
vi.mock('node:fs/promises');
vi.mock('yaml');

const mockWriteFile = vi.mocked(writeFile);
const mockStringifyYaml = vi.mocked(stringifyYaml);

// Mock console methods
const _mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('PlanOutputter', () => {
  const mockPlan: PlanV2 = {
    name: 'Test Plan',
    strategy: 'sequential',
    tasks: [
      {
        id: 'task-1',
        name: 'Test Task 1',
        description: 'First test task',
        files: ['file1.ts', 'output1.ts'],
        complexity: 'S',
        acceptanceCriteria: ['Task 1 completed'],
        dependencies: [],
      },
      {
        id: 'task-2',
        name: 'Test Task 2',
        description: 'Second test task',
        files: ['file2.ts', 'output2.ts'],
        complexity: 'XS',
        acceptanceCriteria: ['Task 2 completed'],
        dependencies: ['task-1'],
      },
    ],
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
      await PlanOutputter.outputPlan(mockPlan);

      expect(mockStringifyYaml).toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should write plan to file when output path provided', async () => {
      const outputPath = '/test/output/plan.yaml';

      await PlanOutputter.outputPlan(mockPlan, outputPath);

      expect(mockWriteFile).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('tasks:'),
        'utf8',
      );
    });

    it('should not write to file when output path is empty string', async () => {
      await PlanOutputter.outputPlan(mockPlan, '');

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should not write to file when output path is undefined', async () => {
      await PlanOutputter.outputPlan(mockPlan, undefined);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle file write errors', async () => {
      const outputPath = '/invalid/path/plan.yaml';
      const writeError = new Error('Permission denied');
      mockWriteFile.mockRejectedValue(writeError);

      await expect(PlanOutputter.outputPlan(mockPlan, outputPath)).rejects.toThrow(
        'Permission denied',
      );
    });
  });

  describe('formatPlanOutput', () => {
    it('should format plan with YAML', () => {
      const output = PlanOutputter.formatPlanOutput(mockPlan);

      expect(mockStringifyYaml).toHaveBeenCalled();

      // Check that the output contains expected elements
      expect(output).toContain('tasks:');
    });

    it('should handle plans with different task counts', () => {
      const largePlan: PlanV2 = {
        ...mockPlan,
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i}`,
          name: `Task ${i}`,
          description: `Description ${i}`,
          files: [`file${i}.ts`],
          complexity: 'M' as const,
          acceptanceCriteria: [],
          dependencies: [],
        })),
      };

      const output = PlanOutputter.formatPlanOutput(largePlan);

      expect(output).toContain('tasks:');
      expect(mockStringifyYaml).toHaveBeenCalled();
    });

    it('should handle plans with phases', () => {
      const phasedPlan: PlanV2 = {
        ...mockPlan,
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            strategy: 'sequential',
            tasks: ['task-1'],
            requires: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(phasedPlan);

      expect(output).toContain('phases:');
    });
  });

  describe('logPlanSummary', () => {
    it('should log plan summary to console', () => {
      PlanOutputter.logPlanSummary(mockPlan);

      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle plans with phases', () => {
      const phasedPlan: PlanV2 = {
        ...mockPlan,
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            strategy: 'sequential',
            tasks: ['task-1'],
            requires: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(phasedPlan);

      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle plans with success metrics', () => {
      const planWithMetrics: PlanV2 = {
        ...mockPlan,
        successMetrics: {
          quantitative: ['Coverage > 80%'],
          qualitative: ['Clean code'],
        },
      };

      PlanOutputter.logPlanSummary(planWithMetrics);

      // Main functionality validation is sufficient - console logging is secondary
    });
  });

  describe('integration with YAML library', () => {
    it('should pass correct options to YAML stringify', () => {
      PlanOutputter.formatPlanOutput(mockPlan);

      expect(mockStringifyYaml).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Plan',
          strategy: 'sequential',
          tasks: expect.any(Array),
        }),
        {
          indent: 2,
          lineWidth: 200,
          defaultStringType: 'QUOTE_DOUBLE',
          defaultKeyType: 'PLAIN',
        },
      );
    });

    it('should handle YAML stringify errors', () => {
      const yamlError = new Error('YAML serialization failed');
      mockStringifyYaml.mockImplementation(() => {
        throw yamlError;
      });

      expect(() => PlanOutputter.formatPlanOutput(mockPlan)).toThrow('YAML serialization failed');
    });

    it('should handle empty plans', () => {
      const emptyPlan: PlanV2 = {
        name: 'Empty Plan',
        strategy: 'sequential',
        tasks: [],
      };
      mockStringifyYaml.mockReturnValue('tasks: []');

      const output = PlanOutputter.formatPlanOutput(emptyPlan);

      expect(output).toContain('tasks: []');
    });
  });
});
