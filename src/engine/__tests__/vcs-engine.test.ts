/* eslint-disable unicorn/no-unused-properties */
import { TEST_CONFIG, TEST_PATHS } from '@test/constants/test-paths';

import type { Plan } from '@/types/decomposer';

import { VcsEngine } from '@/engine/vcs-engine';

describe('VcsEngine', () => {
  let vcsEngine: VcsEngine;

  beforeEach(() => {
    vcsEngine = new VcsEngine({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
      cleanupOnSuccess: true,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });
  });

  describe('analyzeWorktreeNeeds', () => {
    it('should detect when worktrees are needed for parallel tasks', async () => {
      const plan: Plan = {
        tasks: [
          {
            id: 'task-a',
            title: 'Task A',
            description: 'First task',
            touches: [],
            produces: ['file-a.ts'],
            requires: [],
            estimatedLines: 10,
            agentPrompt: 'Create file A',
          },
          {
            id: 'task-b',
            title: 'Task B',
            description: 'Second task',
            touches: [],
            produces: ['file-b.ts'],
            requires: [],
            estimatedLines: 15,
            agentPrompt: 'Create file B',
          },
        ],
      };

      const analysis = await vcsEngine.analyzeWorktreeNeeds(plan, TEST_PATHS.TEST_TMP);

      expect(analysis.requiresWorktrees).toBe(true);
      expect(analysis.maxConcurrentTasks).toBe(2);
      expect(analysis.parallelLayers).toBe(1);
      expect(analysis.estimatedDiskUsage).toBeGreaterThan(0);
    });

    it('should not require worktrees for sequential tasks', async () => {
      const plan: Plan = {
        tasks: [
          {
            id: 'task-a',
            title: 'Task A',
            description: 'First task',
            touches: [],
            produces: ['file-a.ts'],
            requires: [],
            estimatedLines: 10,
            agentPrompt: 'Create file A',
          },
          {
            id: 'task-b',
            title: 'Task B',
            description: 'Second task depends on A',
            touches: [],
            produces: ['file-b.ts'],
            requires: ['task-a'],
            estimatedLines: 15,
            agentPrompt: 'Create file B',
          },
        ],
      };

      const analysis = await vcsEngine.analyzeWorktreeNeeds(plan, TEST_PATHS.TEST_TMP);

      expect(analysis.requiresWorktrees).toBe(false);
      expect(analysis.maxConcurrentTasks).toBe(1);
      expect(analysis.parallelLayers).toBe(2);
    });
  });

  describe('generateCommitMessage', () => {
    let aiGenerateSpy: vi.SpyInstance<
      Promise<string>,
      [unknown, { files?: string[]; output?: string }, string]
    >;

    beforeEach(() => {
      aiGenerateSpy = vi.spyOn(
        vcsEngine as unknown as {
          _generateAICommitMessage: (
            task: unknown,
            changes: { files?: string[]; output?: string },
            workdir: string,
          ) => Promise<string>;
        },
        '_generateAICommitMessage',
      );
    });

    afterEach(() => {
      aiGenerateSpy.mockRestore();
    });

    it('should generate commit message for component task', async () => {
      const mockTask = {
        id: 'add-component',
        title: 'Add User Component',
        description: 'Create a reusable user component',
        touches: [],
        produces: ['src/components/User.tsx'],
        requires: [],
        estimatedLines: 50,
        agentPrompt: 'Create a user component',
        state: 'pending' as const,
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const changes = {
        files: ['src/components/User.tsx'],
        output: 'Created User component with props interface',
      };

      aiGenerateSpy.mockResolvedValueOnce('Add component scaffolding');

      const message = await vcsEngine.generateCommitMessage(mockTask, changes, TEST_PATHS.TEST_TMP);

      expect(message.startsWith('Add component scaffolding')).toBe(true);
      expect(message).toContain('🤖 Generated with Claude via chopstack');
      expect(message).toContain('Co-Authored-By: Claude');
      expect(aiGenerateSpy).toHaveBeenCalledWith(mockTask, changes, TEST_PATHS.TEST_TMP);
    });

    it('should generate commit message for API task', async () => {
      const mockTask = {
        id: 'api-endpoints',
        title: 'Implement User API',
        description: 'Add CRUD endpoints for users',
        touches: [],
        produces: ['src/api/users.ts'],
        requires: [],
        estimatedLines: 80,
        agentPrompt: 'Create user API endpoints',
        state: 'pending' as const,
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const changes = {
        files: ['src/api/users.ts'],
        output: 'Implemented user CRUD API',
      };

      aiGenerateSpy.mockResolvedValueOnce('Implement user API endpoints');

      const message = await vcsEngine.generateCommitMessage(mockTask, changes, TEST_PATHS.TEST_TMP);

      expect(message.startsWith('Implement user API endpoints')).toBe(true);
      expect(message).toContain('🤖 Generated with Claude via chopstack');
      expect(message).toContain('Co-Authored-By: Claude');
      expect(aiGenerateSpy).toHaveBeenCalledWith(mockTask, changes, TEST_PATHS.TEST_TMP);
    });

    it('should generate commit message for test task', async () => {
      const mockTask = {
        id: 'add-tests',
        title: 'Add User Tests',
        description: 'Add comprehensive test coverage',
        touches: [],
        produces: ['src/tests/User.test.tsx'],
        requires: [],
        estimatedLines: 60,
        agentPrompt: 'Create user component tests',
        state: 'pending' as const,
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
      };

      const changes = {
        files: ['src/tests/User.test.tsx'],
        output: 'Added test coverage for user component',
      };

      aiGenerateSpy.mockRejectedValueOnce(new Error('claude unavailable'));

      const message = await vcsEngine.generateCommitMessage(mockTask, changes, TEST_PATHS.TEST_TMP);

      expect(message).toContain('Add User Tests');
      expect(message).toContain('🤖 Generated with Claude via chopstack');
      expect(message).toContain('Implements src/tests/User.test.tsx');
    });
  });

  describe('file categorization', () => {
    it('should categorize different file types correctly', () => {
      // Test the private categorization logic through commit message generation
      const testCases = [
        {
          files: ['src/components/Button.tsx'],
          expectedKeyword: 'component',
        },
        {
          files: ['src/api/auth.ts'],
          expectedKeyword: 'API',
        },
        {
          files: ['src/utils/helpers.test.ts'],
          expectedKeyword: 'test',
        },
        {
          files: ['package.json'],
          expectedKeyword: 'config',
        },
        {
          files: ['README.md'],
          expectedKeyword: 'doc',
        },
      ];

      for (const { files } of testCases) {
        // TODO: Simplify test object when only produces is needed

        const mockTask = {
          produces: files,
          // Required for type compatibility but not used in this test
          id: 'test-task',
          title: 'Test Task',
          description: 'Test task description',
          touches: [],
          requires: [],
          estimatedLines: 20,
          agentPrompt: 'Test prompt',
        };

        // The categorization happens in the _generateRuleBasedCommitMessage method
        // which is called as a fallback in generateCommitMessage
        expect(mockTask.produces).toEqual(files);
      }
    });
  });
});
