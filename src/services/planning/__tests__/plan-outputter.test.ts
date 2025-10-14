import { writeFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Phase, PlanV2, TaskV2 } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';

import { PlanOutputter } from '../plan-outputter';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('@/utils/global-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    raw: vi.fn(),
  },
}));

describe('PlanOutputter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatPlanOutput', () => {
    it('should format a minimal plan with required fields', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('name: "Test Plan"');
      expect(output).toContain('strategy: "sequential"');
      expect(output).toContain('id: "task-1"');
      expect(output).toContain('name: "Task One"');
      expect(output).toContain('complexity: "M"');
      expect(output).toContain('files:');
      expect(output).toContain('- "src/test.ts"');
    });

    it('should include description when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        description: 'A comprehensive test plan for validation',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'S',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('description: "A comprehensive test plan for validation"');
    });

    it('should include specification and codebase paths when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        specification: 'spec.md',
        codebase: 'codebase.md',
        strategy: 'phased-parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('specification: "spec.md"');
      expect(output).toContain('codebase: "codebase.md"');
    });

    it('should include mode when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        mode: 'execute',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('mode: "execute"');
    });

    it('should format phases correctly', () => {
      const phases: Phase[] = [
        {
          id: 'phase-setup',
          name: 'Setup Phase',
          strategy: 'sequential',
          tasks: ['task-1', 'task-2'],
          requires: [],
        },
        {
          id: 'phase-impl',
          name: 'Implementation Phase',
          strategy: 'parallel',
          tasks: ['task-3'],
          requires: ['phase-setup'],
        },
      ];

      const plan: PlanV2 = {
        name: 'Phased Plan',
        strategy: 'phased-parallel',
        phases,
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'S',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task Two',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test2.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-1'],
          },
          {
            id: 'task-3',
            name: 'Task Three',
            complexity: 'L',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test3.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('phases:');
      expect(output).toContain('id: "phase-setup"');
      expect(output).toContain('name: "Setup Phase"');
      expect(output).toContain('strategy: "sequential"');
      expect(output).toContain('id: "phase-impl"');
      expect(output).toContain('requires:');
      expect(output).toContain('- "phase-setup"');
    });

    it('should include acceptance_criteria when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('acceptance_criteria:');
      expect(output).toContain('- "Criterion 1"');
      expect(output).toContain('- "Criterion 2"');
    });

    it('should include dependencies when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'S',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task Two',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test2.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-1'],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('dependencies:');
      expect(output).toContain('- "task-1"');
    });

    it('should include success_metrics when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
        successMetrics: {
          quantitative: ['Test coverage: 95%', 'Performance: <100ms'],
          qualitative: ['Clean code', 'Good documentation'],
        },
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('success_metrics:');
      expect(output).toContain('quantitative:');
      expect(output).toContain('- "Test coverage: 95%"');
      expect(output).toContain('- "Performance: <100ms"');
      expect(output).toContain('qualitative:');
      expect(output).toContain('- "Clean code"');
      expect(output).toContain('- "Good documentation"');
    });

    it('should handle multiple tasks with different complexity levels', () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-xs',
          name: 'Extra Small Task',
          complexity: 'XS',
          description: 'This is an extra small task with sufficient description length',
          files: ['src/xs.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-s',
          name: 'Small Task',
          complexity: 'S',
          description: 'This is a small task with sufficient description length for validation',
          files: ['src/s.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-m',
          name: 'Medium Task',
          complexity: 'M',
          description: 'This is a medium task with sufficient description length for validation',
          files: ['src/m.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-l',
          name: 'Large Task',
          complexity: 'L',
          description: 'This is a large task with sufficient description length for validation',
          files: ['src/l.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-xl',
          name: 'Extra Large Task',
          complexity: 'XL',
          description: 'This is an extra large task with sufficient description length',
          files: ['src/xl.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
      ];

      const plan: PlanV2 = {
        name: 'Multi-Complexity Plan',
        strategy: 'parallel',
        tasks,
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('complexity: "XS"');
      expect(output).toContain('complexity: "S"');
      expect(output).toContain('complexity: "M"');
      expect(output).toContain('complexity: "L"');
      expect(output).toContain('complexity: "XL"');
    });

    it('should handle tasks with multiple files', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Multi-File Task',
            complexity: 'M',
            description: 'This task modifies multiple files for comprehensive changes',
            files: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      expect(output).toContain('files:');
      expect(output).toContain('- "src/file1.ts"');
      expect(output).toContain('- "src/file2.ts"');
      expect(output).toContain('- "src/file3.ts"');
    });

    it('should not include empty arrays for optional fields', () => {
      const plan: PlanV2 = {
        name: 'Minimal Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Minimal Task',
            complexity: 'S',
            description: 'This is a minimal task with no optional fields populated',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      // Should not contain empty acceptance_criteria or dependencies
      expect(output).not.toContain('acceptance_criteria:');
      expect(output).not.toContain('dependencies:');
    });

    it('should not include empty phases array', () => {
      const plan: PlanV2 = {
        name: 'No Phases Plan',
        strategy: 'parallel',
        phases: [],
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const output = PlanOutputter.formatPlanOutput(plan);

      // Should not contain phases section when array is empty
      expect(output).not.toContain('phases:');
    });
  });

  describe('outputPlan', () => {
    it('should write plan to file when outputPath is provided', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      await PlanOutputter.outputPlan(plan, '/path/to/output.yaml');

      expect(writeFile).toHaveBeenCalledWith(
        '/path/to/output.yaml',
        expect.stringContaining('name: "Test Plan"'),
        'utf8',
      );
      expect(logger.info).toHaveBeenCalledWith('Plan written to /path/to/output.yaml');
    });

    it('should output to stdout when no outputPath is provided', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      await PlanOutputter.outputPlan(plan);

      expect(writeFile).not.toHaveBeenCalled();
      expect(logger.raw).toHaveBeenCalledWith(expect.stringContaining('name: "Test Plan"'));
    });

    it('should handle empty outputPath as no path', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      await PlanOutputter.outputPlan(plan, '');

      expect(writeFile).not.toHaveBeenCalled();
      expect(logger.raw).toHaveBeenCalled();
    });
  });

  describe('logPlanSummary', () => {
    it('should log basic plan information', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).toHaveBeenCalledWith('\n📋 Plan Summary:');
      expect(logger.info).toHaveBeenCalledWith('  Name: Test Plan');
      expect(logger.info).toHaveBeenCalledWith('  Strategy: sequential');
      expect(logger.info).toHaveBeenCalledWith('  Tasks: 1');
    });

    it('should log phase information when phases are present', () => {
      const plan: PlanV2 = {
        name: 'Phased Plan',
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            strategy: 'sequential',
            tasks: ['task-1'],
            requires: [],
          },
          {
            id: 'phase-2',
            name: 'Implementation',
            strategy: 'parallel',
            tasks: ['task-2', 'task-3'],
            requires: ['phase-1'],
          },
        ],
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'S',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task Two',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test2.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-3',
            name: 'Task Three',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test3.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).toHaveBeenCalledWith('  Phases: 2');
      expect(logger.info).toHaveBeenCalledWith('    - Setup (sequential, 1 tasks)');
      expect(logger.info).toHaveBeenCalledWith('    - Implementation (parallel, 2 tasks)');
    });

    it('should log complexity distribution', () => {
      const plan: PlanV2 = {
        name: 'Complex Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'S',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task Two',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test2.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-3',
            name: 'Task Three',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test3.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-4',
            name: 'Task Four',
            complexity: 'L',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test4.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).toHaveBeenCalledWith('  Complexity:');
      expect(logger.info).toHaveBeenCalledWith('    S: 1 tasks');
      expect(logger.info).toHaveBeenCalledWith('    M: 2 tasks');
      expect(logger.info).toHaveBeenCalledWith('    L: 1 tasks');
    });

    it('should log success metrics when present', () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
        successMetrics: {
          quantitative: ['Coverage: 95%', 'Performance: <100ms'],
          qualitative: ['Clean code', 'Good docs'],
        },
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).toHaveBeenCalledWith('  Success Metrics:');
      expect(logger.info).toHaveBeenCalledWith('    Quantitative: 2');
      expect(logger.info).toHaveBeenCalledWith('    Qualitative: 2');
    });

    it('should not log phases when none are defined', () => {
      const plan: PlanV2 = {
        name: 'No Phases Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Phases:'));
    });

    it('should not log success metrics when none are defined', () => {
      const plan: PlanV2 = {
        name: 'No Metrics Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task One',
            complexity: 'M',
            description: 'This is a test task with sufficient description length for validation',
            files: ['src/test.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      PlanOutputter.logPlanSummary(plan);

      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Success Metrics:'));
    });
  });
});
