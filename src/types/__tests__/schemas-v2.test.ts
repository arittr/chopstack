import { describe, expect, it } from 'vitest';

import {
  type Complexity,
  complexitySchema,
  type ExecutionContext,
  executionContextSchema,
  type Phase,
  phaseSchema,
  type PhaseStrategy,
  phaseStrategySchema,
  planSchemaV2,
  type PlanStrategy,
  planStrategySchema,
  type PlanV2,
  type SuccessMetrics,
  successMetricsSchema,
  type TaskV2,
  taskV2Schema,
} from '../schemas-v2';

describe('schemas-v2', () => {
  describe('complexitySchema', () => {
    it('should accept all valid complexity values', () => {
      const validComplexities: Complexity[] = ['XS', 'S', 'M', 'L', 'XL'];

      for (const complexity of validComplexities) {
        const result = complexitySchema.safeParse(complexity);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(complexity);
        }
      }
    });

    it('should reject invalid complexity values', () => {
      const invalidValues = ['xs', 'small', 'MEDIUM', 'XXL', 'A', '', null, undefined, 123];

      for (const value of invalidValues) {
        const result = complexitySchema.safeParse(value);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('phaseStrategySchema', () => {
    it('should accept valid strategy values', () => {
      const validStrategies: PhaseStrategy[] = ['sequential', 'parallel'];

      for (const strategy of validStrategies) {
        const result = phaseStrategySchema.safeParse(strategy);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(strategy);
        }
      }
    });

    it('should reject invalid strategy values', () => {
      const invalidValues = ['Sequential', 'PARALLEL', 'concurrent', '', null];

      for (const value of invalidValues) {
        const result = phaseStrategySchema.safeParse(value);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('phaseSchema', () => {
    const validPhase: Phase = {
      id: 'phase-setup',
      name: 'Setup Phase',
      strategy: 'sequential',
      tasks: ['task-1', 'task-2'],
      requires: [],
    };

    it('should validate a complete phase', () => {
      const result = phaseSchema.safeParse(validPhase);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validPhase);
      }
    });

    it('should require phase ID to be kebab-case', () => {
      const invalidPhases = [
        { ...validPhase, id: 'Phase Setup' },
        { ...validPhase, id: 'phase_setup' },
        { ...validPhase, id: 'phaseSetup' },
        { ...validPhase, id: 'PHASE-SETUP' },
      ];

      for (const phase of invalidPhases) {
        const result = phaseSchema.safeParse(phase);
        expect(result.success).toBe(false);
      }
    });

    it('should accept valid kebab-case phase IDs', () => {
      const validIds = ['phase-setup', 'phase-1', 'phase-implementation-2', 'p'];

      for (const id of validIds) {
        const result = phaseSchema.safeParse({ ...validPhase, id });
        expect(result.success).toBe(true);
      }
    });

    it('should require phase name to be non-empty', () => {
      const result = phaseSchema.safeParse({ ...validPhase, name: '' });
      expect(result.success).toBe(false);
    });

    it('should require at least one task', () => {
      const result = phaseSchema.safeParse({ ...validPhase, tasks: [] });
      expect(result.success).toBe(false);
    });

    it('should default requires to empty array', () => {
      const phaseWithoutRequires = {
        id: 'phase-test',
        name: 'Test Phase',
        strategy: 'parallel' as const,
        tasks: ['task-1'],
      };

      const result = phaseSchema.safeParse(phaseWithoutRequires);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requires).toEqual([]);
      }
    });

    it('should accept phase with dependencies', () => {
      const phaseWithDeps: Phase = {
        ...validPhase,
        id: 'phase-impl',
        requires: ['phase-setup', 'phase-config'],
      };

      const result = phaseSchema.safeParse(phaseWithDeps);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requires).toEqual(['phase-setup', 'phase-config']);
      }
    });
  });

  describe('taskV2Schema', () => {
    const validTask: TaskV2 = {
      id: 'create-theme-types',
      name: 'Create Theme Types',
      complexity: 'M',
      description:
        'Define TypeScript types for theme system. This provides the foundation for all theme-related features.',
      files: ['src/types/theme.ts'],
      acceptanceCriteria: [
        'Types exported for light/dark/system modes',
        'ThemeContext type defined',
      ],
      dependencies: [],
    };

    it('should validate a complete task', () => {
      const result = taskV2Schema.safeParse(validTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validTask);
      }
    });

    it('should require task ID to be kebab-case', () => {
      const invalidTasks = [
        { ...validTask, id: 'Create Theme Types' },
        { ...validTask, id: 'create_theme_types' },
        { ...validTask, id: 'createThemeTypes' },
        { ...validTask, id: 'CREATE-THEME-TYPES' },
      ];

      for (const task of invalidTasks) {
        const result = taskV2Schema.safeParse(task);
        expect(result.success).toBe(false);
      }
    });

    it('should accept valid kebab-case task IDs', () => {
      const validIds = ['task-1', 'create-types', 'update-component-v2', 't'];

      for (const id of validIds) {
        const result = taskV2Schema.safeParse({ ...validTask, id });
        expect(result.success).toBe(true);
      }
    });

    it('should require task name to be non-empty', () => {
      const result = taskV2Schema.safeParse({ ...validTask, name: '' });
      expect(result.success).toBe(false);
    });

    it('should require description to be at least 50 characters', () => {
      const shortDesc = 'Too short';
      const result = taskV2Schema.safeParse({ ...validTask, description: shortDesc });
      expect(result.success).toBe(false);
    });

    it('should accept description of exactly 50 characters', () => {
      const desc50 = 'A'.repeat(50);
      const result = taskV2Schema.safeParse({ ...validTask, description: desc50 });
      expect(result.success).toBe(true);
    });

    it('should require at least one file', () => {
      const result = taskV2Schema.safeParse({ ...validTask, files: [] });
      expect(result.success).toBe(false);
    });

    it('should accept multiple files', () => {
      const multiFileTask = {
        ...validTask,
        files: ['src/types/theme.ts', 'src/components/ThemeProvider.tsx', 'src/hooks/useTheme.ts'],
      };

      const result = taskV2Schema.safeParse(multiFileTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(3);
      }
    });

    it('should default acceptanceCriteria to empty array', () => {
      const taskWithoutCriteria = {
        id: 'task-test',
        name: 'Test Task',
        complexity: 'S' as const,
        description: 'This is a test task with enough description to pass validation rules.',
        files: ['test.ts'],
      };

      const result = taskV2Schema.safeParse(taskWithoutCriteria);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acceptanceCriteria).toEqual([]);
      }
    });

    it('should default dependencies to empty array', () => {
      const taskWithoutDeps = {
        id: 'task-test',
        name: 'Test Task',
        complexity: 'S' as const,
        description: 'This is a test task with enough description to pass validation rules.',
        files: ['test.ts'],
      };

      const result = taskV2Schema.safeParse(taskWithoutDeps);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependencies).toEqual([]);
      }
    });

    it('should accept task with dependencies', () => {
      const taskWithDeps: TaskV2 = {
        ...validTask,
        id: 'create-context',
        dependencies: ['create-theme-types', 'create-utils'],
      };

      const result = taskV2Schema.safeParse(taskWithDeps);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependencies).toEqual(['create-theme-types', 'create-utils']);
      }
    });

    it('should accept optional phase field', () => {
      const taskWithPhase: TaskV2 = {
        ...validTask,
        phase: 'phase-setup',
      };

      const result = taskV2Schema.safeParse(taskWithPhase);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phase).toBe('phase-setup');
      }
    });

    it('should validate all complexity sizes', () => {
      const complexities: Complexity[] = ['XS', 'S', 'M', 'L', 'XL'];

      for (const complexity of complexities) {
        const result = taskV2Schema.safeParse({ ...validTask, complexity });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('successMetricsSchema', () => {
    it('should validate complete success metrics', () => {
      const metrics: SuccessMetrics = {
        quantitative: ['Test coverage: 100%', 'Performance: <50ms', 'Bundle size: <5KB'],
        qualitative: ['Smooth transitions', 'Accessible controls', 'Clear documentation'],
      };

      const result = successMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(metrics);
      }
    });

    it('should default quantitative to empty array', () => {
      const metrics = {
        qualitative: ['Good UX'],
      };

      const result = successMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantitative).toEqual([]);
      }
    });

    it('should default qualitative to empty array', () => {
      const metrics = {
        quantitative: ['Coverage: 95%'],
      };

      const result = successMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.qualitative).toEqual([]);
      }
    });

    it('should accept empty metrics object', () => {
      const result = successMetricsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantitative).toEqual([]);
        expect(result.data.qualitative).toEqual([]);
      }
    });
  });

  describe('planStrategySchema', () => {
    it('should accept all valid strategy values', () => {
      const validStrategies: PlanStrategy[] = ['sequential', 'parallel', 'phased-parallel'];

      for (const strategy of validStrategies) {
        const result = planStrategySchema.safeParse(strategy);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(strategy);
        }
      }
    });

    it('should reject invalid strategy values', () => {
      const invalidValues = ['Sequential', 'PARALLEL', 'phased', '', null];

      for (const value of invalidValues) {
        const result = planStrategySchema.safeParse(value);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('planSchemaV2', () => {
    const createValidPlan = (): PlanV2 => ({
      name: 'Dark Mode Implementation',
      description: 'Add dark mode toggle to application settings',
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
          id: 'phase-impl',
          name: 'Implementation Phase',
          strategy: 'parallel',
          tasks: ['task-3', 'task-4'],
          requires: ['phase-setup'],
        },
      ],
      tasks: [
        {
          id: 'task-1',
          name: 'Create Types',
          complexity: 'S',
          description: 'Define TypeScript types for the theme system and all related components.',
          files: ['src/types/theme.ts'],
          acceptanceCriteria: ['Types exported'],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Create Context',
          complexity: 'M',
          description: 'Create React context for theme state management and provider component.',
          files: ['src/context/ThemeContext.tsx'],
          acceptanceCriteria: ['Context created'],
          dependencies: ['task-1'],
        },
        {
          id: 'task-3',
          name: 'Theme Provider',
          complexity: 'M',
          description: 'Implement theme provider component that wraps the application tree.',
          files: ['src/components/ThemeProvider.tsx'],
          acceptanceCriteria: ['Provider implemented'],
          dependencies: ['task-2'],
        },
        {
          id: 'task-4',
          name: 'Toggle Button',
          complexity: 'S',
          description:
            'Create theme toggle button component for switching between light and dark modes.',
          files: ['src/components/ThemeToggle.tsx'],
          acceptanceCriteria: ['Toggle works'],
          dependencies: ['task-2'],
        },
      ],
      successMetrics: {
        quantitative: ['Test coverage: 100%'],
        qualitative: ['Smooth transitions'],
      },
    });

    it('should validate a complete plan with phases', () => {
      const plan = createValidPlan();
      const result = planSchemaV2.safeParse(plan);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Dark Mode Implementation');
        expect(result.data.phases).toHaveLength(2);
        expect(result.data.tasks).toHaveLength(4);
      }
    });

    it('should require plan name to be non-empty', () => {
      const plan = createValidPlan();
      plan.name = '';

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should require at least one task', () => {
      const plan = createValidPlan();
      plan.tasks = [];

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should validate that phase tasks reference existing task IDs', () => {
      const plan = createValidPlan();
      expect(plan.phases).toBeDefined();

      const phases = plan.phases!;

      phases[0]!.tasks = ['task-1', 'task-nonexistent'];

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues[0]?.message).toContain(
          'Phase tasks must reference existing task IDs',
        );
      }
    });

    it('should validate task ID uniqueness', () => {
      const plan = createValidPlan();
      expect(plan.tasks[1]).toBeDefined();

      plan.tasks[1]!.id = 'task-1'; // Duplicate ID
      // Also remove phases to avoid phase validation running first
      plan.phases = undefined;

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues[0]?.message).toContain('Task IDs must be unique');
      }
    });

    it('should validate phase ID uniqueness', () => {
      const plan = createValidPlan();
      expect(plan.phases).toBeDefined();

      const phases = plan.phases!;

      phases[1]!.id = 'phase-setup'; // Duplicate ID

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues[0]?.message).toContain('Phase IDs must be unique');
      }
    });

    it('should validate phase dependencies reference existing phases', () => {
      const plan = createValidPlan();
      expect(plan.phases).toBeDefined();

      const phases = plan.phases!;

      phases[1]!.requires = ['phase-nonexistent'];

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues[0]?.message).toContain(
          'Phase dependencies must reference existing phase IDs',
        );
      }
    });

    it('should accept plan without phases (flat task list)', () => {
      const plan: PlanV2 = {
        name: 'Simple Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'This is the first task with sufficient description for validation.',
            files: ['file1.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
      };

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phases).toBeUndefined();
      }
    });

    it('should accept optional fields', () => {
      const plan: PlanV2 = {
        name: 'Minimal Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'S',
            description: 'A minimal task with just the required fields and enough description.',
            files: ['file.ts'],
            acceptanceCriteria: [],
            dependencies: [],
          },
        ],
        specification: 'spec.md',
        codebase: 'codebase.md',
        mode: 'execute',
        successMetrics: {
          quantitative: ['Metric 1'],
          qualitative: ['Quality 1'],
        },
      };

      const result = planSchemaV2.safeParse(plan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specification).toBe('spec.md');
        expect(result.data.codebase).toBe('codebase.md');
        expect(result.data.mode).toBe('execute');
      }
    });

    it('should validate mode enum values', () => {
      const plan = createValidPlan();

      const validModes = ['plan', 'execute', 'validate'] as const;
      for (const mode of validModes) {
        const result = planSchemaV2.safeParse({ ...plan, mode });
        expect(result.success).toBe(true);
      }

      const invalidMode = { ...plan, mode: 'invalid' };
      const result = planSchemaV2.safeParse(invalidMode);
      expect(result.success).toBe(false);
    });
  });

  describe('executionContextSchema', () => {
    const validContext: ExecutionContext = {
      specContent: '# Feature: Dark Mode\n\n## Overview\nImplement dark mode support.',
      planMetadata: {
        name: 'Dark Mode Plan',
        description: 'Implementation plan for dark mode',
        successMetrics: {
          quantitative: ['Coverage: 100%'],
          qualitative: ['Good UX'],
        },
      },
    };

    it('should validate a complete execution context', () => {
      const result = executionContextSchema.safeParse(validContext);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validContext);
      }
    });

    it('should require specContent', () => {
      const invalidContext = {
        planMetadata: validContext.planMetadata,
      };

      const result = executionContextSchema.safeParse(invalidContext);
      expect(result.success).toBe(false);
    });

    it('should require planMetadata', () => {
      const invalidContext = {
        specContent: validContext.specContent,
      };

      const result = executionContextSchema.safeParse(invalidContext);
      expect(result.success).toBe(false);
    });

    it('should accept minimal planMetadata', () => {
      const minimalContext: ExecutionContext = {
        specContent: '# Spec',
        planMetadata: {
          name: 'Plan Name',
        },
      };

      const result = executionContextSchema.safeParse(minimalContext);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.planMetadata.description).toBeUndefined();
        expect(result.data.planMetadata.successMetrics).toBeUndefined();
      }
    });

    it('should accept empty specContent', () => {
      const contextWithEmptySpec: ExecutionContext = {
        specContent: '',
        planMetadata: {
          name: 'Test Plan',
        },
      };

      const result = executionContextSchema.safeParse(contextWithEmptySpec);
      expect(result.success).toBe(true);
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript types from schemas', () => {
      // This test verifies that TypeScript types are correctly inferred
      // If this compiles without errors, the type inference is working

      const complexity: Complexity = 'M';
      const phaseStrategy: PhaseStrategy = 'parallel';
      const planStrategy: PlanStrategy = 'phased-parallel';

      const phase: Phase = {
        id: 'phase-1',
        name: 'Phase 1',
        strategy: 'sequential',
        tasks: ['task-1'],
        requires: [],
      };

      const task: TaskV2 = {
        id: 'task-1',
        name: 'Task 1',
        complexity: 'M',
        description: 'Task description with sufficient length to pass validation requirements.',
        files: ['file.ts'],
        acceptanceCriteria: ['Criteria 1'],
        dependencies: [],
      };

      const metrics: SuccessMetrics = {
        quantitative: ['Metric 1'],
        qualitative: ['Quality 1'],
      };

      const plan: PlanV2 = {
        name: 'Plan',
        strategy: 'sequential',
        tasks: [task],
      };

      const context: ExecutionContext = {
        specContent: 'Spec',
        planMetadata: {
          name: 'Plan',
        },
      };

      // If this compiles, types are correctly inferred
      expect(complexity).toBeDefined();
      expect(phaseStrategy).toBeDefined();
      expect(planStrategy).toBeDefined();
      expect(phase).toBeDefined();
      expect(task).toBeDefined();
      expect(metrics).toBeDefined();
      expect(plan).toBeDefined();
      expect(context).toBeDefined();
    });
  });

  describe('error messages', () => {
    it('should provide helpful error message for invalid phase ID', () => {
      const invalidPhase = {
        id: 'Invalid ID',
        name: 'Phase',
        strategy: 'sequential',
        tasks: ['task-1'],
      };

      const result = phaseSchema.safeParse(invalidPhase);
      expect(result.success).toBe(false);
      if (!result.success && result.error.issues.length > 0) {
        const error = result.error.issues[0];
        expect(error).toBeDefined();
        expect(error?.message).toContain('kebab-case');
      }
    });

    it('should provide helpful error message for short description', () => {
      const invalidTask = {
        id: 'task-1',
        name: 'Task',
        complexity: 'M',
        description: 'Too short',
        files: ['file.ts'],
      };

      const result = taskV2Schema.safeParse(invalidTask);
      expect(result.success).toBe(false);
      if (!result.success && result.error.issues.length > 0) {
        const error = result.error.issues[0];
        expect(error).toBeDefined();
        expect(error?.message).toContain('at least 50 characters');
      }
    });

    it('should provide helpful error message for empty task list', () => {
      const invalidPlan = {
        name: 'Plan',
        strategy: 'sequential',
        tasks: [],
      };

      const result = planSchemaV2.safeParse(invalidPlan);
      expect(result.success).toBe(false);
      if (!result.success && result.error.issues.length > 0) {
        const error = result.error.issues[0];
        expect(error).toBeDefined();
        expect(error?.message).toContain('at least one task');
      }
    });
  });
});
