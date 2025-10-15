import { describe, expect, it } from 'vitest';

import type { PlanV2 } from '@/types/schemas-v2';

import { ValidateModeHandlerImpl } from '../validate-mode-handler';

describe('ValidateModeHandlerImpl - Integration Tests', () => {
  const handler = new ValidateModeHandlerImpl();

  describe('Plan structure validation integration', () => {
    it('should validate a well-formed plan', async () => {
      const plan: PlanV2 = {
        name: 'Dark Mode Feature',
        description: 'Add dark mode support to the application',
        strategy: 'sequential',
        tasks: [
          {
            id: 'create-types',
            name: 'Create Theme Types',
            complexity: 'S',
            description: 'Define TypeScript types for the theme system',
            files: ['src/types/theme.ts'],
            acceptanceCriteria: [
              'Types exported for light/dark/system modes',
              'ThemeContext type defined',
            ],
            dependencies: [],
          },
          {
            id: 'create-context',
            name: 'Create Theme Context',
            complexity: 'M',
            description: 'Implement React context for theme management',
            files: ['src/context/ThemeContext.tsx'],
            acceptanceCriteria: ['Context provider wraps app', 'Theme state managed globally'],
            dependencies: ['create-types'],
          },
        ],
      };

      const result = await handler.handle(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.conflicts).toBeUndefined();
      expect(result.circularDependencies).toBeUndefined();
    });

    it('should detect circular dependencies', async () => {
      const plan: PlanV2 = {
        name: 'Invalid Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-a',
            name: 'Task A',
            complexity: 'M',
            description: 'Task A depends on Task B',
            files: ['fileA.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-b'],
          },
          {
            id: 'task-b',
            name: 'Task B',
            complexity: 'M',
            description: 'Task B depends on Task A',
            files: ['fileB.ts'],
            acceptanceCriteria: [],
            dependencies: ['task-a'],
          },
        ],
      };

      const result = await handler.handle(plan);

      expect(result.valid).toBe(false);
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies?.length).toBeGreaterThan(0);
    });

    it('should detect file conflicts in parallel tasks', async () => {
      const plan: PlanV2 = {
        name: 'Conflicting Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'First task modifying shared file',
            files: ['src/shared.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Second task modifying shared file',
            files: ['src/shared.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const result = await handler.handle(plan);

      expect(result.valid).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts?.length).toBeGreaterThan(0);
    });

    it('should detect missing dependencies', async () => {
      const plan: PlanV2 = {
        name: 'Plan with Missing Dependency',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'Task that depends on non-existent task',
            files: ['file1.ts'],
            acceptanceCriteria: [],
            dependencies: ['nonexistent-task'],
          },
        ],
      };

      const result = await handler.handle(plan);

      expect(result.valid).toBe(false);
      expect(result.missingDependencies).toBeDefined();
      expect(result.missingDependencies?.length).toBeGreaterThan(0);
    });
  });
});
