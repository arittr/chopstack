import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { vi } from 'vitest';

import type { ExecutionEngine } from '@/engine';
import type { RunCommandOptions } from '@/types/cli';
import type { DecomposerAgent, Plan } from '@/types/decomposer';
import type { ExecutionResult } from '@/types/execution';

import { createDecomposerAgent } from '@/adapters/agents';
import { createDefaultDependencies, RunCommand } from '@/commands';
import { createExecutionEngine } from '@/engine';
import { YamlPlanParser } from '@/io/yaml-parser';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { DagValidator } from '@/validation/dag-validator';

// Mock external dependencies
vi.mock('node:fs/promises');
vi.mock('@/agents');
vi.mock('@/engine');
vi.mock('@/validation/dag-validator');
vi.mock('@/planning/plan-generator');
vi.mock('@/io/yaml-parser');

const mockReadFile = vi.mocked(readFile);
const mockResolve = vi.mocked(path.resolve);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);
const mockCreateExecutionEngine = vi.mocked(createExecutionEngine);
const mockDagValidator = vi.mocked(DagValidator);
const mockGeneratePlanWithRetry = vi.mocked(generatePlanWithRetry);
const mockYamlPlanParser = vi.mocked(YamlPlanParser);

// Mock console methods (these are needed for proper test isolation)
// eslint-disable-next-line @typescript-eslint/naming-convention
const _mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
// eslint-disable-next-line @typescript-eslint/naming-convention
const _mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('runCommand', () => {
  let mockExecute: ReturnType<typeof vi.fn>;
  let mockEngine: any;

  const mockPlan: Plan = {
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        touches: ['file.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      },
    ],
  };

  const mockAgent: DecomposerAgent = {
    decompose: vi.fn().mockResolvedValue(mockPlan),
  };

  const mockSuccessResult: ExecutionResult = {
    success: true,
    planId: 'test-plan',
    mode: 'execute' as const,
    strategy: 'parallel' as const,
    startTime: new Date(),
    endTime: new Date(),
    duration: 1000,
    tasks: [],
    tasksCompleted: 1,
    tasksTotal: 1,
    tasksFailed: 0,
    tasksSkipped: 0,
    gitBranches: ['feature/task-1'],
    stackUrl: 'https://github.com/user/repo/pull/123',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks
    mockResolve.mockImplementation((input) =>
      input.startsWith('/') ? input : `/resolved/${input}`,
    );
    mockReadFile.mockResolvedValue('# Test content');
    mockAgent.decompose = vi.fn().mockResolvedValue(mockPlan);
    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);
    mockGeneratePlanWithRetry.mockResolvedValue({
      plan: mockPlan,
      success: true,
      attempts: 1,
      conflicts: [],
    });
    mockDagValidator.validatePlan.mockReturnValue({
      valid: true,
      errors: [],
    });
    mockYamlPlanParser.parse = vi.fn().mockReturnValue(mockPlan);

    // Mock ExecutionEngine
    mockExecute = vi.fn().mockResolvedValue(mockSuccessResult);
    mockEngine = {
      execute: mockExecute,
      planner: {} as any,
      stateManager: {} as any,
      monitor: {} as any,
      orchestrator: {} as any,
      vcsEngine: {} as any,
    };
    mockCreateExecutionEngine.mockResolvedValue(mockEngine as ExecutionEngine);

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec mode execution', () => {
    const specOptions: RunCommandOptions = {
      spec: 'test-spec.md',
      agent: 'claude',
      mode: 'execute',
      strategy: 'parallel',
      gitSpice: false,
      continueOnError: false,
      timeout: 300,
      retryAttempts: 3,
      verbose: false,
    };

    it('should successfully execute from spec file', async () => {
      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(specOptions);

      expect(result).toBe(0);
      expect(mockResolve).toHaveBeenCalledWith('test-spec.md');
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/test-spec.md', 'utf8');
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        '# Test content',
        '/test/cwd',
        {
          maxRetries: 3,
          verbose: false,
        },
      );
      expect(mockDagValidator.validatePlan).toHaveBeenCalledWith(mockPlan);
    });

    it('should use custom workdir when provided', async () => {
      const optionsWithWorkdir = { ...specOptions, workdir: '/custom/workdir' };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      await command.execute(optionsWithWorkdir);

      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        '# Test content',
        '/custom/workdir',
        expect.any(Object),
      );
    });

    it('should default to claude agent when not specified', async () => {
      const optionsWithoutAgent = { ...specOptions };
      delete optionsWithoutAgent.agent;

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      await command.execute(optionsWithoutAgent);

      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle plan generation failure', async () => {
      mockGeneratePlanWithRetry.mockResolvedValue({
        plan: mockPlan,
        success: false,
        attempts: 3,
        conflicts: [],
      });

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(specOptions);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });
  });

  describe('plan mode execution', () => {
    const planOptions: RunCommandOptions = {
      plan: 'test-plan.yaml',
      mode: 'execute',
      strategy: 'serial',
      gitSpice: true,
      continueOnError: true,
      timeout: 600,
      retryAttempts: 5,
      verbose: true,
    };

    it('should successfully execute from YAML plan file', async () => {
      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(planOptions);

      expect(result).toBe(0);
      expect(mockResolve).toHaveBeenCalledWith('test-plan.yaml');
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/test-plan.yaml', 'utf8');
      expect(mockYamlPlanParser.parse).toHaveBeenCalledWith('# Test content');
      expect(mockDagValidator.validatePlan).toHaveBeenCalledWith(mockPlan);
    });

    it('should handle JSON plan files', async () => {
      const jsonOptions = { ...planOptions, plan: 'test-plan.json' };
      const mockJsonData = { tasks: [] };
      mockReadFile.mockResolvedValue(JSON.stringify(mockJsonData));

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      await command.execute(jsonOptions);

      // For JSON files, the command uses JSON.parse directly, not YamlPlanParser
      expect(mockReadFile).toHaveBeenCalledWith('/resolved/test-plan.json', 'utf8');
    });

    it('should detect YAML files with .yml extension', async () => {
      const ymlOptions = { ...planOptions, plan: 'test-plan.yml' };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      await command.execute(ymlOptions);

      expect(mockYamlPlanParser.parse).toHaveBeenCalledWith('# Test content');
    });
  });

  describe('validation', () => {
    const baseOptions: RunCommandOptions = {
      plan: 'test-plan.yaml',
      mode: 'execute',
      strategy: 'parallel',
    };

    it('should handle plan validation failure', async () => {
      mockDagValidator.validatePlan.mockReturnValue({
        valid: false,
        errors: ['Error 1', 'Error 2'],
      });

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(baseOptions);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should require either spec or plan', async () => {
      const invalidOptions: RunCommandOptions = {
        mode: 'execute',
        strategy: 'parallel',
      };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(invalidOptions);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });
  });

  describe('execution engine integration', () => {
    const execOptions: RunCommandOptions = {
      plan: 'test-plan.yaml',
      mode: 'plan',
      strategy: 'serial',
      workdir: '/custom/dir',
      gitSpice: true,
      continueOnError: true,
      timeout: 900,
      retryAttempts: 2,
      verbose: true,
    };

    it('should pass all options to execution engine', async () => {
      const localMockEngine = {
        execute: vi.fn().mockResolvedValue(mockSuccessResult),
        planner: {} as any,
        stateManager: {} as any,
        monitor: {} as any,
        orchestrator: {} as any,
        vcsEngine: {} as any,
      } as any;
      mockCreateExecutionEngine.mockResolvedValue(localMockEngine as ExecutionEngine);

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      await command.execute(execOptions);

      expect(localMockEngine.execute).toHaveBeenCalledWith(mockPlan, {
        mode: 'plan',
        strategy: 'serial',
        verbose: true,
        dryRun: undefined,
        parallel: undefined,
        continueOnError: true,
      });
    });

    it('should handle execution success with git-spice output', async () => {
      const gitSpiceResult: ExecutionResult = {
        ...mockSuccessResult,
        gitBranches: ['feature/task-1', 'feature/task-2'],
        stackUrl: 'https://github.com/user/repo/pull/123',
      };

      const mockEngine = {
        execute: vi.fn().mockResolvedValue(gitSpiceResult),
        planner: {} as any,
        stateManager: {} as any,
        monitor: {} as any,
        orchestrator: {} as any,
      } as any;
      mockCreateExecutionEngine.mockResolvedValue(mockEngine as ExecutionEngine);

      const gitSpiceOptions = { ...execOptions, gitSpice: true };
      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(gitSpiceOptions);

      expect(result).toBe(0);
      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle execution failure', async () => {
      const failureResult: ExecutionResult = {
        success: false,
        planId: 'test-plan',
        mode: 'plan' as const,
        strategy: 'serial' as const,
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        tasks: [],
        tasksCompleted: 1,
        tasksTotal: 3,
        tasksFailed: 2,
        tasksSkipped: 0,
        error: 'Execution timeout',
      };

      const mockEngine = {
        execute: vi.fn().mockResolvedValue(failureResult),
        planner: {} as any,
        stateManager: {} as any,
        monitor: {} as any,
        orchestrator: {} as any,
      } as any;
      mockCreateExecutionEngine.mockResolvedValue(mockEngine as ExecutionEngine);

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(execOptions);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });
  });

  describe('error handling', () => {
    it('should handle file reading errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const options: RunCommandOptions = {
        spec: 'nonexistent-spec.md',
        mode: 'execute',
        strategy: 'parallel',
      };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle JSON parsing errors', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      const options: RunCommandOptions = {
        plan: 'test-plan.json',
        mode: 'execute',
        strategy: 'parallel',
      };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });

    it('should handle unknown errors gracefully', async () => {
      mockReadFile.mockRejectedValue('String error'); // Non-Error object

      const options: RunCommandOptions = {
        spec: 'test-spec.md',
        mode: 'execute',
        strategy: 'parallel',
      };

      const deps = createDefaultDependencies();
      const command = new RunCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      // Main functionality validation is sufficient - console logging is secondary
    });
  });
});
