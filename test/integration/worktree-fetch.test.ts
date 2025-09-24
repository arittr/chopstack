import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { WorktreeManager } from '@/vcs/worktree-manager';

const execAsync = promisify(exec);

describe('Worktree Commit Fetching', () => {
  let testRepo: string;
  let worktreeManager: WorktreeManager;

  beforeEach(async () => {
    // Create temporary test repository
    testRepo = path.join(__dirname, '../tmp', `test-repo-${Date.now()}`);
    await fs.mkdir(testRepo, { recursive: true });

    // Initialize git repo
    await execAsync('git init', { cwd: testRepo });
    await execAsync('git config user.name "Test User"', { cwd: testRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: testRepo });

    // Create initial commit
    await fs.writeFile(path.join(testRepo, 'README.md'), '# Test Repo\n');
    await execAsync('git add README.md', { cwd: testRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: testRepo });

    // Setup test instances
    worktreeManager = new WorktreeManager({
      shadowPath: '.chopstack/shadows',
      branchPrefix: 'chopstack/',
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });
  });

  afterEach(async () => {
    // Clean up any worktrees
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: testRepo });
      const worktrees = stdout
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''))
        .filter((path) => path !== testRepo);

      for (const worktreePath of worktrees) {
        await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: testRepo }).catch(
          () => {
            /* ignore */
          },
        );
      }
    } catch {
      // Ignore errors
    }

    // Cleanup test repo
    try {
      await fs.rm(testRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Fetching commits from worktrees', () => {
    it('should be able to fetch commits from worktree branches', async () => {
      // Create a worktree
      const context = await worktreeManager.createWorktree({
        taskId: 'test-task',
        branchName: 'chopstack/test-task',
        worktreePath: '.chopstack/shadows/test-task',
        baseRef: 'HEAD',
        workdir: testRepo,
      });

      // Create a commit in the worktree
      const testFile = path.join(context.absolutePath, 'test.txt');
      await fs.writeFile(testFile, 'Test content\n');
      await execAsync('git add test.txt', { cwd: context.absolutePath });
      await execAsync('git commit -m "Test commit"', { cwd: context.absolutePath });

      // Get the commit hash
      const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
        cwd: context.absolutePath,
      });
      const hash = commitHash.trim();

      // Fetch the branch from the worktree to make commits accessible
      await execAsync(
        `git fetch "${context.absolutePath}" "${context.branchName}:refs/remotes/worktree-test-task/${context.branchName}"`,
        { cwd: testRepo },
      );

      // Verify the commit is now accessible in the main repo
      const { stdout: catFile } = await execAsync(`git cat-file -t ${hash}`, { cwd: testRepo });
      expect(catFile.trim()).toBe('commit');

      // Verify we can cherry-pick the commit
      await execAsync('git checkout -b test-branch', { cwd: testRepo });
      await execAsync(`git cherry-pick ${hash}`, { cwd: testRepo });

      // Verify the file was cherry-picked
      const cherryPickedFile = path.join(testRepo, 'test.txt');
      const content = await fs.readFile(cherryPickedFile, 'utf8');
      expect(content).toBe('Test content\n');
    });

    it('should handle multiple worktrees with different commits', async () => {
      const tasks = ['task-a', 'task-b', 'task-c'];
      const commits: Record<string, string> = {};

      // Create worktrees and commits for each task
      for (const taskId of tasks) {
        const context = await worktreeManager.createWorktree({
          taskId,
          branchName: `chopstack/${taskId}`,
          worktreePath: `.chopstack/shadows/${taskId}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        // Create a unique file in each worktree
        const testFile = path.join(context.absolutePath, `${taskId}.txt`);
        await fs.writeFile(testFile, `Content for ${taskId}\n`);
        await execAsync(`git add ${taskId}.txt`, { cwd: context.absolutePath });
        await execAsync(`git commit -m "Commit for ${taskId}"`, { cwd: context.absolutePath });

        // Get the commit hash
        const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
          cwd: context.absolutePath,
        });
        commits[taskId] = commitHash.trim();

        // Fetch from the worktree
        await execAsync(
          `git fetch "${context.absolutePath}" "${context.branchName}:refs/remotes/worktree-${taskId}/${context.branchName}"`,
          { cwd: testRepo },
        );
      }

      // Verify all commits are accessible
      for (const hash of Object.values(commits)) {
        const { stdout: catFile } = await execAsync(`git cat-file -t ${hash}`, { cwd: testRepo });
        expect(catFile.trim()).toBe('commit');
      }

      // Cherry-pick all commits to a new branch
      await execAsync('git checkout -b combined-branch', { cwd: testRepo });
      for (const hash of Object.values(commits)) {
        await execAsync(`git cherry-pick ${hash}`, { cwd: testRepo });
      }

      // Verify all files exist
      for (const taskId of tasks) {
        const filePath = path.join(testRepo, `${taskId}.txt`);
        const content = await fs.readFile(filePath, 'utf8');
        expect(content).toBe(`Content for ${taskId}\n`);
      }
    });

    it('should parse worktree list correctly', async () => {
      // Create multiple worktrees
      const worktrees = [
        { taskId: 'task-1', branch: 'chopstack/task-1', path: '.chopstack/shadows/task-1' },
        { taskId: 'task-2', branch: 'chopstack/task-2', path: '.chopstack/shadows/task-2' },
      ];

      for (const wt of worktrees) {
        await worktreeManager.createWorktree({
          taskId: wt.taskId,
          branchName: wt.branch,
          worktreePath: wt.path,
          baseRef: 'HEAD',
          workdir: testRepo,
        });
      }

      // Get worktree list
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: testRepo });

      // Parse worktree list (simulating the private method)
      const parsed: Array<{ branch?: string; head?: string; path: string }> = [];
      const lines = stdout.split('\n');
      let current: { branch?: string; head?: string; path?: string } = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path !== undefined) {
            parsed.push(current as { branch?: string; head?: string; path: string });
          }
          current = { path: line.replace('worktree ', '') };
        } else if (line.startsWith('branch ')) {
          current.branch = line.replace('branch refs/heads/', '');
        } else if (line.startsWith('HEAD ')) {
          current.head = line.replace('HEAD ', '');
        }
      }
      if (current.path !== undefined) {
        parsed.push(current as { branch?: string; head?: string; path: string });
      }

      // Verify parsing
      expect(parsed.length).toBeGreaterThanOrEqual(3); // main + 2 worktrees
      const taskWorktrees = parsed.filter((wt) => wt.branch?.includes('chopstack/') === true);
      expect(taskWorktrees).toHaveLength(2);
    });
  });
});
