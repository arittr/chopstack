import type { SimpleGit } from 'simple-git';
import type { MockedFunction } from 'vitest';

import { execSync, type ExecSyncOptions } from 'node:child_process';

import { afterEach, beforeEach, vi } from 'vitest';

import { isNonNullish } from '@/validation/guards';

import { createGitTestEnvironment, type GitTestEnvironment } from './git-test-environment';
import { cleanupOrphanedTestResources, testResourceTracker } from './test-resource-tracker';

/**
 * Setup function for tests that need isolated Git environments.
 * Returns a GitTestEnvironment that will be automatically cleaned up.
 */
export function setupGitTest(testName: string): {
  env: GitTestEnvironment;
  getGit: () => SimpleGit;
  getTmpDir: () => string;
} {
  let env: GitTestEnvironment;

  beforeEach(async () => {
    // Clean up any orphaned resources from previous runs
    cleanupOrphanedTestResources();

    // Create new test environment
    env = createGitTestEnvironment(testName);
    testResourceTracker.trackEnvironment(env);

    // Initialize git repository
    await env.initRepo();
  });

  afterEach(async () => {
    // Clean up the test environment
    if (isNonNullish(env)) {
      await env.cleanup();
    }

    // Ensure all resources are cleaned up
    await testResourceTracker.cleanupAll();
  });

  return {
    get env() {
      return env;
    },
    getGit: () => env.git,
    getTmpDir: () => env.tmpDir,
  };
}

type TestTask = {
  commitHash?: string;
  complexity: number;
  dependencies: string[];
  description: string;
  files: string[];
  id: string;
  priority: number;
  title: string;
};

/**
 * Creates a test task with default values.
 */
export function createTestTask(overrides?: Partial<TestTask>): TestTask {
  return {
    id: overrides?.id ?? 'task-1',
    title: overrides?.title ?? 'Test Task',
    description: overrides?.description ?? 'Test task description',
    dependencies: overrides?.dependencies ?? [],
    files: overrides?.files ?? [],
    priority: overrides?.priority ?? 1,
    complexity: overrides?.complexity ?? 1,
    ...(isNonNullish(overrides?.commitHash) && { commitHash: overrides.commitHash }),
  };
}

type TestDagNode = {
  dependencies: string[];
  dependents: string[];
  depth: number;
  id: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  task: TestTask;
};

/**
 * Creates a test DAG node.
 */
export function createTestDagNode(
  overrides?: Partial<{
    dependencies: string[];
    dependents: string[];
    depth: number;
    id: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    task: TestTask;
  }>,
): TestDagNode {
  return {
    id: overrides?.id ?? 'task-1',
    task: overrides?.task ?? createTestTask({ id: overrides?.id ?? 'task-1' }),
    dependencies: overrides?.dependencies ?? [],
    dependents: overrides?.dependents ?? [],
    depth: overrides?.depth ?? 0,
    status: overrides?.status ?? 'pending',
  };
}

type TestPlan = {
  dag: Map<string, TestDagNode>;
  executionOrder: string[][];
  stats: {
    maxDepth: number;
    parallelizableGroups: number;
    totalComplexity: number;
    totalTasks: number;
  };
  tasks: TestTask[];
};

/**
 * Creates a test plan with default values.
 */
export function createTestPlan(
  overrides?: Partial<{
    dag: Map<string, TestDagNode>;
    executionOrder: string[][];
    stats?: {
      maxDepth: number;
      parallelizableGroups: number;
      totalComplexity: number;
      totalTasks: number;
    };
    tasks: TestTask[];
  }>,
): TestPlan {
  const defaultTasks = [
    createTestTask({ id: 'task-1' }),
    createTestTask({ id: 'task-2', dependencies: ['task-1'] }),
  ];

  const tasks = overrides?.tasks ?? defaultTasks;

  const defaultDag = new Map([
    ['task-1', createTestDagNode({ id: 'task-1', depth: 0 })],
    ['task-2', createTestDagNode({ id: 'task-2', dependencies: ['task-1'], depth: 1 })],
  ]);

  const result: TestPlan = {
    dag: overrides?.dag ?? defaultDag,
    executionOrder: overrides?.executionOrder ?? [['task-1'], ['task-2']],
    stats: overrides?.stats ?? {
      maxDepth: 1,
      parallelizableGroups: 2,
      totalComplexity: tasks.reduce((sum, t) => sum + t.complexity, 0),
      totalTasks: tasks.length,
    },
    tasks,
  };
  return result;
}

/**
 * Waits for a condition to become true, with timeout.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options?: { interval?: number; message?: string; timeout?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5000;
  const interval = options?.interval ?? 100;
  const message = options?.message ?? 'Condition not met';

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timerId = global.setTimeout(() => {
        resolve();
      }, interval);
      // Clear reference to avoid memory leak
      void timerId;
    });
  }

  throw new Error(`Timeout waiting for condition: ${message}`);
}

/**
 * Creates a mock function with type safety.
 */
export function createMockFn<T extends (...args: any[]) => any>(): MockedFunction<T> {
  return vi.fn() as MockedFunction<T>;
}

/**
 * Helper to create a test file structure in a Git environment.
 */
export async function createTestFileStructure(
  env: GitTestEnvironment,
  structure: Record<string, string>,
): Promise<void> {
  for (const [path, content] of Object.entries(structure)) {
    env.createFile(path, content);
  }

  // Stage and commit all files
  await env.git.add('.');
  await env.git.commit('Add test files');
}

/**
 * Helper to create multiple test commits.
 */
export async function createTestCommits(
  env: GitTestEnvironment,
  commits: Array<{ files: Record<string, string>; message: string }>,
): Promise<string[]> {
  const hashes: string[] = [];

  for (const commit of commits) {
    // Create files
    for (const [path, content] of Object.entries(commit.files)) {
      env.createFile(path, content);
    }

    // Stage and commit
    await env.git.add('.');
    await env.git.commit(commit.message);

    // Get the commit hash
    const log = await env.git.log({ maxCount: 1 });
    hashes.push(log.latest!.hash);
  }

  return hashes;
}

/**
 * Helper to simulate git-spice being available.
 */
export function mockGitSpiceAvailable(isAvailable = true): void {
  const originalExecSync = execSync;
  vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<{ [key: string]: unknown; execSync: typeof execSync }>();
    return {
      ...actual,
      execSync: vi.fn().mockImplementation((cmd: unknown, options?: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('git-spice') && cmd.includes('--version')) {
          if (isAvailable) {
            return 'git-spice version 0.1.0';
          }
          throw new Error('Command not found: git-spice');
        }
        return originalExecSync(cmd as string, options as ExecSyncOptions);
      }),
    };
  });
}

/**
 * Helper to assert that a branch exists in the repository.
 */
export async function assertBranchExists(git: SimpleGit, branchName: string): Promise<void> {
  const branches = await git.branch();
  const exists =
    branches.all.includes(branchName) || branches.all.includes(`remotes/origin/${branchName}`);
  if (!exists) {
    throw new Error(
      `Expected branch "${branchName}" to exist, but it doesn't. Available branches: ${branches.all.join(', ')}`,
    );
  }
}

/**
 * Helper to assert that a worktree exists.
 */
export function assertWorktreeExists(repoPath: string, worktreePath: string): void {
  const worktrees = execSync('git worktree list', {
    cwd: repoPath,
    encoding: 'utf8',
  });

  if (!worktrees.includes(worktreePath)) {
    throw new Error(`Expected worktree at "${worktreePath}" to exist, but it doesn't.`);
  }
}

/**
 * Creates a unique test identifier.
 */
export function createTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Export all helpers from other files for convenience.
 */
export { createGitTestEnvironment, type GitTestEnvironment } from './git-test-environment';
export {
  testResourceTracker,
  cleanupOrphanedTestResources,
  ensureAllResourcesCleanedUp,
} from './test-resource-tracker';
