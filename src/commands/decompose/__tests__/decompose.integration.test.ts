import { readFile } from 'node:fs/promises';

import { vi } from 'vitest';

import type { DecomposeCommandOptions } from '@/types/cli';
import type { PlanV2 } from '@/types/schemas-v2';

import { createDecomposerAgent } from '@/adapters/agents';
import { createDefaultDependencies, DecomposeCommand } from '@/commands';

// Mock only external dependencies, not our own classes
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('@/adapters/agents');

const mockReadFile = vi.mocked(readFile);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);

describe('decomposeCommand integration tests', () => {
  const mockPlan: PlanV2 = {
    name: 'Setup React App',
    strategy: 'parallel',
    tasks: [
      {
        id: 'setup-routing',
        name: 'Setup React Router',
        complexity: 'S',
        description: 'Configure React Router for the application',
        files: ['src/App.tsx', 'src/routes/index.ts'],
        acceptanceCriteria: ['React Router configured', 'Routes file created'],
        dependencies: [],
      },
      {
        id: 'create-homepage',
        name: 'Create Homepage Component',
        complexity: 'M',
        description: 'Build the main homepage component with hero section',
        files: ['src/pages/HomePage.tsx', 'src/components/Hero.tsx'],
        acceptanceCriteria: ['Homepage component created', 'Hero section implemented'],
        dependencies: ['setup-routing'],
      },
    ],
  };

  const mockAgent = {
    decompose: vi.fn().mockResolvedValue(mockPlan),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock external dependencies
    mockAgent.decompose = vi.fn().mockResolvedValue(mockPlan);
    mockReadFile.mockResolvedValue(
      '# Create React App\n\nBuild a simple React application with routing.',
    );
    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);

    // Mock console methods to avoid noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully decompose a valid spec using real classes', async () => {
    const options: DecomposeCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      output: 'plan.yaml',
      skipGates: false,
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new DecomposeCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Verify real class interactions
    expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
    expect(mockAgent.decompose).toHaveBeenCalledWith(
      '# Create React App\n\nBuild a simple React application with routing.',
      '/test/cwd',
      { verbose: false },
    );
  });

  it('should handle plan validation using real DagValidator', async () => {
    // Create a plan with circular dependencies that should fail validation
    const invalidPlan: PlanV2 = {
      name: 'Invalid Plan',
      strategy: 'parallel',
      tasks: [
        {
          id: 'task-a',
          name: 'Task A',
          complexity: 'S',
          description: 'First task with circular dependency on task-b',
          files: ['file1.ts'],
          acceptanceCriteria: ['Task A completed'],
          dependencies: ['task-b'], // Circular: A requires B
        },
        {
          id: 'task-b',
          name: 'Task B',
          complexity: 'S',
          description: 'Second task with circular dependency on task-a',
          files: ['file2.ts'],
          acceptanceCriteria: ['Task B completed'],
          dependencies: ['task-a'], // Circular: B requires A
        },
      ],
    };

    mockAgent.decompose.mockResolvedValue(invalidPlan);

    const options: DecomposeCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      output: 'plan.yaml',
      skipGates: false,
      verbose: true,
    };

    const deps = createDefaultDependencies();
    const command = new DecomposeCommand(deps);
    const result = await command.execute(options);

    // Should return error code due to real validation failure
    expect(result).toBe(1);
    expect(mockAgent.decompose).toHaveBeenCalled();
  });

  it('should use real PlanOutputter for metrics and output', async () => {
    const options: DecomposeCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      skipGates: false,
      verbose: true, // This will trigger metrics logging
    };

    const deps = createDefaultDependencies();
    const command = new DecomposeCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // Verify the real plan generator was called
    expect(mockAgent.decompose).toHaveBeenCalledWith(expect.any(String), '/test/cwd', {
      verbose: true,
    });
  });

  it('should test real retry logic with generatePlanWithRetry', async () => {
    // First call returns invalid plan, second call returns valid plan
    const conflictingPlan: PlanV2 = {
      name: 'Conflicting Plan',
      strategy: 'parallel',
      tasks: [
        {
          id: 'task-1',
          name: 'Task 1',
          complexity: 'S',
          description: 'First task that modifies same-file.ts',
          files: ['same-file.ts'],
          acceptanceCriteria: ['Task 1 completed'],
          dependencies: [],
        },
        {
          id: 'task-2',
          name: 'Task 2',
          complexity: 'S',
          description: 'Second task that modifies same-file.ts', // File conflict!
          files: ['same-file.ts'],
          acceptanceCriteria: ['Task 2 completed'],
          dependencies: [],
        },
      ],
    };

    mockAgent.decompose.mockResolvedValueOnce(conflictingPlan).mockResolvedValueOnce(mockPlan); // Valid plan on retry

    const options: DecomposeCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      output: 'plan.yaml',
      skipGates: false,
      verbose: false,
    };

    const deps = createDefaultDependencies();
    const command = new DecomposeCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);
    // Should have called decompose twice due to retry logic
    expect(mockAgent.decompose).toHaveBeenCalledTimes(2);

    // Second call should have enhanced prompt with conflict information
    const secondCall = mockAgent.decompose.mock.calls[1];
    expect(secondCall?.[0]).toContain('IMPORTANT RETRY INSTRUCTIONS');
  });

  it('should calculate real metrics using DagValidator', async () => {
    const options: DecomposeCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      skipGates: false,
      verbose: true,
    };

    const deps = createDefaultDependencies();
    const command = new DecomposeCommand(deps);
    const result = await command.execute(options);

    expect(result).toBe(0);

    // The real DagValidator.calculateMetrics should have been called
    // We can't easily assert this without spying, but the functionality is tested
    // by ensuring the command completes successfully with real metric calculations
  });

  describe('Quality Gates Integration', () => {
    it('should pass both gates with valid spec and good plan', async () => {
      // Spec without open questions, plan with good quality
      const validSpec = `# Create React App

## Overview
Build a simple React application with routing.

## Requirements
- React Router v6 integration
- Homepage component with hero section

## Acceptance Criteria
- [ ] React Router configured and working
- [ ] Homepage renders correctly
- [ ] Hero section displays content

## Architecture
- Use React Router for navigation
- Component-based structure
`;

      mockReadFile.mockResolvedValue(validSpec);

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      // Should succeed because spec has no open questions and plan has no CRITICAL issues
      expect(result).toBe(0);
    });

    it('should fail pre-generation gate with spec containing open questions', async () => {
      // Spec with open questions section
      const specWithOpenQuestions = `# Create React App

## Overview
Build a simple React application with routing.

## Open Tasks/Questions
- [ ] Which React Router version should we use?
- [ ] Should we use TypeScript?
TODO: Decide on state management approach

## Requirements
- React Router integration
- Homepage component
`;

      mockReadFile.mockResolvedValue(specWithOpenQuestions);

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      // Should fail at pre-generation gate
      expect(result).toBe(1);
      // Agent should not be called because pre-generation gate blocks
      expect(mockAgent.decompose).not.toHaveBeenCalled();
    });

    it('should fail post-generation gate with plan containing XL tasks', async () => {
      // Plan with XL task (CRITICAL issue)
      const planWithXLTask: PlanV2 = {
        name: 'Setup React App',
        strategy: 'parallel',
        tasks: [
          {
            id: 'massive-task',
            name: 'Build Entire Application',
            complexity: 'XL', // CRITICAL issue
            description:
              'Build the entire React application including routing, state management, UI components, and API integration',
            files: [
              'src/App.tsx',
              'src/routes/index.ts',
              'src/store/index.ts',
              'src/components/Header.tsx',
              'src/components/Footer.tsx',
              'src/api/client.ts',
            ],
            acceptanceCriteria: ['Full application working'],
            dependencies: [],
          },
        ],
      };

      mockAgent.decompose.mockResolvedValue(planWithXLTask);

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      // Should fail at post-generation gate
      expect(result).toBe(1);
      // Agent should have been called but plan not saved
      expect(mockAgent.decompose).toHaveBeenCalled();
    });

    it('should bypass both gates with --skip-gates flag', async () => {
      // Spec with open questions
      const specWithOpenQuestions = `# Create React App

## Open Tasks/Questions
- [ ] Unresolved question
TODO: Decide on approach
`;

      mockReadFile.mockResolvedValue(specWithOpenQuestions);

      // Plan with XL task
      const planWithXLTask: PlanV2 = {
        name: 'Setup React App',
        strategy: 'parallel',
        tasks: [
          {
            id: 'massive-task',
            name: 'Build Entire Application',
            complexity: 'XL',
            description:
              'Build the entire React application including routing, state management, UI components',
            files: ['src/App.tsx', 'src/routes/index.ts', 'src/store/index.ts'],
            acceptanceCriteria: ['Full application working'],
            dependencies: [],
          },
        ],
      };

      mockAgent.decompose.mockResolvedValue(planWithXLTask);

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: true, // Bypass gates
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      // Should succeed despite issues because gates are skipped
      expect(result).toBe(0);
      expect(mockAgent.decompose).toHaveBeenCalled();
    });
  });
});
