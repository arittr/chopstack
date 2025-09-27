import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { execa } from 'execa';
import simpleGit, { type SimpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { Plan } from '@/types/decomposer';

import { TaskTransitionManager } from '@/core/execution/task-transitions';
import { ExecuteModeHandlerImpl } from '@/services/execution/modes/execute-mode-handler';
import { MockTaskExecutionAdapter } from '@/services/orchestration/adapters/mock-task-execution-adapter';
import { TaskOrchestrator } from '@/services/orchestration/task-orchestrator';
import { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

describe('Parallel Execution Integration', () => {
  let testDir: string;
  let git: SimpleGit;
  let executeModeHandler: ExecuteModeHandlerImpl;
  let vcsEngine: VcsEngineServiceImpl;
  let mockOrchestrator: TaskOrchestrator;

  afterEach(async () => {
    // Clean up test directory and any worktrees
    if (testDir !== '' && fs.existsSync(testDir)) {
      try {
        // First try to remove any git worktrees
        const git = simpleGit(testDir);
        const worktrees = await git.raw(['worktree', 'list', '--porcelain']);
        const worktreePaths = worktrees
          .split('\n')
          .filter((line) => line.startsWith('worktree '))
          .map((line) => line.slice('worktree '.length))
          .filter((path) => path !== testDir); // Don't try to remove main worktree

        for (const worktreePath of worktreePaths) {
          try {
            await git.raw(['worktree', 'remove', worktreePath, '--force']);
          } catch {
            // Ignore errors, we'll clean up the directory anyway
          }
        }

        // Also clean up any test branches
        try {
          const branches = await git.branch();
          const testBranches = branches.all.filter(
            (b) => b.startsWith('chopstack/') || b.startsWith('tmp-chopstack/'),
          );
          for (const branch of testBranches) {
            try {
              await git.deleteLocalBranch(branch, true);
            } catch {
              // Ignore branch deletion errors
            }
          }
        } catch {
          // Ignore branch listing errors
        }
      } catch {
        // Ignore git errors if the repo is corrupted
      }

      // Now remove the entire directory
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = '';

    // Clean up any leftover test directories from previous runs
    try {
      const tmpDir = os.tmpdir();
      const entries = fs.readdirSync(tmpDir);
      const oldTestDirs = entries.filter((e) => e.startsWith('chopstack-parallel-test-'));
      for (const dir of oldTestDirs) {
        const fullPath = path.join(tmpDir, dir);
        if (fs.existsSync(fullPath)) {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    } catch {
      // Ignore errors cleaning old test dirs
    }
  });

  beforeEach(async () => {
    // Create a temporary directory for the test with a unique name
    testDir = path.join(
      os.tmpdir(),
      `chopstack-parallel-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    // Ensure the directory doesn't exist before creating it
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    fs.mkdirSync(testDir, { recursive: true });

    // Initialize git repository
    git = simpleGit(testDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');

    // Create initial commit
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project\n');
    await git.add('.');
    await git.commit('Initial commit');

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
      let filePath: string;
      switch (request.taskId) {
        case 'task-foundation': {
          filePath = path.join(workdir, 'foundation.ts');
          fs.writeFileSync(filePath, 'export const foundation = true;\n');
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-feature-a': {
          filePath = path.join(workdir, 'feature-a.ts');
          fs.writeFileSync(
            filePath,
            'import { foundation } from "./foundation";\nexport const featureA = foundation;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-feature-b': {
          filePath = path.join(workdir, 'feature-b.ts');
          fs.writeFileSync(
            filePath,
            'import { foundation } from "./foundation";\nexport const featureB = foundation;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-integration': {
          filePath = path.join(workdir, 'integration.ts');
          fs.writeFileSync(
            filePath,
            'import { featureA } from "./feature-a";\nimport { featureB } from "./feature-b";\nexport const integration = featureA && featureB;\n',
          );
          logger.info(`Created file: ${filePath}`);
          break;
        }
        default: {
          // Handle any other tasks
          filePath = path.join(workdir, `${request.taskId}.ts`);
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

    const plan: Plan = {
      tasks: [
        {
          id: 'task-foundation',
          title: 'Create Foundation',
          description: 'Base functionality that other features depend on',
          touches: [],
          produces: ['foundation.ts'],
          requires: [], // No dependencies
          estimatedLines: 20,
          agentPrompt: 'Create foundation.ts with base functionality',
        },
        {
          id: 'task-feature-a',
          title: 'Create Feature A',
          description: 'Feature A that depends on foundation',
          touches: [],
          produces: ['feature-a.ts'],
          requires: ['task-foundation'], // Depends on foundation
          estimatedLines: 30,
          agentPrompt: 'Create feature-a.ts that uses foundation',
        },
        {
          id: 'task-feature-b',
          title: 'Create Feature B',
          description: 'Feature B that depends on foundation',
          touches: [],
          produces: ['feature-b.ts'],
          requires: ['task-foundation'], // Depends on foundation
          estimatedLines: 30,
          agentPrompt: 'Create feature-b.ts that uses foundation',
        },
        {
          id: 'task-integration',
          title: 'Create Integration',
          description: 'Integration layer that uses both features',
          touches: [],
          produces: ['integration.ts'],
          requires: ['task-feature-a', 'task-feature-b'], // Depends on both features
          estimatedLines: 25,
          agentPrompt: 'Create integration.ts that combines features',
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
    const plan: Plan = {
      tasks: [
        {
          id: 'task-foundation',
          title: 'Create Foundation',
          description: 'Base functionality',
          touches: [],
          produces: ['foundation.ts'],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Create foundation.ts',
        },
        {
          id: 'task-feature-a',
          title: 'Create Feature A',
          description: 'Feature A',
          touches: [],
          produces: ['feature-a.ts'],
          requires: ['task-foundation'],
          estimatedLines: 30,
          agentPrompt: 'Create feature-a.ts',
        },
        {
          id: 'task-feature-b',
          title: 'Create Feature B',
          description: 'Feature B',
          touches: [],
          produces: ['feature-b.ts'],
          requires: ['task-foundation'],
          estimatedLines: 30,
          agentPrompt: 'Create feature-b.ts',
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
    const plan: Plan = {
      tasks: [
        {
          id: 'task-foundation',
          title: 'Create Foundation',
          description: 'Base functionality',
          touches: [],
          produces: ['foundation.ts'],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Create foundation.ts',
        },
        {
          id: 'task-failing',
          title: 'Failing Task',
          description: 'This task will fail',
          touches: [],
          produces: ['failing.ts'],
          requires: ['task-foundation'],
          estimatedLines: 30,
          agentPrompt: 'This task will fail',
        },
        {
          id: 'task-dependent',
          title: 'Dependent Task',
          description: 'This task depends on the failing task',
          touches: [],
          produces: ['dependent.ts'],
          requires: ['task-failing'],
          estimatedLines: 25,
          agentPrompt: 'Create dependent.ts',
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

      let filePath: string;
      if (request.taskId === 'task-foundation') {
        filePath = path.join(workdir, 'foundation.ts');
        fs.writeFileSync(filePath, 'export const foundation = true;\n');
      } else {
        filePath = path.join(workdir, `${request.taskId}.ts`);
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
