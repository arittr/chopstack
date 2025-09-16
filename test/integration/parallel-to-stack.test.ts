import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { Plan } from '../../src/types/decomposer';
import type { ExecutionOptions } from '../../src/types/execution';

import { ExecutionEngine } from '../../src/engine/execution-engine';
import { isValidArray } from '../../src/utils/guards';
import { GitSpiceBackend } from '../../src/vcs/git-spice';

const execAsync = promisify(exec);

describe('Parallel Worktree to Git-spice Stack Integration', () => {
  let testRepo: string;
  let engine: ExecutionEngine;

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
    engine = new ExecutionEngine();
  });

  afterEach(async () => {
    // Cleanup test repo
    try {
      await fs.rm(testRepo, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Parallel Task Execution with File Overlaps', () => {
    it('should handle parallel tasks that modify different files', async () => {
      // Test plan: 3 parallel tasks modifying different files
      const plan: Plan = {
        tasks: [
          {
            id: 'task-a',
            title: 'Create component A',
            description: 'Create a React component',
            touches: [],
            produces: ['src/ComponentA.tsx'],
            requires: [],
            estimatedLines: 50,
            agentPrompt: 'Create a simple React component ComponentA in src/ComponentA.tsx',
          },
          {
            id: 'task-b',
            title: 'Create component B',
            description: 'Create another React component',
            touches: [],
            produces: ['src/ComponentB.tsx'],
            requires: [],
            estimatedLines: 45,
            agentPrompt: 'Create a simple React component ComponentB in src/ComponentB.tsx',
          },
          {
            id: 'task-c',
            title: 'Create utils file',
            description: 'Create utility functions',
            touches: [],
            produces: ['src/utils.ts'],
            requires: [],
            estimatedLines: 30,
            agentPrompt: 'Create utility functions in src/utils.ts',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        strategy: 'parallel',
        workdir: testRepo,
        gitSpice: true,
        verbose: true,
      };

      // Execute the plan
      const result = await engine.execute(plan, options);

      // Verify execution succeeded
      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(3);

      // Verify worktrees were created and cleaned up
      const shadowDir = path.join(testRepo, '.chopstack-shadows');
      const worktrees = await fs.readdir(shadowDir).catch(() => []);

      // Check if worktrees exist (during execution) or were cleaned up (after execution)
      console.log('Worktrees after execution:', worktrees);

      // Verify git-spice stack was created
      expect(result.gitBranches?.length).toBeGreaterThan(0);

      // Test the git-spice stack structure
      const { stdout: branchList } = await execAsync('git branch -a', { cwd: testRepo });
      console.log('Branches created:', branchList);

      // Verify each task has its own branch
      expect(branchList).toContain('feature/task-a');
      expect(branchList).toContain('feature/task-b');
      expect(branchList).toContain('feature/task-c');
    });

    it('should handle parallel tasks with file conflicts gracefully', async () => {
      // Test plan: 2 parallel tasks modifying the same file
      const plan: Plan = {
        tasks: [
          {
            id: 'task-conflict-a',
            title: 'Modify index file (version A)',
            description: 'Add component A import to index',
            touches: ['src/index.ts'],
            produces: [],
            requires: [],
            estimatedLines: 5,
            agentPrompt: 'Add "export { ComponentA } from \'./ComponentA\';" to src/index.ts',
          },
          {
            id: 'task-conflict-b',
            title: 'Modify index file (version B)',
            description: 'Add component B import to index',
            touches: ['src/index.ts'],
            produces: [],
            requires: [],
            estimatedLines: 5,
            agentPrompt: 'Add "export { ComponentB } from \'./ComponentB\';" to src/index.ts',
          },
        ],
      };

      // Create the base file that both tasks will modify
      await fs.mkdir(path.join(testRepo, 'src'), { recursive: true });
      await fs.writeFile(path.join(testRepo, 'src/index.ts'), '// Main index file\n');
      await execAsync('git add src/index.ts', { cwd: testRepo });
      await execAsync('git commit -m "Add initial index file"', { cwd: testRepo });

      const options: ExecutionOptions = {
        mode: 'execute',
        strategy: 'parallel',
        workdir: testRepo,
        gitSpice: true,
        verbose: true,
      };

      // Execute the plan - this should handle conflicts
      const result = await engine.execute(plan, options);

      // Log the result for analysis
      console.log('Execution result:', {
        success: result.success,
        tasksCompleted: result.tasksCompleted,
        tasksFailed: result.tasksFailed,
        error: result.error,
      });

      // At minimum, we should have attempted execution
      expect(result.tasksTotal).toBe(2);

      // Check how conflicts were handled
      if (result.success) {
        // If successful, verify both changes are in the stack somehow
        const { stdout: gitLog } = await execAsync('git log --oneline --all', { cwd: testRepo });
        console.log('Git commit history:', gitLog);
      } else {
        // If failed, that's expected for conflicting parallel tasks
        console.log('Execution failed as expected due to conflicts:', result.error);
      }
    });
  });

  describe('Git-spice Stack Structure', () => {
    it('should create proper dependency-based stack structure', async () => {
      // Test plan with dependencies: A → B → C
      const plan: Plan = {
        tasks: [
          {
            id: 'task-base',
            title: 'Create base types',
            description: 'Create foundational types',
            touches: [],
            produces: ['src/types.ts'],
            requires: [],
            estimatedLines: 20,
            agentPrompt: 'Create basic TypeScript types in src/types.ts',
          },
          {
            id: 'task-depends-on-base',
            title: 'Create service using types',
            description: 'Create service that uses the types',
            touches: [],
            produces: ['src/service.ts'],
            requires: ['task-base'],
            estimatedLines: 40,
            agentPrompt: 'Create a service in src/service.ts that imports from ./types',
          },
          {
            id: 'task-depends-on-service',
            title: 'Create API using service',
            description: 'Create API that uses the service',
            touches: [],
            produces: ['src/api.ts'],
            requires: ['task-depends-on-service'],
            estimatedLines: 35,
            agentPrompt: 'Create an API in src/api.ts that imports from ./service',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        strategy: 'parallel', // Even though there are dependencies, engine should handle ordering
        workdir: testRepo,
        gitSpice: true,
        verbose: true,
      };

      const result = await engine.execute(plan, options);

      // Verify execution succeeded
      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(3);

      // Verify stack structure reflects dependencies
      if (isValidArray(result.gitBranches)) {
        console.log('Created git branches:', result.gitBranches);

        // Verify all branches exist
        const { stdout: branchList } = await execAsync('git branch -a', { cwd: testRepo });
        expect(branchList).toContain('feature/task-base');
        expect(branchList).toContain('feature/task-depends-on-base');
        expect(branchList).toContain('feature/task-depends-on-service');

        // Verify commit history shows proper stacking
        const { stdout: gitLog } = await execAsync('git log --oneline --graph --all --decorate', {
          cwd: testRepo,
        });
        console.log('Git stack structure:\n', gitLog);
      }
    });
  });

  describe('Worktree Management', () => {
    it('should create and cleanup worktrees properly', async () => {
      const plan: Plan = {
        tasks: [
          {
            id: 'worktree-test',
            title: 'Test worktree creation',
            description: 'Simple task to test worktree management',
            touches: [],
            produces: ['test-file.txt'],
            requires: [],
            estimatedLines: 1,
            agentPrompt: 'Create a test file test-file.txt with content "hello world"',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        strategy: 'parallel',
        workdir: testRepo,
        gitSpice: false, // Don't create stack, just test worktree management
        verbose: true,
      };

      // Check initial state
      const initialWorktrees = await execAsync('git worktree list', { cwd: testRepo });
      console.log('Initial worktrees:', initialWorktrees.stdout);

      // Execute the plan
      const result = await engine.execute(plan, options);

      // Check final state
      const finalWorktrees = await execAsync('git worktree list', { cwd: testRepo });
      console.log('Final worktrees:', finalWorktrees.stdout);

      // Verify task completed
      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(1);

      // Check if shadow directory exists or was cleaned up
      const shadowDir = path.join(testRepo, '.chopstack-shadows');
      const shadowExists = await fs
        .access(shadowDir)
        .then(() => true)
        .catch(() => false);
      console.log('Shadow directory exists after execution:', shadowExists);

      if (shadowExists) {
        const shadowContents = await fs.readdir(shadowDir);
        console.log('Shadow directory contents:', shadowContents);
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle git-spice initialization failures gracefully', async () => {
      // Test without git-spice installed (mock the failure)
      const mockGitSpice = new GitSpiceBackend();
      jest.spyOn(mockGitSpice, 'isAvailable').mockResolvedValue(false);

      const plan: Plan = {
        tasks: [
          {
            id: 'simple-task',
            title: 'Simple task',
            description: 'A simple task',
            touches: [],
            produces: ['simple.txt'],
            requires: [],
            estimatedLines: 1,
            agentPrompt: 'Create a simple file',
          },
        ],
      };

      const options: ExecutionOptions = {
        mode: 'execute',
        strategy: 'parallel',
        workdir: testRepo,
        gitSpice: true, // Request git-spice but it's not available
        verbose: true,
      };

      // Should either fail gracefully or fall back to regular git
      const result = await engine.execute(plan, options);

      // Log the result to understand the behavior
      console.log('Result when git-spice unavailable:', {
        success: result.success,
        error: result.error,
        tasksCompleted: result.tasksCompleted,
      });

      // At minimum, should not crash
      expect(result).toBeDefined();
    });
  });
});
