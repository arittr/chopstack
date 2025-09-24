import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { vi } from 'vitest';

import type { RunCommandOptions } from '@/types/cli';
import type { Plan } from '@/types/decomposer';
import type { ExecutionResult } from '@/types/execution';

import { createDecomposerAgent } from '@/agents';
import { runCommand } from '@/commands/run';
import { ExecutionEngine } from '@/engine/execution-engine';

// Mock only external dependencies and complex systems
vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('@/agents');
vi.mock('@/engine/execution-engine');

const mockReadFile = vi.mocked(readFile);
const mockResolve = vi.mocked(resolve);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);
const mockExecutionEngine = vi.mocked(ExecutionEngine);

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
    success: true,
    planId: 'test-plan-123',
    mode: 'execute',
    strategy: 'parallel',
    startTime: new Date('2024-01-01T10:00:00Z'),
    endTime: new Date('2024-01-01T10:05:00Z'),
    duration: 300_000,
    tasks: [],
    tasksCompleted: 2,
    tasksTotal: 2,
    tasksFailed: 0,
    tasksSkipped: 0,
  };

  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock external dependencies
    mockResolve.mockImplementation((path) => `/resolved/${path}`);
    mockReadFile.mockResolvedValue('# Build React Components\n\nCreate reusable components.');
    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);

    // Mock ExecutionEngine with proper interface
    mockExecute = vi.fn().mockResolvedValue(mockExecutionResult);
    const mockEngineInstance = {
      execute: mockExecute,
      planner: {} as any,
      stateManager: {} as any,
      monitor: {} as any,
      orchestrator: {} as any,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    mockExecutionEngine.mockImplementation(() => mockEngineInstance as any);

    // Mock console and process
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec mode with real plan generation', () => {
    it('should execute full spec-to-execution pipeline using real classes', async () => {
      const options: RunCommandOptions = {
        spec: 'components-spec.md',
        agent: 'claude',
        mode: 'execute',
        strategy: 'parallel',
        verbose: false,
      };

      const result = await runCommand(options);

      expect(result).toBe(0);

      // Verify real file reading
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/components-spec.md', 'utf8');

      // Verify real agent creation and decomposition
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      expect(mockAgent.decompose).toHaveBeenCalledWith(
        '# Build React Components\n\nCreate reusable components.',
        '/test/project',
        { verbose: false },
      );

      // Verify real execution engine usage
      expect(mockExecute).toHaveBeenCalledWith(mockPlan, {
        mode: 'execute',
        strategy: 'parallel',
        workdir: '/test/project',
        gitSpice: false,
        continueOnError: false,
        timeout: 300,
        retryAttempts: 3,
        verbose: false,
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
        strategy: 'parallel',
        verbose: true,
      };

      const result = await runCommand(options);

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
        strategy: 'serial',
        verbose: false,
      };

      const result = await runCommand(options);

      expect(result).toBe(0);
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/layout-plan.yaml', 'utf8');
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
        strategy: 'serial',
      };

      const result = await runCommand(options);

      expect(result).toBe(0);
    });
  });

  describe('error handling with real classes', () => {
    it('should handle file read errors properly', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const options: RunCommandOptions = {
        spec: 'protected-spec.md',
        mode: 'execute',
        strategy: 'parallel',
      };

      const result = await runCommand(options);

      expect(result).toBe(1);
    });

    it('should handle agent creation failures', async () => {
      mockCreateDecomposerAgent.mockRejectedValue(new Error('Invalid agent type'));

      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        agent: 'invalid-agent' as any,
        mode: 'execute',
        strategy: 'parallel',
      };

      const result = await runCommand(options);

      expect(result).toBe(1);
    });

    it('should handle execution failures properly', async () => {
      const failureResult: ExecutionResult = {
        success: false,
        planId: 'failed-plan',
        mode: 'execute',
        strategy: 'parallel',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        tasks: [],
        tasksCompleted: 0,
        tasksTotal: 2,
        tasksFailed: 2,
        tasksSkipped: 0,
        error: 'Task execution timeout',
      };

      const mockExecuteFailure = vi.fn().mockResolvedValue(failureResult);
      const mockEngineInstance = {
        execute: mockExecuteFailure,
        planner: {} as any,
        stateManager: {} as any,
        monitor: {} as any,
        orchestrator: {} as any,
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      mockExecutionEngine.mockImplementation(() => mockEngineInstance as any);

      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        mode: 'execute',
        strategy: 'parallel',
      };

      const result = await runCommand(options);

      expect(result).toBe(1);
      expect(mockExecuteFailure).toHaveBeenCalled();
    });
  });

  describe('options passing and configuration', () => {
    it('should pass all options correctly to execution engine', async () => {
      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        mode: 'plan',
        strategy: 'serial',
        workdir: '/custom/workdir',
        gitSpice: true,
        continueOnError: true,
        timeout: 600,
        retryAttempts: 5,
        verbose: true,
      };

      const result = await runCommand(options);

      expect(result).toBe(0);

      const executionEngineInstance = mockExecutionEngine.mock.results[0]?.value;
      expect(executionEngineInstance.execute).toHaveBeenCalledWith(mockPlan, {
        mode: 'plan',
        strategy: 'serial',
        workdir: '/custom/workdir',
        gitSpice: true,
        continueOnError: true,
        timeout: 600,
        retryAttempts: 5,
        verbose: true,
      });
    });
  });
});
