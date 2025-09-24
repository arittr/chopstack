import { vi } from 'vitest';

import type { Plan } from '@/types/decomposer';

import { DagValidator } from '@/validation/dag-validator';

describe('DagValidator integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('real world validation scenarios', () => {
    it('should validate a complex React application plan', () => {
      const reactAppPlan: Plan = {
        tasks: [
          {
            id: 'setup-project',
            title: 'Initialize React Project',
            description: 'Set up the basic React project structure',
            touches: [],
            produces: ['package.json', 'src/index.tsx', 'public/index.html'],
            requires: [],
            estimatedLines: 50,
            agentPrompt: 'Create a new React TypeScript project with Vite',
          },
          {
            id: 'create-components',
            title: 'Create Base Components',
            description: 'Build reusable UI components',
            touches: [],
            produces: [
              'src/components/Button.tsx',
              'src/components/Input.tsx',
              'src/components/Modal.tsx',
            ],
            requires: ['setup-project'],
            estimatedLines: 120,
            agentPrompt: 'Create Button, Input, and Modal components with TypeScript',
          },
          {
            id: 'add-routing',
            title: 'Setup React Router',
            description: 'Configure routing for the application',
            touches: ['src/index.tsx'],
            produces: ['src/router/index.tsx', 'src/pages/Home.tsx', 'src/pages/About.tsx'],
            requires: ['setup-project'],
            estimatedLines: 80,
            agentPrompt: 'Set up React Router with Home and About pages',
          },
          {
            id: 'create-layout',
            title: 'Create Layout Components',
            description: 'Build header, footer, and main layout',
            touches: ['src/router/index.tsx'],
            produces: ['src/layout/Header.tsx', 'src/layout/Footer.tsx', 'src/layout/Layout.tsx'],
            requires: ['create-components', 'add-routing'],
            estimatedLines: 100,
            agentPrompt: 'Create Header, Footer and main Layout components',
          },
          {
            id: 'add-state-management',
            title: 'Setup State Management',
            description: 'Add Zustand for state management',
            touches: ['package.json'],
            produces: ['src/store/index.ts', 'src/store/userStore.ts'],
            requires: ['setup-project'],
            estimatedLines: 60,
            agentPrompt: 'Set up Zustand store with user state management',
          },
          {
            id: 'integrate-ui',
            title: 'Integrate UI with State',
            description: 'Connect components with state management',
            touches: ['src/layout/Header.tsx', 'src/pages/Home.tsx', 'src/components/Button.tsx'],
            produces: [],
            requires: ['create-layout', 'add-state-management'],
            estimatedLines: 40,
            agentPrompt: 'Connect UI components with Zustand store',
          },
        ],
      };

      const validation = DagValidator.validatePlan(reactAppPlan);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      // These fields only exist when there are actual issues
      expect(validation.conflicts).toBeUndefined();
      expect(validation.circularDependencies).toBeUndefined();

      // Calculate real metrics
      const metrics = DagValidator.calculateMetrics(reactAppPlan);

      expect(metrics.taskCount).toBe(6);
      expect(metrics.totalEstimatedLines).toBe(450); // Sum of all tasks
      expect(metrics.executionLayers).toBeGreaterThan(1); // Should have multiple layers
      expect(metrics.maxParallelization).toBeGreaterThan(1); // Some tasks can run in parallel
      expect(metrics.criticalPathLength).toBeGreaterThan(0);
      expect(metrics.estimatedSpeedup).toBeGreaterThan(1); // Should have speedup from parallelization
    });

    it('should detect file conflicts in parallel tasks', () => {
      const conflictingPlan: Plan = {
        tasks: [
          {
            id: 'update-config-a',
            title: 'Update Config for Feature A',
            description: 'Add configuration for feature A',
            touches: ['config/app.json'],
            produces: [],
            requires: [],
            estimatedLines: 10,
            agentPrompt: 'Add feature A configuration',
          },
          {
            id: 'update-config-b',
            title: 'Update Config for Feature B',
            description: 'Add configuration for feature B',
            touches: ['config/app.json'], // Same file as task A
            produces: [],
            requires: [], // No dependency = can run in parallel = conflict
            estimatedLines: 8,
            agentPrompt: 'Add feature B configuration',
          },
          {
            id: 'update-docs',
            title: 'Update Documentation',
            description: 'Document both features',
            touches: ['README.md'],
            produces: [],
            requires: ['update-config-a', 'update-config-b'],
            estimatedLines: 15,
            agentPrompt: 'Update documentation for both features',
          },
        ],
      };

      const validation = DagValidator.validatePlan(conflictingPlan);

      expect(validation.valid).toBe(false);
      expect(validation.conflicts).toBeDefined();
      expect(validation.conflicts).toHaveLength(1);
      expect(validation.conflicts?.[0]).toContain('config/app.json');
      expect(validation.conflicts?.[0]).toContain('update-config-a');
      expect(validation.conflicts?.[0]).toContain('update-config-b');
    });

    it('should detect circular dependencies in complex scenarios', () => {
      const circularPlan: Plan = {
        tasks: [
          {
            id: 'setup-database',
            title: 'Setup Database',
            description: 'Initialize database schema',
            touches: [],
            produces: ['db/schema.sql'],
            requires: ['setup-models'], // Circular: DB requires Models
            estimatedLines: 30,
            agentPrompt: 'Create database schema',
          },
          {
            id: 'setup-models',
            title: 'Setup Data Models',
            description: 'Create TypeScript data models',
            touches: [],
            produces: ['src/models/User.ts', 'src/models/Post.ts'],
            requires: ['setup-api'], // Models require API
            estimatedLines: 40,
            agentPrompt: 'Create TypeScript data models',
          },
          {
            id: 'setup-api',
            title: 'Setup API Routes',
            description: 'Create REST API endpoints',
            touches: [],
            produces: ['src/routes/users.ts', 'src/routes/posts.ts'],
            requires: ['setup-database'], // API requires DB = completes circle
            estimatedLines: 60,
            agentPrompt: 'Create REST API endpoints',
          },
        ],
      };

      const validation = DagValidator.validatePlan(circularPlan);

      expect(validation.valid).toBe(false);
      expect(validation.circularDependencies).toBeDefined();
      expect(validation.circularDependencies?.length).toBeGreaterThan(0);

      // Should detect the full cycle
      const circularDep = validation.circularDependencies?.[0];
      expect(circularDep).toContain('setup-database');
      expect(circularDep).toContain('setup-models');
      expect(circularDep).toContain('setup-api');
    });

    it('should handle missing dependencies gracefully', () => {
      const missingDepsPlan: Plan = {
        tasks: [
          {
            id: 'build-frontend',
            title: 'Build Frontend',
            description: 'Build the React frontend',
            touches: [],
            produces: ['dist/index.html'],
            requires: ['setup-build-tools', 'nonexistent-task'], // One missing dep
            estimatedLines: 25,
            agentPrompt: 'Build the frontend application',
          },
          {
            id: 'setup-build-tools',
            title: 'Setup Build Tools',
            description: 'Configure Vite and build tools',
            touches: ['package.json'],
            produces: ['vite.config.ts'],
            requires: [],
            estimatedLines: 20,
            agentPrompt: 'Configure Vite build tools',
          },
        ],
      };

      const validation = DagValidator.validatePlan(missingDepsPlan);

      expect(validation.valid).toBe(false);
      expect(validation.missingDependencies).toBeDefined();
      expect(validation.missingDependencies).toContain(
        "Task 'build-frontend' depends on missing task 'nonexistent-task'",
      );
    });

    it('should detect orphaned tasks', () => {
      const orphanedPlan: Plan = {
        tasks: [
          {
            id: 'main-feature',
            title: 'Main Feature',
            description: 'Implement the main feature',
            touches: [],
            produces: ['src/main.ts'],
            requires: [],
            estimatedLines: 50,
            agentPrompt: 'Implement main feature',
          },
          {
            id: 'helper-function',
            title: 'Helper Function',
            description: 'Create utility helper',
            touches: [],
            produces: ['src/utils/helper.ts'],
            requires: [],
            estimatedLines: 15,
            agentPrompt: 'Create helper utility',
          },
          {
            id: 'orphaned-task',
            title: 'Orphaned Task',
            description: 'This task is not required by anything',
            touches: [],
            produces: ['src/unused.ts'],
            requires: ['nonexistent-dependency'], // Depends on missing task
            estimatedLines: 10,
            agentPrompt: 'Create unused file',
          },
        ],
      };

      const validation = DagValidator.validatePlan(orphanedPlan);

      expect(validation.valid).toBe(false);
      expect(validation.missingDependencies).toBeDefined();
      expect(validation.missingDependencies).toContain(
        "Task 'orphaned-task' depends on missing task 'nonexistent-dependency'",
      );
    });

    it('should calculate accurate metrics for parallel execution', () => {
      const parallelPlan: Plan = {
        tasks: [
          {
            id: 'setup',
            title: 'Project Setup',
            description: 'Initialize the project',
            touches: [],
            produces: ['package.json'],
            requires: [],
            estimatedLines: 20,
            agentPrompt: 'Initialize project',
          },
          // Layer 1: These can run in parallel after setup
          {
            id: 'frontend',
            title: 'Frontend Development',
            description: 'Build React frontend',
            touches: [],
            produces: ['src/App.tsx'],
            requires: ['setup'],
            estimatedLines: 100,
            agentPrompt: 'Build React frontend',
          },
          {
            id: 'backend',
            title: 'Backend Development',
            description: 'Build Express backend',
            touches: [],
            produces: ['server/index.ts'],
            requires: ['setup'],
            estimatedLines: 80,
            agentPrompt: 'Build Express backend',
          },
          {
            id: 'database',
            title: 'Database Setup',
            description: 'Configure database',
            touches: [],
            produces: ['db/schema.sql'],
            requires: ['setup'],
            estimatedLines: 60,
            agentPrompt: 'Setup database',
          },
          // Layer 2: Integration task
          {
            id: 'integration',
            title: 'Frontend-Backend Integration',
            description: 'Connect frontend to backend',
            touches: ['src/App.tsx', 'server/index.ts'],
            produces: [],
            requires: ['frontend', 'backend', 'database'],
            estimatedLines: 40,
            agentPrompt: 'Integrate frontend and backend',
          },
        ],
      };

      const validation = DagValidator.validatePlan(parallelPlan);
      expect(validation.valid).toBe(true);

      const metrics = DagValidator.calculateMetrics(parallelPlan);

      expect(metrics.taskCount).toBe(5);
      expect(metrics.totalEstimatedLines).toBe(300); // 20+100+80+60+40
      expect(metrics.executionLayers).toBe(3); // setup -> (frontend,backend,database) -> integration
      expect(metrics.maxParallelization).toBe(3); // 3 tasks can run in parallel in layer 1
      expect(metrics.criticalPathLength).toBe(160); // setup(20) + frontend(100) + integration(40)
      expect(metrics.estimatedSpeedup).toBeCloseTo(1.875, 2); // 300/160 = 1.875
    });

    it('should handle empty plans gracefully', () => {
      const emptyPlan: Plan = {
        tasks: [],
      };

      const validation = DagValidator.validatePlan(emptyPlan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      const metrics = DagValidator.calculateMetrics(emptyPlan);
      expect(metrics.taskCount).toBe(0);
      expect(metrics.totalEstimatedLines).toBe(0);
      expect(metrics.executionLayers).toBe(0);
      expect(metrics.maxParallelization).toBe(-Infinity); // Math.max of empty array
      expect(metrics.criticalPathLength).toBe(0);
      expect(metrics.estimatedSpeedup).toBe(0); // 0/1 = 0
    });

    it('should handle single task plans', () => {
      const singleTaskPlan: Plan = {
        tasks: [
          {
            id: 'solo-task',
            title: 'Solo Task',
            description: 'A single task',
            touches: [],
            produces: ['output.ts'],
            requires: [],
            estimatedLines: 42,
            agentPrompt: 'Create single file',
          },
        ],
      };

      const validation = DagValidator.validatePlan(singleTaskPlan);
      expect(validation.valid).toBe(true);

      const metrics = DagValidator.calculateMetrics(singleTaskPlan);
      expect(metrics.taskCount).toBe(1);
      expect(metrics.totalEstimatedLines).toBe(42);
      expect(metrics.executionLayers).toBe(1);
      expect(metrics.maxParallelization).toBe(1);
      expect(metrics.criticalPathLength).toBe(42);
      expect(metrics.estimatedSpeedup).toBe(1); // No parallelization possible
    });
  });
});
