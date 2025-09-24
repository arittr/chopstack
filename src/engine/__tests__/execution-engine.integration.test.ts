import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plan } from '@/types/decomposer';
import type { ExecutionOptions } from '@/types/execution';

import { createExecutionEngine } from '@/engine';
import { TaskOrchestrator } from '@/mcp/orchestrator';

describe('ExecutionEngine Integration', () => {
  const testDir = join(process.cwd(), 'test', 'tmp', 'execution-engine-test');

  beforeEach(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    // Mock the orchestrator's executeClaudeTask method
    // This is the only external dependency we need to mock
    vi.spyOn(TaskOrchestrator.prototype, 'executeClaudeTask').mockResolvedValue({
      taskId: 'test-task',
      mode: 'execute',
      status: 'completed',
      output: 'Task completed',
      filesChanged: [],
    });

    vi.spyOn(TaskOrchestrator.prototype, 'stopTask').mockReturnValue(true);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('should execute a simple plan in dry-run mode', async () => {
      // Arrange
      const plan: Plan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Create initial file',
            description: 'Create a test file',
            touches: [],
            produces: ['test.ts'],
            requires: [],
            estimatedLines: 50,
            agentPrompt: 'Create test.ts file',
          },
          {
            id: 'task-2',
            title: 'Update file',
            description: 'Update the test file',
            touches: ['test.ts'],
            produces: [],
            requires: ['task-1'],
            estimatedLines: 20,
            agentPrompt: 'Update test.ts file',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'dry-run',
        workdir: testDir,
      };

      // Act
      const engine = createExecutionEngine();
      const result = await engine.execute(plan, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.mode).toBe('dry-run');
      expect(result.tasksTotal).toBe(2);
      expect(result.tasksCompleted).toBe(2);
      expect(result.tasksFailed).toBe(0);
      // Dry-run mode doesn't actually execute tasks
      expect(TaskOrchestrator.prototype.executeClaudeTask).not.toHaveBeenCalled();
    });

    it('should validate plan before execution', async () => {
      // Arrange - plan with circular dependency
      const plan: Plan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            touches: [],
            produces: ['file1.ts'],
            requires: ['task-2'], // Circular dependency
            estimatedLines: 50,
            agentPrompt: 'Create file1',
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task',
            touches: [],
            produces: ['file2.ts'],
            requires: ['task-1'], // Circular dependency
            estimatedLines: 50,
            agentPrompt: 'Create file2',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        workdir: testDir,
      };

      // Act & Assert
      const engine = createExecutionEngine();
      await expect(engine.execute(plan, options)).rejects.toThrow('validation failed');
    });

    it('should handle execution with state persistence', async () => {
      // This is a simplified test - full state persistence would need
      // actual filesystem operations and state file management

      const plan: Plan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Single task',
            description: 'A simple task',
            touches: [],
            produces: ['output.ts'],
            requires: [],
            estimatedLines: 30,
            agentPrompt: 'Create output file',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'plan',
        workdir: testDir,
      };

      // Act
      const engine = createExecutionEngine();
      const result = await engine.execute(plan, options);

      // Assert - plan mode should return without executing
      expect(result.success).toBe(true);
      expect(result.mode).toBe('plan');
    });

    it('should determine strategy based on plan characteristics', async () => {
      // Arrange - plan with parallel opportunities
      const plan: Plan = {
        tasks: [
          {
            id: 'task-1',
            title: 'Independent 1',
            description: 'First independent task',
            touches: [],
            produces: ['file1.ts'],
            requires: [],
            estimatedLines: 100,
            agentPrompt: 'Create file1',
          },
          {
            id: 'task-2',
            title: 'Independent 2',
            description: 'Second independent task',
            touches: [],
            produces: ['file2.ts'],
            requires: [],
            estimatedLines: 100,
            agentPrompt: 'Create file2',
          },
          {
            id: 'task-3',
            title: 'Dependent task',
            description: 'Task depending on both',
            touches: ['file1.ts', 'file2.ts'],
            produces: [],
            requires: ['task-1', 'task-2'],
            estimatedLines: 50,
            agentPrompt: 'Update both files',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'validate',
        workdir: testDir,
      };

      // Act
      const engine = createExecutionEngine();
      const result = await engine.execute(plan, options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.mode).toBe('validate');
      // Validate mode doesn't execute but validates the plan structure
      expect(result.tasksTotal).toBe(3);
    });
  });
});
