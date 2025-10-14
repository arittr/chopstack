import type { SimpleGit } from 'simple-git';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { TaskTransitionManager } from '@/core/execution/task-transitions';
import { ExecuteModeHandlerImpl } from '@/services/execution/modes/execute-mode-handler';
import { MockTaskExecutionAdapter } from '@/services/orchestration/adapters/mock-task-execution-adapter';
import { TaskOrchestrator } from '@/services/orchestration/task-orchestrator';
import { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

describe('Parallel Execution Integration', () => {
  let git: SimpleGit;
  let testDir: string;
  let executeModeHandler: ExecuteModeHandlerImpl;
  let vcsEngine: VcsEngineServiceImpl;
  let mockOrchestrator: TaskOrchestrator;

  const { getGit, getTmpDir } = setupGitTest('parallel-execution');

  beforeEach(async () => {
    git = getGit();
    testDir = getTmpDir();

    // Initialize git-spice
    try {
      await execa('gs', ['repo', 'init'], { cwd: testDir });
      logger.info('Git-spice initialized successfully');
    } catch (error) {
      logger.warn(`Git-spice initialization failed (may not be installed): ${String(error)}`);
    }

    // Set up VCS engine with proper config
    const vcsConfig = {
      branchPrefix: 'chopstack/',
      cleanupOnSuccess: true,
      cleanupOnFailure: false,
      conflictStrategy: 'auto' as const,
      shadowPath: '.chopstack/shadows',
      stackSubmission: {
        enabled: true,
        autoMerge: false,
        draft: false,
      },
    };

    vcsEngine = new VcsEngineServiceImpl(vcsConfig);

    // Create mock orchestrator that simulates file changes
    const mockAdapter = new MockTaskExecutionAdapter();
    mockOrchestrator = new TaskOrchestrator(mockAdapter);

    // Configure mock to make specific file changes for each task
    vi.spyOn(mockAdapter, 'executeTask').mockImplementation(async (request, emitUpdate) => {
      const workdir = request.workdir ?? testDir;
      logger.info(`Mock executing task ${request.taskId} in ${workdir}`);

      // Simulate async work
      await Promise.resolve();

      // Emit running status
      emitUpdate({
        taskId: request.taskId,
        type: 'status',
        data: 'running',
        timestamp: new Date(),
      });

      // Ensure workdir exists
      if (!fs.existsSync(workdir)) {
        logger.info(`Creating workdir: ${workdir}`);
        fs.mkdirSync(workdir, { recursive: true });
      }

      // Simulate different file changes based on task ID
      switch (request.taskId) {
        case 'task-foundation': {
          const filePath = path.join(workdir, 'foundation.ts');
          fs.writeFileSync(filePath, 'export const foundation = true;\n');
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-feature-a': {
          const filePath = path.join(workdir, 'feature-a.ts');
          fs.writeFileSync(
            filePath,
            'import { foundation } from "./foundation";\nexport const featureA = foundation;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-feature-b': {
          const filePath = path.join(workdir, 'feature-b.ts');
          fs.writeFileSync(
            filePath,
            'import { foundation } from "./foundation";\nexport const featureB = foundation;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-integration': {
          const filePath = path.join(workdir, 'integration.ts');
          fs.writeFileSync(
            filePath,
            'import { featureA } from "./feature-a";\nimport { featureB } from "./feature-b";\nexport const integration = featureA && featureB;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        default: {
          // Handle any other tasks
          const filePath = path.join(workdir, `${request.taskId}.ts`);
          fs.writeFileSync(filePath, `export const ${request.taskId} = true;\n`);
          logger.info(`Created file: ${filePath}`);
          break;
        }
      }

      // Emit completion status
      emitUpdate({
        taskId: request.taskId,
        type: 'status',
        data: 'completed',
        timestamp: new Date(),
      });

      return {
        taskId: request.taskId,
        status: 'completed' as const,
        output: `Successfully executed ${request.taskId}`,
        mode: request.mode,
      };
    });

    const vcsStrategyFactory = new VcsStrategyFactory(vcsEngine);
    const transitionManager = new TaskTransitionManager();

    executeModeHandler = new ExecuteModeHandlerImpl(
      mockOrchestrator,
      vcsStrategyFactory,
      transitionManager,
    );
  });

  it('should handle parallel execution with complex dependencies in stacked mode', async () => {
    // This test creates a simplified DAG where:
    // - task-foundation has no dependencies (runs first)
    // - task-feature-a and task-feature-b depend on foundation (run in parallel)
    // - task-integration depends on both features (runs last)

    const plan: PlanV2 = {
      name: 'Parallel Execution Test',
      strategy: 'parallel',
      tasks: [
        {
          id: 'task-foundation',
          name: 'Create Foundation',
          complexity: 'S',
          description: 'Base functionality that other features depend on',
          files: ['foundation.ts'],
          acceptanceCriteria: [],
          dependencies: [], // No dependencies
        },
        {
          id: 'task-feature-a',
          name: 'Create Feature A',
          complexity: 'S',
          description: 'Feature A that depends on foundation',
          files: ['feature-a.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-foundation'], // Depends on foundation
        },
        {
          id: 'task-feature-b',
          name: 'Create Feature B',
          complexity: 'S',
          description: 'Feature B that depends on foundation',
          files: ['feature-b.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-foundation'], // Depends on foundation
        },
        {
          id: 'task-integration',
          name: 'Create Integration',
          complexity: 'S',
          description: 'Integration layer that uses both features',
          files: ['integration.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-feature-a', 'task-feature-b'], // Depends on both features
        },
      ],
    };

    const context: ExecutionContext = {
      vcsMode: 'stacked', // Use stacked branches to test cumulative functionality
      continueOnError: false,
      cwd: testDir,
      dryRun: false,
      maxRetries: 3,
      verbose: true,
      parentRef: 'main',
      agentType: 'mock',
    };

    // Execute the plan
    logger.info('Starting parallel execution test...');
    const result = await executeModeHandler.handle(plan.tasks, context);

    logger.info(`Parallel execution result: ${JSON.stringify(result, null, 2)}`);

    // Verify execution succeeded
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(4);
    expect(result.tasks.every((t) => t.status === 'success')).toBe(true);
    expect(result.branches).toHaveLength(4);
    expect(result.commits).toHaveLength(4);

    // Verify branches were created
    const branches = await git.branch();
    expect(branches.all).toContain('chopstack/task-foundation');
    expect(branches.all).toContain('chopstack/task-feature-a');
    expect(branches.all).toContain('chopstack/task-feature-b');
    expect(branches.all).toContain('chopstack/task-integration');

    // Verify completion-order stacking - each branch contains cumulative changes in completion order

    // Foundation branch - just foundation.ts (first to complete)
    await git.checkout('chopstack/task-foundation');
    const foundationFiles = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(foundationFiles).toContain('foundation.ts');
    expect(foundationFiles).not.toContain('feature-a.ts');
    expect(foundationFiles).not.toContain('feature-b.ts');

    // Get all branch names to determine completion order
    const allBranches = await git.branch();
    const stackBranches = allBranches.all.filter((b) => b.startsWith('chopstack/task-'));
    logger.info(`Stack branches found: ${stackBranches.join(', ')}`);

    // In completion-order stacking, each branch builds on the previous one in completion order
    // We need to check the actual completion order rather than assume it

    // Sort branches to find completion order
    const featureBranches = stackBranches.filter(
      (b) => b.includes('feature-a') || b.includes('feature-b'),
    );

    // For each feature branch, check what files it contains to understand completion order
    const branchContents = new Map<string, string[]>();
    for (const branch of featureBranches) {
      await git.checkout(branch);
      const files = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
      const filesList = files.trim().split('\n').filter(Boolean);
      branchContents.set(branch, filesList);
      logger.info(`Branch ${branch} contains: ${filesList.join(', ')}`);
    }

    // Find which branch has only its own feature (first to complete)
    const firstBranch = featureBranches.find((branch) => {
      const files = branchContents.get(branch) ?? [];
      const hasFeatureA = files.includes('feature-a.ts');
      const hasFeatureB = files.includes('feature-b.ts');
      return hasFeatureA !== hasFeatureB; // Has exactly one feature file
    });

    // Find which branch has both features (second to complete)
    const secondBranch = featureBranches.find((branch) => {
      const files = branchContents.get(branch) ?? [];
      const hasFeatureA = files.includes('feature-a.ts');
      const hasFeatureB = files.includes('feature-b.ts');
      return hasFeatureA && hasFeatureB; // Has both feature files
    });

    // Test first branch (should have foundation + only its own feature)
    if (firstBranch !== undefined) {
      const firstFiles = branchContents.get(firstBranch) ?? [];
      expect(firstFiles).toContain('foundation.ts');

      if (firstBranch.includes('feature-a')) {
        expect(firstFiles).toContain('feature-a.ts');
        expect(firstFiles).not.toContain('feature-b.ts');
      } else {
        expect(firstFiles).toContain('feature-b.ts');
        expect(firstFiles).not.toContain('feature-a.ts');
      }
    }

    // Test second branch (should have foundation + both features)
    if (secondBranch !== undefined) {
      const secondFiles = branchContents.get(secondBranch) ?? [];
      expect(secondFiles).toContain('foundation.ts');
      expect(secondFiles).toContain('feature-a.ts');
      expect(secondFiles).toContain('feature-b.ts');
    }

    // Integration branch - builds on the stack of all previous tasks
    const integrationBranch = stackBranches.find((b) => b.includes('integration'));
    if (integrationBranch !== undefined) {
      await git.checkout(integrationBranch);
      const integrationFiles = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
      expect(integrationFiles).toContain('foundation.ts'); // All previous changes
      expect(integrationFiles).toContain('feature-a.ts');
      expect(integrationFiles).toContain('feature-b.ts');
      expect(integrationFiles).toContain('integration.ts'); // Plus integration
    }
  }, 120_000); // 120 second timeout

  it('should handle worktree mode with parallel task execution', async () => {
    // Test parallel execution using worktree mode instead of stacked mode
    const plan: PlanV2 = {
      name: 'Worktree Parallel Test',
      strategy: 'parallel',
      tasks: [
        {
          id: 'task-foundation',
          name: 'Create Foundation',
          complexity: 'S',
          description: 'Base functionality',
          files: ['foundation.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-feature-a',
          name: 'Create Feature A',
          complexity: 'S',
          description: 'Feature A',
          files: ['feature-a.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-foundation'],
        },
        {
          id: 'task-feature-b',
          name: 'Create Feature B',
          complexity: 'S',
          description: 'Feature B',
          files: ['feature-b.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-foundation'],
        },
      ],
    };

    const context: ExecutionContext = {
      vcsMode: 'worktree', // Use worktree mode
      continueOnError: false,
      cwd: testDir,
      dryRun: false,
      maxRetries: 3,
      verbose: true,
      parentRef: 'main',
      agentType: 'mock',
    };

    // Execute the plan
    const result = await executeModeHandler.handle(plan.tasks, context);

    // Verify execution succeeded
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks.every((t) => t.status === 'success')).toBe(true);

    // In worktree mode, each task should have its own branch
    expect(result.branches).toHaveLength(3);
    expect(result.commits).toHaveLength(3);

    // Verify branches were created
    const branches = await git.branch();

    // Debug: Log actual branches to understand naming convention
    console.log('Actual branches created:', branches.all);

    // Worktree mode may use tmp-chopstack prefix
    const taskBranches = branches.all.filter(
      (b) => b.startsWith('tmp-chopstack/') || b.startsWith('chopstack/'),
    );

    // Should have 3 task branches
    expect(taskBranches).toHaveLength(3);

    // Verify each task has a branch (may be with tmp- prefix)
    const hasFoundation = taskBranches.some((b) => b.includes('task-foundation'));
    const hasFeatureA = taskBranches.some((b) => b.includes('task-feature-a'));
    const hasFeatureB = taskBranches.some((b) => b.includes('task-feature-b'));

    expect(hasFoundation).toBe(true);
    expect(hasFeatureA).toBe(true);
    expect(hasFeatureB).toBe(true);
  }, 60_000); // 60 second timeout

  it('should handle error conditions gracefully in parallel execution', async () => {
    // Create a plan where one task will fail
    const plan: PlanV2 = {
      name: 'Error Handling Test',
      strategy: 'parallel',
      tasks: [
        {
          id: 'task-foundation',
          name: 'Create Foundation',
          complexity: 'S',
          description: 'Base functionality',
          files: ['foundation.ts'],
          acceptanceCriteria: [],
          dependencies: [],
        },
        {
          id: 'task-failing',
          name: 'Failing Task',
          complexity: 'S',
          description: 'This task will fail',
          files: ['failing.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-foundation'],
        },
        {
          id: 'task-dependent',
          name: 'Dependent Task',
          complexity: 'S',
          description: 'This task depends on the failing task',
          files: ['dependent.ts'],
          acceptanceCriteria: [],
          dependencies: ['task-failing'],
        },
      ],
    };

    // Configure the mock to fail for task-failing
    const mockAdapter = new MockTaskExecutionAdapter();
    const failingOrchestrator = new TaskOrchestrator(mockAdapter);

    vi.spyOn(mockAdapter, 'executeTask').mockImplementation(async (request, emitUpdate) => {
      // Simulate async work
      await Promise.resolve();

      if (request.taskId === 'task-failing') {
        emitUpdate({
          taskId: request.taskId,
          type: 'status',
          data: 'running',
          timestamp: new Date(),
        });

        emitUpdate({
          taskId: request.taskId,
          type: 'status',
          data: 'failed',
          timestamp: new Date(),
        });

        return {
          taskId: request.taskId,
          status: 'failed' as const,
          output: 'Task failed intentionally for testing',
          mode: request.mode,
        };
      }

      // Other tasks succeed
      const workdir = request.workdir ?? testDir;
      if (!fs.existsSync(workdir)) {
        fs.mkdirSync(workdir, { recursive: true });
      }

      if (request.taskId === 'task-foundation') {
        const filePath = path.join(workdir, 'foundation.ts');
        fs.writeFileSync(filePath, 'export const foundation = true;\n');
      } else {
        const filePath = path.join(workdir, `${request.taskId}.ts`);
        fs.writeFileSync(filePath, `export const ${request.taskId} = true;\n`);
      }

      emitUpdate({
        taskId: request.taskId,
        type: 'status',
        data: 'completed',
        timestamp: new Date(),
      });

      return {
        taskId: request.taskId,
        status: 'completed' as const,
        output: `Successfully executed ${request.taskId}`,
        mode: request.mode,
      };
    });

    const vcsStrategyFactory = new VcsStrategyFactory(vcsEngine);
    const transitionManager = new TaskTransitionManager();
    const failingExecuteHandler = new ExecuteModeHandlerImpl(
      failingOrchestrator,
      vcsStrategyFactory,
      transitionManager,
    );

    const context: ExecutionContext = {
      vcsMode: 'stacked',
      continueOnError: false, // Don't continue on error
      cwd: testDir,
      dryRun: false,
      maxRetries: 1, // Limited retries for faster test
      verbose: true,
      parentRef: 'main',
      agentType: 'mock',
    };

    // Execute the plan
    const result = await failingExecuteHandler.handle(plan.tasks, context);

    // Verify that foundation succeeded, failing task failed
    // Note: dependent task may not be included if it was blocked and never queued
    expect(result).toBeDefined();
    expect(result.tasks.length).toBeGreaterThanOrEqual(2);

    const foundationResult = result.tasks.find((t) => t.taskId === 'task-foundation');
    const failingResult = result.tasks.find((t) => t.taskId === 'task-failing');
    const dependentResult = result.tasks.find((t) => t.taskId === 'task-dependent');

    expect(foundationResult?.status).toBe('success');
    expect(failingResult?.status).toBe('failure');

    // If dependent task is included, it should be skipped
    if (isNonNullish(dependentResult)) {
      expect(dependentResult.status).toBe('skipped');
    }

    // Only foundation should have been committed
    expect(result.branches).toHaveLength(1);
    expect(result.commits).toHaveLength(1);
  }, 15_000); // 15 second timeout
});
