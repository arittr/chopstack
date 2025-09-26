import { readFile } from 'node:fs/promises';

import { vi } from 'vitest';

import type { CommandDependencies } from '@/commands/types';
import type { AgentService } from '@/core/agents/interfaces';
import type { ExecutionResult } from '@/core/execution/interfaces';
import type { ExecutionEngine } from '@/services/execution';
import type { RunCommandOptions } from '@/types/cli';
import type { Plan } from '@/types/decomposer';

import { createDefaultDependencies, RunCommand } from '@/commands';

// Mock only external dependencies and complex systems
vi.mock('node:fs/promises');
const mockReadFile = vi.mocked(readFile);

describe('runCommand integration tests', () => {
  const mockPlan: Plan = {
    tasks: [
      {
        id: 'setup-components',
        title: 'Setup Component Structure',
        description: 'Create the basic component structure',
        touches: ['src/App.tsx'],
        produces: ['src/components/Button.tsx', 'src/components/Header.tsx'],
        requires: [],
        estimatedLines: 50,
        agentPrompt: 'Create reusable Button and Header components',
      },
      {
        id: 'add-styling',
        title: 'Add Component Styling',
        description: 'Style the components with CSS modules',
        touches: ['src/components/Button.tsx', 'src/components/Header.tsx'],
        produces: ['src/components/Button.module.css', 'src/components/Header.module.css'],
        requires: ['setup-components'],
        estimatedLines: 30,
        agentPrompt: 'Add CSS module styling to Button and Header components',
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
      expect(mockExecute).toHaveBeenCalledWith(mockPlan, {
        agent: 'claude',
        mode: 'execute',
        vcsMode: 'simple',
        verbose: false,
        dryRun: undefined,
        parallel: undefined,
        continueOnError: undefined,
      });
    });

    it('should handle plan validation failure using real DagValidator', async () => {
      // Create a plan with file conflicts
      const conflictingPlan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            touches: ['conflicting-file.ts'],
            produces: [],
            requires: [],
            estimatedLines: 10,
            agentPrompt: 'Modify conflicting file',
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            touches: ['conflicting-file.ts'], // Same file = conflict
            produces: [],
            requires: [], // No dependency = parallel conflict
            estimatedLines: 15,
            agentPrompt: 'Also modify conflicting file',
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
tasks:
  - id: create-layout
    title: Create Layout Component
    description: Build the main layout component
    touches: []
    produces:
      - src/components/Layout.tsx
    requires: []
    estimatedLines: 40
    agentPrompt: Create a responsive layout component
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
      const jsonPlan = {
        tasks: [
          {
            id: 'json-task',
            title: 'JSON Task',
            description: 'Task from JSON',
            touches: [],
            produces: ['output.tsx'],
            requires: [],
            estimatedLines: 20,
            agentPrompt: 'Create from JSON',
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

      expect(mockExecute).toHaveBeenCalledWith(mockPlan, {
        mode: 'plan',
        vcsMode: 'simple',
        verbose: true,
        dryRun: undefined,
        parallel: undefined,
        continueOnError: true,
        agent: undefined,
      });
    });
  });
});
