import { readFile } from 'node:fs/promises';

import { vi } from 'vitest';

import type { CommandDependencies } from '@/commands/types';
import type { AgentService } from '@/core/agents/interfaces';
import type { ExecutionResult } from '@/core/execution/interfaces';
import type { ExecutionEngine } from '@/services/execution';
import type { RunCommandOptions } from '@/types/cli';
import type { PlanV2 } from '@/types/schemas-v2';

import { createDefaultDependencies, RunCommand } from '@/commands';

// Mock only external dependencies and complex systems
vi.mock('node:fs/promises');
const mockReadFile = vi.mocked(readFile);

describe('runCommand integration tests', () => {
  const mockPlan: PlanV2 = {
    name: 'Setup React Components',
    strategy: 'sequential',
    tasks: [
      {
        id: 'setup-components',
        name: 'Setup Component Structure',
        complexity: 'M',
        description: 'Create the basic component structure with Button and Header components',
        files: [
          'src/App.tsx',
          'src/components/Button.tsx',
          'src/components/Header.tsx',
        ],
        acceptanceCriteria: [
          'Button component created',
          'Header component created',
          'Components are reusable',
        ],
        dependencies: [],
      },
      {
        id: 'add-styling',
        name: 'Add Component Styling',
        complexity: 'S',
        description: 'Style the components with CSS modules',
        files: [
          'src/components/Button.tsx',
          'src/components/Header.tsx',
          'src/components/Button.module.css',
          'src/components/Header.module.css',
        ],
        acceptanceCriteria: ['CSS modules applied', 'Components styled correctly'],
        dependencies: ['setup-components'],
      },
    ],
  };

  const mockAgent = {
    decompose: vi.fn().mockResolvedValue(mockPlan),
  };

  const mockExecutionResult: ExecutionResult = {
    totalDuration: 300_000,
    tasks: [],
    branches: [],
    commits: [],
  };

  let mockExecute: ReturnType<typeof vi.fn>;
  let agentService: AgentService;
  let executionEngine: ExecutionEngine;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock external dependencies
    mockReadFile.mockResolvedValue('# Build React Components\n\nCreate reusable components.');
    mockAgent.decompose = vi.fn().mockResolvedValue(mockPlan);

    // Mock ExecutionEngine with proper interface
    mockExecute = vi.fn().mockResolvedValue(mockExecutionResult);
    executionEngine = {
      execute: mockExecute,
    } as unknown as ExecutionEngine;

    agentService = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAgentWithFallback: vi.fn().mockResolvedValue(mockAgent),
      getAvailableAgents: vi.fn().mockResolvedValue(['mock']),
      validateAgent: vi.fn().mockResolvedValue(true),
    };

    // Mock console and process
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createDeps = (): CommandDependencies =>
    createDefaultDependencies(undefined, {
      agentService,
      executionEngine,
    });

  describe('spec mode with real plan generation', () => {
    it('should execute full spec-to-execution pipeline using real classes', async () => {
      const options: RunCommandOptions = {
        spec: 'components-spec.md',
        agent: 'claude',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        verbose: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);

      // Verify real file reading
      expect(mockReadFile).toHaveBeenCalled();

      // Verify real agent creation and decomposition
      expect(agentService.createAgent).toHaveBeenCalledWith('claude');
      expect(mockAgent.decompose).toHaveBeenCalledWith(
        '# Build React Components\n\nCreate reusable components.',
        '/test/project',
        { verbose: false },
      );

      // Verify real execution engine usage
      expect(mockExecute).toHaveBeenCalledWith(
        mockPlan,
        {
          agent: 'claude',
          mode: 'execute',
          vcsMode: 'simple',
          verbose: false,
          dryRun: undefined,
          continueOnError: undefined,
          permissiveValidation: undefined,
          workdir: '/test/project',
        },
        expect.any(String), // jobId
      );
    });

    it('should handle plan validation failure using real DagValidator', async () => {
      // Create a plan with file conflicts
      const conflictingPlan: PlanV2 = {
        name: 'Conflicting Plan',
        strategy: 'parallel',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'S',
            description: 'First task that modifies conflicting-file.ts',
            files: ['conflicting-file.ts'],
            acceptanceCriteria: ['Task 1 completed'],
            dependencies: [],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'S',
            description: 'Second task that modifies conflicting-file.ts', // Same file = conflict
            files: ['conflicting-file.ts'],
            acceptanceCriteria: ['Task 2 completed'],
            dependencies: [], // No dependency = parallel conflict
          },
        ],
      };

      mockAgent.decompose.mockResolvedValue(conflictingPlan);

      const options: RunCommandOptions = {
        spec: 'conflicting-spec.md',
        agent: 'claude',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        verbose: true,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      // Should fail due to real validation
      expect(result).toBe(1);
      expect(mockAgent.decompose).toHaveBeenCalled();
    });
  });

  describe('plan mode with real YAML parsing', () => {
    it('should load and validate YAML plan using real YamlPlanParser', async () => {
      const yamlPlanContent = `
name: Create Layout
strategy: sequential
tasks:
  - id: create-layout
    name: Create Layout Component
    complexity: M
    description: Build the main layout component with responsive design
    files:
      - src/components/Layout.tsx
    acceptanceCriteria:
      - Layout component created
      - Responsive design implemented
    dependencies: []
      `;

      mockReadFile.mockResolvedValue(yamlPlanContent);

      const options: RunCommandOptions = {
        plan: 'layout-plan.yaml',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        verbose: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle JSON plan files using real parser', async () => {
      const jsonPlan: PlanV2 = {
        name: 'JSON Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'json-task',
            name: 'JSON Task',
            complexity: 'S',
            description: 'Task from JSON file with output creation',
            files: ['output.tsx'],
            acceptanceCriteria: ['Output file created'],
            dependencies: [],
          },
        ],
      };

      mockReadFile.mockResolvedValue(JSON.stringify(jsonPlan));

      const options: RunCommandOptions = {
        plan: 'plan.json',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
    });
  });

  describe('error handling with real classes', () => {
    it('should handle file read errors properly', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const options: RunCommandOptions = {
        spec: 'protected-spec.md',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should handle agent creation failures', async () => {
      agentService.createAgent = vi.fn().mockRejectedValue(new Error('Invalid agent type'));

      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        agent: 'invalid-agent' as any,
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should handle execution failures properly', async () => {
      const failureResult: ExecutionResult = {
        totalDuration: 1000,
        tasks: [
          {
            taskId: 'task-1',
            status: 'failure',
            duration: 500,
            error: 'Task failed',
          },
        ],
        branches: [],
        commits: [],
      };

      mockExecute.mockResolvedValue(failureResult);

      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        mode: 'execute',
        vcsMode: 'simple',
        tui: false,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('options passing and configuration', () => {
    it('should pass all options correctly to execution engine', async () => {
      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        mode: 'plan',
        vcsMode: 'simple',
        tui: false,
        workdir: '/custom/workdir',
        continueOnError: true,
        timeout: 600,
        retryAttempts: 5,
        verbose: true,
        writeLog: false,
      };

      const deps = createDeps();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);

      expect(mockExecute).toHaveBeenCalledWith(
        mockPlan,
        {
          mode: 'plan',
          vcsMode: 'simple',
          verbose: true,
          dryRun: undefined,
          continueOnError: true,
          agent: undefined,
          permissiveValidation: undefined,
          workdir: '/custom/workdir',
        },
        expect.any(String), // jobId
      );
    });
  });
});
