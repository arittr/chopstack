/* eslint-disable unicorn/no-unused-properties */
import { describe, expect, it } from 'vitest';

import type { PlanV2, TaskV2 } from '@/types/schemas-v2';

describe('useExecutionState helpers', () => {
  describe('Type compatibility', () => {
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
        description:
          'Create TypeScript types for theme system.\nWhy: Foundation for theme features.',
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
            acceptanceCriteria: [],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Second task',
            files: ['file2.ts'],
            dependencies: ['task-1'],
            acceptanceCriteria: [],
          },
          {
            id: 'task-3',
            name: 'Task 3',
            complexity: 'M',
            description: 'Third task',
            files: ['file3.ts'],
            dependencies: ['task-2'],
            acceptanceCriteria: [],
          },
          {
            id: 'task-4',
            name: 'Task 4',
            complexity: 'M',
            description: 'Fourth task',
            files: ['file4.ts'],
            dependencies: ['task-2'],
            acceptanceCriteria: [],
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
            acceptanceCriteria: [],
          },
        ],
      };

      expect(plan.phases).toBeUndefined();
      expect(plan.strategy).toBe('parallel');
    });
  });
});
