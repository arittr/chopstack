/**
 * Unit tests for DecomposeCommand
 */

import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecomposeCommandOptions } from '@/types/cli';
import type { PlanV2 } from '@/types/schemas-v2';

import { createDecomposerAgent } from '@/adapters/agents';
import { createDefaultDependencies, DecomposeCommand } from '@/commands';
import { generatePlanWithRetry } from '@/services/planning/plan-generator';
import { ProcessGateService } from '@/services/planning/process-gate-service';

// Mock all external dependencies
vi.mock('node:fs/promises');
vi.mock('@/adapters/agents');
vi.mock('@/services/planning/plan-generator');
vi.mock('@/services/planning/process-gate-service');

const mockReadFile = vi.mocked(readFile);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);
const mockGeneratePlanWithRetry = vi.mocked(generatePlanWithRetry);
const MockProcessGateService = vi.mocked(ProcessGateService);

describe('DecomposeCommand unit tests', () => {
  const mockPlan: PlanV2 = {
    name: 'Test Plan',
    strategy: 'parallel',
    tasks: [
      {
        id: 'task-1',
        name: 'Task 1',
        complexity: 'S',
        description: 'Test task with sufficient description length for quality validation',
        files: ['file1.ts'],
        acceptanceCriteria: ['Task 1 completed'],
        dependencies: [],
      },
    ],
  };

  const mockAgent = {
    decompose: vi.fn(),
  };

  const mockGateService = {
    checkPreGeneration: vi.fn(),
    checkPostGeneration: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockReadFile.mockResolvedValue('# Test Spec\n\nTest specification content');
    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);
    mockGeneratePlanWithRetry.mockResolvedValue({
      plan: mockPlan,
      success: true,
      attempts: 1,
      conflicts: [],
    });

    // Mock ProcessGateService constructor and methods
    MockProcessGateService.mockImplementation(() => mockGateService as never);
    mockGateService.checkPreGeneration.mockReturnValue({
      blocking: false,
      message: 'Pre-generation gate passed',
      issues: [],
    });
    mockGateService.checkPostGeneration.mockReturnValue({
      blocking: false,
      message: 'Post-generation gate passed',
      issues: [],
    });

    // Mock console to avoid noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Pre-generation gate', () => {
    it('should check pre-generation gate with skipGates=false', async () => {
      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      await command.execute(options);

      expect(mockGateService.checkPreGeneration).toHaveBeenCalledWith(
        '# Test Spec\n\nTest specification content',
        { skipGates: false },
      );
    });

    it('should pass skipGates=true to pre-generation gate', async () => {
      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: true,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      await command.execute(options);

      expect(mockGateService.checkPreGeneration).toHaveBeenCalledWith(
        '# Test Spec\n\nTest specification content',
        { skipGates: true },
      );
    });

    it('should exit with code 1 when pre-generation gate blocks', async () => {
      mockGateService.checkPreGeneration.mockReturnValue({
        blocking: true,
        message: 'Specification has open questions',
        issues: ['- [ ] Unresolved question'],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      // Should not proceed to plan generation
      expect(mockGeneratePlanWithRetry).not.toHaveBeenCalled();
    });

    it('should continue to plan generation when pre-generation gate passes', async () => {
      mockGateService.checkPreGeneration.mockReturnValue({
        blocking: false,
        message: 'Pre-generation gate passed',
        issues: [],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockGeneratePlanWithRetry).toHaveBeenCalled();
    });
  });

  describe('Post-generation gate', () => {
    it('should check post-generation gate with generated plan', async () => {
      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      await command.execute(options);

      expect(mockGateService.checkPostGeneration).toHaveBeenCalledWith(mockPlan, {
        skipGates: false,
      });
    });

    it('should pass skipGates=true to post-generation gate', async () => {
      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: true,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      await command.execute(options);

      expect(mockGateService.checkPostGeneration).toHaveBeenCalledWith(mockPlan, {
        skipGates: true,
      });
    });

    it('should exit with code 1 when post-generation gate blocks (CRITICAL issues)', async () => {
      mockGateService.checkPostGeneration.mockReturnValue({
        blocking: true,
        message: 'Plan has CRITICAL issues',
        issues: ['Task "task-1" is XL complexity'],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
      // Plan generation should have been called
      expect(mockGeneratePlanWithRetry).toHaveBeenCalled();
    });

    it('should continue and save plan when post-generation gate passes', async () => {
      mockGateService.checkPostGeneration.mockReturnValue({
        blocking: false,
        message: 'Post-generation gate passed',
        issues: [],
      });

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
      expect(mockGeneratePlanWithRetry).toHaveBeenCalled();
    });

    it('should display quality warnings even when gate passes', async () => {
      mockGateService.checkPostGeneration.mockReturnValue({
        blocking: false,
        message: 'Post-generation gate passed',
        issues: [
          'Task "task-1" has short description (45 chars)',
          'Task "task-2" has zero dependencies',
        ],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      // Should still succeed but display warnings
      expect(mockGateService.checkPostGeneration).toHaveBeenCalled();
    });
  });

  describe('Gate bypass with --skip-gates', () => {
    it('should bypass both gates when skipGates=true', async () => {
      // Set up gates to block normally
      mockGateService.checkPreGeneration.mockReturnValue({
        blocking: true,
        message: 'Would block normally',
        issues: ['Open question'],
      });
      mockGateService.checkPostGeneration.mockReturnValue({
        blocking: true,
        message: 'Would block normally',
        issues: ['XL task'],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: true,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);

      // When skipGates is used, the gate service should return blocking:false
      // So we need to fix the mock to respect skipGates
      mockGateService.checkPreGeneration.mockImplementation((_content, opts) => {
        if (opts?.skipGates === true) {
          return { blocking: false, message: 'Gate skipped', issues: [] };
        }
        return { blocking: true, message: 'Would block', issues: ['Open question'] };
      });
      mockGateService.checkPostGeneration.mockImplementation((_plan, opts) => {
        if (opts?.skipGates === true) {
          return { blocking: false, message: 'Gate skipped', issues: [] };
        }
        return { blocking: true, message: 'Would block', issues: ['XL task'] };
      });

      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockGateService.checkPreGeneration).toHaveBeenCalledWith(expect.any(String), {
        skipGates: true,
      });
      expect(mockGateService.checkPostGeneration).toHaveBeenCalledWith(expect.any(Object), {
        skipGates: true,
      });
    });
  });

  describe('Existing functionality preservation', () => {
    it('should still handle plan generation errors', async () => {
      mockGeneratePlanWithRetry.mockRejectedValue(new Error('Agent failed'));

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should still validate plan structure when result.success=false', async () => {
      mockGeneratePlanWithRetry.mockResolvedValue({
        plan: mockPlan,
        success: false, // Validation failed
        attempts: 3,
        conflicts: [],
      });

      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should use targetDir when provided', async () => {
      const options: DecomposeCommandOptions = {
        spec: 'test-spec.md',
        agent: 'claude',
        targetDir: '/custom/target/dir',
        skipGates: false,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new DecomposeCommand(deps);
      await command.execute(options);

      expect(mockGeneratePlanWithRetry).toHaveBeenCalledWith(
        mockAgent,
        expect.any(String),
        '/custom/target/dir',
        expect.any(Object),
      );
    });
  });
});
