/**
 * Integration test for file modification validation system
 *
 * Reproduces the original bug (SNU-97) where tasks were modifying files
 * outside their declared scope in stacked execution mode.
 */

import fs from 'node:fs';
import path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { ExecutionTask } from '@/core/execution/types';
import type { VcsStrategyContext } from '@/core/vcs/vcs-strategy';
import type { TaskV2 } from '@/types/schemas-v2';

import { StackedVcsStrategy } from '@/services/vcs/strategies/stacked-vcs-strategy';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';

describe('File Validation Integration', () => {
  const { getGit, getTmpDir } = setupGitTest('file-validation-integration');

  let testDir: string;
  let vcsEngine: VcsEngineServiceImpl;
  let strategy: StackedVcsStrategy;

  beforeEach(async () => {
    testDir = getTmpDir();

    // Create initial files
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'initial content 1\n');
    fs.writeFileSync(path.join(testDir, 'file2.txt'), 'initial content 2\n');
    fs.writeFileSync(path.join(testDir, 'file3.txt'), 'initial content 3\n');

    const git = getGit();
    await git.add('.');
    await git.commit('Initial commit');

    // Initialize VCS engine and strategy
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
    strategy = new StackedVcsStrategy(vcsEngine);
  });

  afterEach(async () => {
    await strategy.cleanup();
  });

  describe('Strict Mode (Default)', () => {
    it('should fail when task modifies file belonging to another task', async () => {
      // Create tasks with clear file boundaries
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Update file1',
          description: 'Update file1.txt only',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['file1.txt updated'],
        },
        {
          id: 'task-2',
          name: 'Update file2',
          description: 'Update file2.txt only',
          files: ['file2.txt'],
          dependencies: ['task-1'], // Depends on task-1
          complexity: 'S',
          acceptanceCriteria: ['file2.txt updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'strict', // Default strict mode
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      // Prepare task-1 for execution
      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      expect(task1Context).toBeDefined();
      expect(task1Context?.absolutePath).toBeDefined();

      // Simulate task-1 execution - VIOLATES by modifying file2.txt (belongs to task-2)
      const task1WorkDir = task1Context!.absolutePath;
      fs.writeFileSync(path.join(task1WorkDir, 'file1.txt'), 'task-1 updated file1\n');
      fs.writeFileSync(path.join(task1WorkDir, 'file2.txt'), 'task-1 VIOLATED file2\n'); // VIOLATION!

      // Attempt to commit - should fail validation
      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // Expect failure due to validation
      expect(result.error).toBeDefined();
      expect(result.error).toContain('File modification validation failed');
      expect(result.commitHash).toBeUndefined();
    });

    it('should succeed when task only modifies its declared files', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Update file1',
          description: 'Update file1.txt only',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['file1.txt updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'strict',
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      expect(task1Context).toBeDefined();

      // Simulate task-1 execution - ONLY modifies its declared file
      const task1WorkDir = task1Context!.absolutePath;
      fs.writeFileSync(path.join(task1WorkDir, 'file1.txt'), 'task-1 updated file1\n');

      // Commit should succeed
      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // Expect success
      expect(result.error).toBeUndefined();
      expect(result.commitHash).toBeDefined();
      expect(result.branchName).toBeDefined();
    });

    it('should detect cross-task contamination in parallel tasks', async () => {
      // Two parallel tasks that should not interfere
      const tasks: TaskV2[] = [
        {
          id: 'task-a',
          name: 'Update file1',
          description: 'Update file1.txt',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['file1.txt updated'],
        },
        {
          id: 'task-b',
          name: 'Update file2',
          description: 'Update file2.txt',
          files: ['file2.txt'],
          dependencies: [], // Parallel, no dependency on task-a
          complexity: 'S',
          acceptanceCriteria: ['file2.txt updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'strict',
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      // Execute task-a first
      const taskAContext = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      const taskAWorkDir = taskAContext!.absolutePath;
      fs.writeFileSync(path.join(taskAWorkDir, 'file1.txt'), 'task-a updated file1\n');

      const resultA = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        taskAContext!,
        'Task A completed',
      );

      expect(resultA.error).toBeUndefined();
      expect(resultA.commitHash).toBeDefined();

      // Now execute task-b, but it violates by modifying file1.txt (belongs to task-a)
      const taskBContext = await strategy.prepareTaskExecution(
        tasks[1]!,
        executionTasks[1]!,
        context,
      );

      const taskBWorkDir = taskBContext!.absolutePath;
      fs.writeFileSync(path.join(taskBWorkDir, 'file2.txt'), 'task-b updated file2\n');
      fs.writeFileSync(path.join(taskBWorkDir, 'file1.txt'), 'task-b VIOLATED file1\n'); // VIOLATION!

      const resultB = await strategy.handleTaskCompletion(
        tasks[1]!,
        executionTasks[1]!,
        taskBContext!,
        'Task B completed',
      );

      // Should fail validation
      expect(resultB.error).toBeDefined();
      expect(resultB.error).toContain('File modification validation failed');
    });
  });

  describe('Permissive Mode', () => {
    it('should warn but continue when task modifies file belonging to another task', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Update file1',
          description: 'Update file1.txt only',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['file1.txt updated'],
        },
        {
          id: 'task-2',
          name: 'Update file2',
          description: 'Update file2.txt only',
          files: ['file2.txt'],
          dependencies: ['task-1'],
          complexity: 'S',
          acceptanceCriteria: ['file2.txt updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'permissive', // Permissive mode - warn only
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      // Simulate violation - modify file2.txt which belongs to task-2
      const task1WorkDir = task1Context!.absolutePath;
      fs.writeFileSync(path.join(task1WorkDir, 'file1.txt'), 'task-1 updated file1\n');
      fs.writeFileSync(path.join(task1WorkDir, 'file2.txt'), 'task-1 modified file2\n'); // VIOLATION!

      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // In permissive mode, should succeed despite violation
      expect(result.error).toBeUndefined();
      expect(result.commitHash).toBeDefined();
      expect(result.branchName).toBeDefined();

      // Verify commit was actually created
      const git = getGit();
      const log = await git.log({ maxCount: 1 });
      expect(log.latest?.hash).toEqual(result.commitHash);
    });

    it('should commit all changes including violations in permissive mode', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Update multiple files',
          description: 'Should only touch file1',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['file1.txt updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'permissive',
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      // Modify multiple files (violations)
      const task1WorkDir = task1Context!.absolutePath;
      fs.writeFileSync(path.join(task1WorkDir, 'file1.txt'), 'modified by task-1\n');
      fs.writeFileSync(path.join(task1WorkDir, 'file2.txt'), 'also modified\n'); // VIOLATION
      fs.writeFileSync(path.join(task1WorkDir, 'file3.txt'), 'also modified\n'); // VIOLATION

      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // Should succeed and commit all changes
      expect(result.error).toBeUndefined();
      expect(result.commitHash).toBeDefined();

      // Verify all files were committed
      const git = getGit();
      const diff = await git.show([result.commitHash!, '--name-only', '--format=']);
      const changedFiles = diff.split('\n').filter(Boolean);

      expect(changedFiles).toContain('file1.txt');
      expect(changedFiles).toContain('file2.txt');
      expect(changedFiles).toContain('file3.txt');
    });
  });

  describe('Edge Cases', () => {
    it('should handle task with no file modifications', async () => {
      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'No-op task',
          description: 'Does not modify any files',
          files: ['file1.txt'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['Task completes'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'strict',
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      // Don't modify any files - should result in empty commit or skip

      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // Strategy should handle empty commits gracefully
      // Either succeeds with empty commit or skips commit
      expect(result.taskId).toEqual('task-1');
    });

    it('should validate files in subdirectories', async () => {
      // Create subdirectory structure
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'test'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src/app.ts'), 'app code\n');
      fs.writeFileSync(path.join(testDir, 'test/app.test.ts'), 'test code\n');

      const git = getGit();
      await git.add('.');
      await git.commit('Add subdirectories');

      const tasks: TaskV2[] = [
        {
          id: 'task-1',
          name: 'Update src',
          description: 'Only modify src files',
          files: ['src/app.ts'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['src/app.ts updated'],
        },
        {
          id: 'task-2',
          name: 'Update tests',
          description: 'Only modify test files',
          files: ['test/app.test.ts'],
          dependencies: [],
          complexity: 'S',
          acceptanceCriteria: ['test/app.test.ts updated'],
        },
      ];

      const executionTasks: ExecutionTask[] = tasks.map((task) => ({
        ...task,
        state: 'pending' as const,
        stateHistory: [],
        maxRetries: 0,
        retryCount: 0,
      }));

      const context: VcsStrategyContext = {
        cwd: testDir,
        baseRef: 'HEAD',
        validation: {
          mode: 'strict',
          allowNewFiles: false,
          allowDependencyFiles: false,
        },
      };

      await strategy.initialize(tasks, context);

      const task1Context = await strategy.prepareTaskExecution(
        tasks[0]!,
        executionTasks[0]!,
        context,
      );

      // Violate by modifying test file
      const task1WorkDir = task1Context!.absolutePath;
      fs.writeFileSync(path.join(task1WorkDir, 'src/app.ts'), 'updated app\n');
      fs.writeFileSync(path.join(task1WorkDir, 'test/app.test.ts'), 'VIOLATION\n'); // VIOLATION!

      const result = await strategy.handleTaskCompletion(
        tasks[0]!,
        executionTasks[0]!,
        task1Context!,
        'Task completed',
      );

      // Should fail validation
      expect(result.error).toBeDefined();
      expect(result.error).toContain('File modification validation failed');
    });
  });
});
