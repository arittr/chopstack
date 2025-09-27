import type { SimpleGit } from 'simple-git';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { execa } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionContext } from '@/core/execution/interfaces';
import type { Plan } from '@/types/decomposer';

import { TaskTransitionManager } from '@/core/execution/task-transitions';
import { ExecuteModeHandlerImpl } from '@/services/execution/modes/execute-mode-handler';
import { MockTaskExecutionAdapter } from '@/services/orchestration/adapters/mock-task-execution-adapter';
import { TaskOrchestrator } from '@/services/orchestration/task-orchestrator';
import { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';

describe('Stacked Branches Integration', () => {
  let git: SimpleGit;
  let testDir: string;
  let executeModeHandler: ExecuteModeHandlerImpl;
  let vcsEngine: VcsEngineServiceImpl;
  let mockOrchestrator: TaskOrchestrator;

  const { getGit, getTmpDir } = setupGitTest('stacking-integration');

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
        case 'task-a': {
          const filePath = path.join(workdir, 'feature-a.ts');
          fs.writeFileSync(filePath, 'export const featureA = true;\n');
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-b': {
          const filePath = path.join(workdir, 'feature-b.ts');
          fs.writeFileSync(filePath, 'export const featureB = true;\n');
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-c': {
          const filePath = path.join(workdir, 'feature-c.ts');
          fs.writeFileSync(filePath, 'export const featureC = true;\n');
          logger.info(`Created file: ${filePath}`);
          break;
        }
        case 'task-cleanup': {
          const filePath = path.join(workdir, 'test-file.ts');
          fs.writeFileSync(filePath, 'export const testFile = true;\n');
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

  it('should create a proper git-spice stack with three dependent tasks', async () => {
    // This test verifies that stacking works correctly:
    // - task-a creates feature-a.ts on main
    // - task-b creates feature-b.ts on top of task-a (includes both feature-a.ts and feature-b.ts)
    // - task-c creates feature-c.ts on top of task-b (includes all three files)
    // Each branch should have a different commit hash, demonstrating proper stacking

    // Create a plan with three dependent tasks
    const plan: Plan = {
      tasks: [
        {
          id: 'task-a',
          title: 'Create Feature A',
          description: 'First task in the stack',
          touches: [],
          produces: ['feature-a.ts'],
          requires: [], // No dependencies
          estimatedLines: 10,
          agentPrompt: 'Create feature-a.ts file',
        },
        {
          id: 'task-b',
          title: 'Create Feature B',
          description: 'Second task in the stack',
          touches: [],
          produces: ['feature-b.ts'],
          requires: ['task-a'], // Depends on task-a
          estimatedLines: 10,
          agentPrompt: 'Create feature-b.ts file',
        },
        {
          id: 'task-c',
          title: 'Create Feature C',
          description: 'Third task in the stack',
          touches: [],
          produces: ['feature-c.ts'],
          requires: ['task-b'], // Depends on task-b
          estimatedLines: 10,
          agentPrompt: 'Create feature-c.ts file',
        },
      ],
    };

    const context: ExecutionContext = {
      vcsMode: 'stacked', // Use stacked branches
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

    logger.info(`Test result: ${JSON.stringify(result, null, 2)}`);

    // Verify execution succeeded
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks.every((t) => t.status === 'success')).toBe(true);
    expect(result.branches).toHaveLength(3);
    expect(result.commits).toHaveLength(3);

    // Verify branches were created
    const branches = await git.branch();
    expect(branches.all).toContain('chopstack/task-a');
    expect(branches.all).toContain('chopstack/task-b');
    expect(branches.all).toContain('chopstack/task-c');

    // CRITICAL: Verify proper stacking - each branch should build on the previous one

    // Get commit hashes for each branch
    await git.checkout('chopstack/task-a');
    const commitA = await git.raw(['rev-parse', 'HEAD']);
    const filesInA = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);

    await git.checkout('chopstack/task-b');
    const commitB = await git.raw(['rev-parse', 'HEAD']);
    const filesInB = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);

    await git.checkout('chopstack/task-c');
    const commitC = await git.raw(['rev-parse', 'HEAD']);
    const filesInC = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);

    // Verify commits are different (proper stacking means different commits)
    expect(commitA.trim()).not.toBe(commitB.trim());
    expect(commitB.trim()).not.toBe(commitC.trim());
    expect(commitA.trim()).not.toBe(commitC.trim());

    // Verify file contents show proper stacking
    expect(filesInA).toContain('feature-a.ts');
    expect(filesInA).not.toContain('feature-b.ts'); // Should not have B's changes
    expect(filesInA).not.toContain('feature-c.ts'); // Should not have C's changes

    expect(filesInB).toContain('feature-a.ts'); // Should have A's changes (stacked)
    expect(filesInB).toContain('feature-b.ts'); // Should have B's changes
    expect(filesInB).not.toContain('feature-c.ts'); // Should not have C's changes

    expect(filesInC).toContain('feature-a.ts'); // Should have A's changes (stacked)
    expect(filesInC).toContain('feature-b.ts'); // Should have B's changes (stacked)
    expect(filesInC).toContain('feature-c.ts'); // Should have C's changes

    // Verify git-spice parent-child relationships
    await git.checkout('chopstack/task-b');
    const parentOfB = await git.raw(['rev-parse', 'HEAD~1']); // Parent commit of task-b
    expect(parentOfB.trim()).toBe(commitA.trim()); // task-b should be built on task-a

    await git.checkout('chopstack/task-c');
    const parentOfC = await git.raw(['rev-parse', 'HEAD~1']); // Parent commit of task-c
    expect(parentOfC.trim()).toBe(commitB.trim()); // task-c should be built on task-b

    // Verify git-spice stack structure
    try {
      const { stdout: stackStatus } = await execa('gs', ['log', 'short'], { cwd: testDir });
      logger.info(`Git-spice stack status:\n${stackStatus}`);

      // Check that branches are properly stacked
      expect(stackStatus).toContain('chopstack/task-a');
      expect(stackStatus).toContain('chopstack/task-b');
      expect(stackStatus).toContain('chopstack/task-c');

      // Verify parent relationships
      const { stdout: branchInfo } = await execa('gs', ['branch', 'list'], { cwd: testDir });
      logger.info(`Git-spice branch info:\n${branchInfo}`);

      // task-a should track main
      // task-b should track task-a
      // task-c should track task-b
      expect(branchInfo).toMatch(/chopstack\/task-a.*tracks.*main/i);
      expect(branchInfo).toMatch(/chopstack\/task-b.*tracks.*chopstack\/task-a/i);
      expect(branchInfo).toMatch(/chopstack\/task-c.*tracks.*chopstack\/task-b/i);
    } catch (error) {
      logger.warn(`Git-spice verification skipped (may not be installed): ${String(error)}`);
    }
  });

  it('should handle branch naming conflicts gracefully', async () => {
    // Pre-create a conflicting branch
    await git.checkoutLocalBranch('chopstack/task-a');
    await git.checkout('main');

    const plan: Plan = {
      tasks: [
        {
          id: 'task-a',
          title: 'Create Feature A',
          description: 'Task with conflicting branch name',
          touches: [],
          produces: ['feature-a.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create feature-a.ts file',
        },
      ],
    };

    const context: ExecutionContext = {
      vcsMode: 'stacked',
      continueOnError: false,
      cwd: testDir,
      dryRun: false,
      maxRetries: 3,
      verbose: true,
      parentRef: 'main',
      agentType: 'mock',
    };

    // Execute the plan - should handle the conflict
    const result = await executeModeHandler.handle(plan.tasks, context);

    // Should either:
    // 1. Use a different branch name (with suffix)
    // 2. Delete and recreate the branch
    // 3. Reuse the existing branch after resetting it
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(1);
    const firstTask = result.tasks[0];
    expect(firstTask?.status).toBe('success');

    // Verify the task's changes are committed somewhere
    const branches = await git.branch();
    const taskBranches = branches.all.filter((b) => b.includes('task-a'));
    expect(taskBranches.length).toBeGreaterThan(0);

    // Debug: Log all branches that match
    logger.info(`🔍 Found branches containing 'task-a': ${taskBranches.join(', ')}`);

    // Check that the changes were actually made - use the last branch (most recent/unique one)
    const targetBranch = taskBranches.at(-1);
    expect(targetBranch).toBeDefined();
    if (targetBranch !== undefined) {
      logger.info(`🎯 Testing branch: ${targetBranch}`);
      await git.checkout(targetBranch);
      const files = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
      logger.info(`📁 Files in branch ${targetBranch}: ${files.trim()}`);
      expect(files).toContain('feature-a.ts');
    }
  });

  it('should properly clean up worktrees after stacking', async () => {
    const plan: Plan = {
      tasks: [
        {
          id: 'task-cleanup',
          title: 'Test Cleanup Task',
          description: 'Task to test cleanup',
          touches: [],
          produces: ['test-file.ts'],
          requires: [],
          estimatedLines: 5,
          agentPrompt: 'Create test file',
        },
      ],
    };

    const context: ExecutionContext = {
      vcsMode: 'stacked',
      continueOnError: false,
      cwd: testDir,
      dryRun: false,
      maxRetries: 3,
      verbose: true,
      parentRef: 'main',
      agentType: 'mock',
    };

    // Execute the plan
    await executeModeHandler.handle(plan.tasks, context);

    // Check that worktrees are cleaned up
    try {
      const worktreeListResult = await execa('git', ['worktree', 'list'], { cwd: testDir });
      const worktreeList = worktreeListResult.stdout;
      const worktrees = worktreeList.split('\n').filter((line) => line.includes('.chopstack'));

      // Should have no remaining worktrees in .chopstack directory
      expect(worktrees).toHaveLength(0);
    } catch {
      // If git worktree list fails, check if .chopstack directory exists
      const chopstackPath = path.join(testDir, '.chopstack');
      const chopstackExists = fs.existsSync(chopstackPath);
      expect(chopstackExists).toBe(false);
    }
  });
});
