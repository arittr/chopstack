import { describe, it, expect } from 'vitest';

import type { Plan } from '@/types/decomposer';
import type { PlanV2, TaskV2 } from '@/types/schemas-v2';

describe('useExecutionState helpers', () => {
  describe('Type compatibility', () => {
    it('should support v1 Plan type', () => {
      const v1Plan: Plan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Create Types',
            description: 'Create theme types',
            touches: ['src/types/theme.ts'],
            produces: [],
            requires: [],
            estimatedLines: 100,
            agentPrompt: 'Create theme types',
          },
        ],
      };

      expect(v1Plan.tasks[0]?.title).toBe('Create Types');
      expect(v1Plan.tasks[0]?.requires).toEqual([]);
      expect(v1Plan.tasks[0]?.touches).toEqual(['src/types/theme.ts']);
    });

    it('should support v2 PlanV2 type', () => {
      const v2Plan: PlanV2 = {
        name: 'Dark Mode Implementation',
        strategy: 'phased-parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Create Theme Types',
            complexity: 'M',
            description: 'Create TypeScript types for theme system',
            files: ['src/types/theme.ts'],
            acceptanceCriteria: ['Types exported for light/dark/system modes'],
            dependencies: [],
          },
        ],
      };

      expect(v2Plan.name).toBe('Dark Mode Implementation');
      expect(v2Plan.tasks[0]?.name).toBe('Create Theme Types');
      expect(v2Plan.tasks[0]?.dependencies).toEqual([]);
      expect(v2Plan.tasks[0]?.files).toEqual(['src/types/theme.ts']);
    });

    it('should handle TaskV2 with all fields', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Create Theme Types',
        complexity: 'M',
        description: 'Create TypeScript types for theme system.\nWhy: Foundation for theme features.',
        files: ['src/types/theme.ts', 'src/types/theme-context.ts'],
        acceptanceCriteria: [
          'Types exported for light/dark/system modes',
          'ThemeContext type defined',
          'Theme provider props typed correctly',
        ],
        dependencies: [],
        phase: 'phase-setup',
      };

      expect(task.name).toBe('Create Theme Types');
      expect(task.complexity).toBe('M');
      expect(task.files).toHaveLength(2);
      expect(task.acceptanceCriteria).toHaveLength(3);
      expect(task.phase).toBe('phase-setup');
    });

    it('should handle v1 and v2 field differences', () => {
      // v1 uses: title, requires, touches, produces, estimatedLines
      // v2 uses: name, dependencies, files, complexity, acceptanceCriteria

      const v1Task = {
        id: 'task-1',
        title: 'v1 Title',
        requires: ['dep-1'],
        touches: ['file1.ts'],
        produces: ['file2.ts'],
        estimatedLines: 100,
      };

      const v2Task: TaskV2 = {
        id: 'task-1',
        name: 'v2 Name',
        dependencies: ['dep-1'],
        files: ['file1.ts', 'file2.ts'],
        complexity: 'M',
        description: 'Task description',
        acceptanceCriteria: ['criterion 1'],
      };

      // Verify v1 fields
      expect(v1Task.title).toBe('v1 Title');
      expect(v1Task.requires).toEqual(['dep-1']);
      expect(v1Task.touches).toHaveLength(1);
      expect(v1Task.produces).toHaveLength(1);

      // Verify v2 fields
      expect(v2Task.name).toBe('v2 Name');
      expect(v2Task.dependencies).toEqual(['dep-1']);
      expect(v2Task.files).toHaveLength(2);
      expect(v2Task.complexity).toBe('M');
      expect(v2Task.acceptanceCriteria).toHaveLength(1);
    });
  });

  describe('PlanV2 with phases', () => {
    it('should support phase-based plans', () => {
      const plan: PlanV2 = {
        name: 'Feature Implementation',
        description: 'Implement new feature',
        strategy: 'phased-parallel',
        phases: [
          {
            id: 'phase-setup',
            name: 'Setup Phase',
            strategy: 'sequential',
            tasks: ['task-1', 'task-2'],
            requires: [],
          },
          {
            id: 'phase-implementation',
            name: 'Implementation Phase',
            strategy: 'parallel',
            tasks: ['task-3', 'task-4'],
            requires: ['phase-setup'],
          },
        ],
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'First task',
            files: ['file1.ts'],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Second task',
            files: ['file2.ts'],
            dependencies: ['task-1'],
          },
          {
            id: 'task-3',
            name: 'Task 3',
            complexity: 'M',
            description: 'Third task',
            files: ['file3.ts'],
            dependencies: ['task-2'],
          },
          {
            id: 'task-4',
            name: 'Task 4',
            complexity: 'M',
            description: 'Fourth task',
            files: ['file4.ts'],
            dependencies: ['task-2'],
          },
        ],
      };

      expect(plan.phases).toHaveLength(2);
      expect(plan.phases?.[0]?.strategy).toBe('sequential');
      expect(plan.phases?.[1]?.strategy).toBe('parallel');
      expect(plan.phases?.[1]?.requires).toEqual(['phase-setup']);
    });

    it('should support plans without phases', () => {
      const plan: PlanV2 = {
        name: 'Simple Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'First task',
            files: ['file1.ts'],
            dependencies: [],
          },
        ],
      };

      expect(plan.phases).toBeUndefined();
      expect(plan.strategy).toBe('parallel');
    });
  });
});
