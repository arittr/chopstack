import { vi } from 'vitest';

import type { VcsEngineOptions } from '@/engine/vcs-engine';
import type { ExecutionTask } from '@/types/execution';

import { StackBuilder } from '@/vcs/stack-builder';

// Mock the GitSpiceBackend properly
const mockGitSpice = {
  initialize: vi.fn(),
  createStack: vi.fn(),
  submitStack: vi.fn(),
};

vi.mock('../../src/vcs/git-spice', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  GitSpiceBackend: vi.fn().mockImplementation(() => mockGitSpice),
}));

describe('StackBuilder', () => {
  let stackBuilder: StackBuilder;
  let mockOptions: VcsEngineOptions;

  beforeEach(() => {
    mockOptions = {
      shadowPath: '.test-shadows',
      branchPrefix: 'test/',
      cleanupOnSuccess: true,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    };

    stackBuilder = new StackBuilder(mockOptions);

    // Clear all mocks and set default responses
    vi.clearAllMocks();
    mockGitSpice.initialize.mockResolvedValue(undefined);
    mockGitSpice.createStack.mockResolvedValue({
      branches: [],
      stackRoot: 'main',
      totalCommits: 0,
    });
    mockGitSpice.submitStack.mockResolvedValue(['https://github.com/user/repo/pull/123']);
  });

  describe('buildIncremental', () => {
    it.skip('should build stack in dependency order', async () => {
      // Mock successful stack creation
      mockGitSpice.createStack.mockResolvedValue({
        branches: [
          { name: 'test/task-base', commit: 'abc123' },
          { name: 'test/task-dependent', commit: 'def456' },
        ],
        stackRoot: 'main',
        totalCommits: 2,
      });

      const completedTasks: ExecutionTask[] = [
        {
          id: 'task-base',
          title: 'Base Task',
          description: 'Foundation task',
          touches: [],
          produces: ['base.ts'],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Create base',
          state: 'completed',
          stateHistory: [
            { from: 'pending', to: 'pending', timestamp: new Date() },
            { from: 'pending', to: 'completed', timestamp: new Date() },
          ],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'abc123',
        },
        {
          id: 'task-dependent',
          title: 'Dependent Task',
          description: 'Task that depends on base',
          touches: [],
          produces: ['dependent.ts'],
          requires: ['task-base'],
          estimatedLines: 30,
          agentPrompt: 'Create dependent',
          state: 'completed',
          stateHistory: [
            { from: 'pending', to: 'pending', timestamp: new Date() },
            { from: 'pending', to: 'completed', timestamp: new Date() },
          ],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'def456',
        },
      ];

      // Create a mock conflict resolver
      const mockConflictResolver = {
        resolveConflicts: vi.fn(),
        analyzeConflicts: vi.fn(),
      };

      const stackInfo = await stackBuilder.buildIncremental(completedTasks, '/tmp/test', {
        parentRef: 'main',
        strategy: 'dependency-order',
        conflictResolver: mockConflictResolver as any,
      });

      expect(stackInfo.branches).toHaveLength(2);
      expect(stackInfo.branches.map((b) => b.name)).toContain('test/task-base');
      expect(stackInfo.branches.map((b) => b.name)).toContain('test/task-dependent');
      expect(stackInfo.stackRoot).toBeDefined();
    });

    it.skip('should handle tasks with no dependencies in parallel', async () => {
      // Mock successful stack creation
      mockGitSpice.createStack.mockResolvedValue({
        branches: [
          { name: 'test/task-a', commit: 'aaa111' },
          { name: 'test/task-b', commit: 'bbb222' },
        ],
        stackRoot: 'main',
        totalCommits: 2,
      });

      const parallelTasks: ExecutionTask[] = [
        {
          id: 'task-a',
          title: 'Task A',
          description: 'Independent task A',
          touches: [],
          produces: ['a.ts'],
          requires: [],
          estimatedLines: 25,
          agentPrompt: 'Create A',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'aaa111',
        },
        {
          id: 'task-b',
          title: 'Task B',
          description: 'Independent task B',
          touches: [],
          produces: ['b.ts'],
          requires: [],
          estimatedLines: 35,
          agentPrompt: 'Create B',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'bbb222',
        },
      ];

      // Create a mock conflict resolver
      const mockConflictResolver = {
        resolveConflicts: vi.fn(),
        analyzeConflicts: vi.fn(),
      };

      const stackInfo = await stackBuilder.buildIncremental(parallelTasks, '/tmp/test', {
        parentRef: 'main',
        strategy: 'dependency-order',
        conflictResolver: mockConflictResolver as any,
      });

      expect(stackInfo.branches).toHaveLength(2);
      expect(stackInfo.stackRoot).toBeDefined();
    });

    it.skip('should use different ordering strategies', async () => {
      // Mock successful stack creation
      mockGitSpice.createStack.mockResolvedValue({
        branches: [
          { name: 'test/simple-task', commit: 'simple123' },
          { name: 'test/complex-task', commit: 'complex456' },
        ],
        stackRoot: 'main',
        totalCommits: 2,
      });

      const tasks: ExecutionTask[] = [
        {
          id: 'simple-task',
          title: 'Simple Task',
          description: 'Low complexity task',
          touches: [],
          produces: ['simple.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Simple task',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'simple123',
        },
        {
          id: 'complex-task',
          title: 'Complex Task',
          description: 'High complexity task',
          touches: [],
          produces: ['complex.ts', 'helper.ts', 'config.json'],
          requires: [],
          estimatedLines: 100,
          agentPrompt: 'Complex task',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'complex456',
        },
      ];

      // Create a mock conflict resolver
      const mockConflictResolver = {
        resolveConflicts: vi.fn(),
        analyzeConflicts: vi.fn(),
      };

      // Test complexity-first strategy
      const complexityFirstStack = await stackBuilder.buildIncremental(tasks, '/tmp/test', {
        parentRef: 'main',
        strategy: 'complexity-first',
        conflictResolver: mockConflictResolver as any,
      });

      expect(complexityFirstStack.branches).toHaveLength(2);

      // Test file-impact strategy
      const fileImpactStack = await stackBuilder.buildIncremental(tasks, '/tmp/test', {
        parentRef: 'main',
        strategy: 'file-impact',
        conflictResolver: mockConflictResolver as any,
      });

      expect(fileImpactStack.branches).toHaveLength(2);
    });

    it('should handle git-spice command failures', async () => {
      // Mock git-spice failure
      mockGitSpice.createStack.mockRejectedValue(new Error('git-spice not found'));

      const tasks: ExecutionTask[] = [
        {
          id: 'failing-task',
          title: 'Failing Task',
          description: 'Task that will fail to create branch',
          touches: [],
          produces: ['fail.ts'],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Failing task',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'fail123',
        },
      ];

      // Create a mock conflict resolver
      const mockConflictResolver = {
        resolveConflicts: vi.fn(),
        analyzeConflicts: vi.fn(),
      };

      await expect(
        stackBuilder.buildIncremental(tasks, '/tmp/test', {
          parentRef: 'main',
          strategy: 'dependency-order',
          conflictResolver: mockConflictResolver as any,
        }),
      ).rejects.toThrow('git-spice not found');
    });
  });

  describe('submitStack', () => {
    it.skip('should submit PR stack when enabled', async () => {
      // Mock successful PR creation
      mockGitSpice.submitStack.mockResolvedValue(['https://github.com/user/repo/pull/123']);

      const prUrls = await stackBuilder.submitStack('/tmp/test');

      expect(prUrls).toHaveLength(1);
      expect(prUrls[0]).toBe('https://github.com/user/repo/pull/123');
    });

    it.skip('should handle GitHub CLI failures gracefully', async () => {
      // Mock GitHub CLI failure
      mockGitSpice.submitStack.mockRejectedValue(new Error('GitHub CLI authentication failed'));

      await expect(stackBuilder.submitStack('/tmp/test')).rejects.toThrow(
        'GitHub CLI authentication failed',
      );
    });
  });

  describe('private methods via public interface', () => {
    it.skip('should order tasks by dependency correctly', async () => {
      // Mock successful stack creation with correct ordering
      mockGitSpice.createStack.mockResolvedValue({
        branches: [
          { name: 'test/task-a', commit: 'aaa111' },
          { name: 'test/task-b', commit: 'bbb222' },
          { name: 'test/task-c', commit: 'ccc333' },
        ],
        stackRoot: 'main',
        totalCommits: 3,
      });

      const unorderedTasks: ExecutionTask[] = [
        {
          id: 'task-c',
          title: 'Task C',
          description: 'Depends on B',
          touches: [],
          produces: ['c.ts'],
          requires: ['task-b'],
          estimatedLines: 20,
          agentPrompt: 'Create C',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'ccc333',
        },
        {
          id: 'task-a',
          title: 'Task A',
          description: 'Base task',
          touches: [],
          produces: ['a.ts'],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Create A',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'aaa111',
        },
        {
          id: 'task-b',
          title: 'Task B',
          description: 'Depends on A',
          touches: [],
          produces: ['b.ts'],
          requires: ['task-a'],
          estimatedLines: 20,
          agentPrompt: 'Create B',
          state: 'completed',
          stateHistory: [],
          retryCount: 0,
          maxRetries: 3,
          commitHash: 'bbb222',
        },
      ];

      // Create a mock conflict resolver
      const mockConflictResolver = {
        resolveConflicts: vi.fn(),
        analyzeConflicts: vi.fn(),
      };

      const stackInfo = await stackBuilder.buildIncremental(unorderedTasks, '/tmp/test', {
        parentRef: 'main',
        strategy: 'dependency-order',
        conflictResolver: mockConflictResolver as any,
      });

      expect(stackInfo.branches).toHaveLength(3);

      // Verify the ordering through branch creation order
      const branchNames = stackInfo.branches.map((b) => b.name);
      const aIndex = branchNames.indexOf('test/task-a');
      const bIndex = branchNames.indexOf('test/task-b');
      const cIndex = branchNames.indexOf('test/task-c');

      // A should come before B, B should come before C
      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });
  });
});
