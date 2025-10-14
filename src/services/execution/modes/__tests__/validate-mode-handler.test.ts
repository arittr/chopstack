import type { PlanV2 } from '@/types/schemas-v2';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ValidateModeHandlerImpl } from '../validate-mode-handler';

// Mock DagValidator
vi.mock('@/validation/dag-validator', () => ({
  DagValidator: {
    validatePlan: vi.fn(),
  },
}));

import { DagValidator } from '@/validation/dag-validator';

describe('ValidateModeHandlerImpl', () => {
  let handler: ValidateModeHandlerImpl;

  beforeEach(() => {
    handler = new ValidateModeHandlerImpl();
    vi.clearAllMocks();
  });

  describe('handle', () => {
    it('should validate PlanV2 successfully', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        description: 'A test plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Create types',
            complexity: 'M',
            description: 'Create TypeScript types',
            files: ['src/types/theme.ts'],
            acceptanceCriteria: ['Types exported'],
            dependencies: [],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      const result = await handler.handle(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.conflicts).toEqual([]);
      expect(result.circularDependencies).toEqual([]);
      expect(DagValidator.validatePlan).toHaveBeenCalledTimes(1);
    });

    it('should convert PlanV2 to v1 Plan format', async () => {
      const plan: PlanV2 = {
        name: 'Test Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task Name',
            complexity: 'L',
            description: 'Task description',
            files: ['src/file1.ts', 'src/file2.ts'],
            acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
            dependencies: ['task-0'],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      await handler.handle(plan);

      // Verify DagValidator was called with converted v1 plan
      const calledPlan = vi.mocked(DagValidator.validatePlan).mock.calls[0]?.[0];
      expect(calledPlan).toBeDefined();
      expect(calledPlan?.tasks).toHaveLength(1);

      const convertedTask = calledPlan?.tasks[0];
      expect(convertedTask).toMatchObject({
        id: 'task-1',
        title: 'Task Name', // name → title
        description: 'Task description',
        touches: ['src/file1.ts', 'src/file2.ts'], // files → touches
        produces: [], // v2 doesn't have produces
        requires: ['task-0'], // dependencies → requires
        estimatedLines: 400, // L complexity → 400 lines
      });

      // Verify agent prompt includes acceptance criteria
      expect(convertedTask?.agentPrompt).toContain('Task description');
      expect(convertedTask?.agentPrompt).toContain('## Acceptance Criteria');
      expect(convertedTask?.agentPrompt).toContain('- Criterion 1');
      expect(convertedTask?.agentPrompt).toContain('- Criterion 2');
      expect(convertedTask?.agentPrompt).toContain('## Task Complexity: L');
    });

    it('should handle validation errors', async () => {
      const plan: PlanV2 = {
        name: 'Invalid Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'Task 1',
            files: ['file1.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-2'],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Task 2',
            files: ['file2.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-1'],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: false,
        errors: ['Invalid dependencies'],
        conflicts: [],
        circularDependencies: ['task-1 -> task-2 -> task-1'],
      });

      const result = await handler.handle(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid dependencies');
      expect(result.circularDependencies).toContain('task-1 -> task-2 -> task-1');
    });

    it('should handle file conflicts', async () => {
      const plan: PlanV2 = {
        name: 'Conflicting Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'Task 1',
            files: ['src/shared.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Task 2',
            files: ['src/shared.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: false,
        errors: [],
        conflicts: ['File src/shared.ts modified by task-1 and task-2'],
        circularDependencies: [],
      });

      const result = await handler.handle(plan);

      expect(result.valid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
    });

    it('should convert complexity to estimated lines correctly', async () => {
      const plan: PlanV2 = {
        name: 'Complexity Test',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-xs',
            name: 'XS Task',
            complexity: 'XS',
            description: 'XS',
            files: ['xs.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-s',
            name: 'S Task',
            complexity: 'S',
            description: 'S',
            files: ['s.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-m',
            name: 'M Task',
            complexity: 'M',
            description: 'M',
            files: ['m.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-l',
            name: 'L Task',
            complexity: 'L',
            description: 'L',
            files: ['l.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-xl',
            name: 'XL Task',
            complexity: 'XL',
            description: 'XL',
            files: ['xl.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      await handler.handle(plan);

      const calledPlan = vi.mocked(DagValidator.validatePlan).mock.calls[0]?.[0];
      expect(calledPlan?.tasks[0]?.estimatedLines).toBe(50); // XS
      expect(calledPlan?.tasks[1]?.estimatedLines).toBe(100); // S
      expect(calledPlan?.tasks[2]?.estimatedLines).toBe(200); // M
      expect(calledPlan?.tasks[3]?.estimatedLines).toBe(400); // L
      expect(calledPlan?.tasks[4]?.estimatedLines).toBe(800); // XL
    });

    it('should generate agent prompt without acceptance criteria when empty', async () => {
      const plan: PlanV2 = {
        name: 'Simple Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Simple Task',
            complexity: 'M',
            description: 'Simple description',
            files: ['simple.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      await handler.handle(plan);

      const calledPlan = vi.mocked(DagValidator.validatePlan).mock.calls[0]?.[0];
      const agentPrompt = calledPlan?.tasks[0]?.agentPrompt;

      expect(agentPrompt).toContain('Simple description');
      expect(agentPrompt).not.toContain('## Acceptance Criteria');
      expect(agentPrompt).toContain('## Task Complexity: M');
    });

    it('should handle plan with phases', async () => {
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
        ],
        tasks: [
          {
            id: 'task-1',
            name: 'Setup Task',
            complexity: 'M',
            description: 'Setup',
            files: ['setup.ts'],
            acceptanceCriteria: [],
            dependencies: [],
            phase: 'phase-1',
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      const result = await handler.handle(plan);

      expect(result.valid).toBe(true);
      expect(DagValidator.validatePlan).toHaveBeenCalled();
    });

    it('should handle multiple tasks with different complexities', async () => {
      const plan: PlanV2 = {
        name: 'Multi-Task Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Small Task',
            complexity: 'S',
            description: 'Small task description',
            files: ['small.ts'],
            acceptanceCriteria: ['Small criterion'],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Large Task',
            complexity: 'XL',
            description: 'Large task description',
            files: ['large1.ts', 'large2.ts', 'large3.ts'],
            acceptanceCriteria: ['Large criterion 1', 'Large criterion 2'],
            dependencies: ['task-1'],
          },
        ],
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      await handler.handle(plan);

      const calledPlan = vi.mocked(DagValidator.validatePlan).mock.calls[0]?.[0];

      // Verify first task
      expect(calledPlan?.tasks[0]).toMatchObject({
        id: 'task-1',
        title: 'Small Task',
        touches: ['small.ts'],
        requires: [],
        estimatedLines: 100,
      });

      // Verify second task
      expect(calledPlan?.tasks[1]).toMatchObject({
        id: 'task-2',
        title: 'Large Task',
        touches: ['large1.ts', 'large2.ts', 'large3.ts'],
        requires: ['task-1'],
        estimatedLines: 800,
      });
    });

    it('should handle plan with success metrics', async () => {
      const plan: PlanV2 = {
        name: 'Plan with Metrics',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task',
            complexity: 'M',
            description: 'Task',
            files: ['task.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
        successMetrics: {
          quantitative: ['Coverage > 80%', 'Build time < 30s'],
          qualitative: ['Clean code', 'Good documentation'],
        },
      };

      vi.mocked(DagValidator.validatePlan).mockReturnValue({
        valid: true,
        errors: [],
        conflicts: [],
        circularDependencies: [],
      });

      const result = await handler.handle(plan);

      expect(result.valid).toBe(true);
    });
  });
});
