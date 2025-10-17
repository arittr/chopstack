/**
 * Unit tests for cleanup_task_worktree and list_task_worktrees tools
 *
 * Tests the remaining VCS MCP tools with mocked VCS services.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';

import { registerVcsTools } from '../vcs-tools';

// Mock VcsEngineService
mock.module('@/services/vcs/vcs-engine-service', () => ({
  VcsEngineServiceImpl: mock(),
}));

// Mock logger
mock.module('@/utils/global-logger', () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

// Mock GitWrapper
mock.module('@/adapters/vcs/git-wrapper', () => ({
  GitWrapper: mock(),
}));

describe('VCS MCP Tools - cleanup_task_worktree', () => {
  let mockVcsEngine: {
    cleanupWorktrees: ReturnType<typeof mock>;
    initialize: ReturnType<typeof mock>;
  };

  let mockMcp: {
    addTool: ReturnType<typeof mock>;
  };

  /**
   * Helper to get the execute function for cleanup_task_worktree
   */
  function getExecuteFunction(): (params: never) => Promise<string> {
    const cleanupCall = mockMcp.addTool.mock.calls.find(
      (call) => call[0].name === 'cleanup_task_worktree',
    );
    if (cleanupCall === undefined) {
      throw new Error('cleanup_task_worktree tool not registered');
    }
    return cleanupCall[0].execute as (params: never) => Promise<string>;
  }

  beforeEach(() => {
    mock.restore();

    // Mock VcsEngineService
    mockVcsEngine = {
      initialize: mock().mockResolvedValue(undefined),
      cleanupWorktrees: mock().mockResolvedValue(undefined),
    };

    mock(VcsEngineServiceImpl).mockImplementation(
      () => mockVcsEngine as unknown as VcsEngineServiceImpl,
    );

    // Create mock FastMCP instance
    mockMcp = {
      addTool: mock(),
    };
  });

  describe('Tool Registration', () => {
    it('should register cleanup_task_worktree tool', () => {
      registerVcsTools(mockMcp as never);

      expect(mockMcp.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cleanup_task_worktree',
          description: expect.stringContaining('Remove worktree after task completion'),
          parameters: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    });
  });

  describe('Success Paths', () => {
    it('should cleanup worktree successfully with minimal params', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response).toEqual({
        status: 'success',
        taskId: 'task-1',
        cleaned: true,
        branchDeleted: true,
      });

      // Verify VcsEngine was called correctly
      expect(mockVcsEngine.initialize).toHaveBeenCalledWith('/test/project');
      expect(mockVcsEngine.cleanupWorktrees).toHaveBeenCalledWith([
        expect.objectContaining({
          taskId: 'task-1',
          branchName: 'task/task-1',
          worktreePath: '.chopstack/shadows/task-1',
        }),
      ]);
    });

    it('should cleanup worktree with keepBranch option', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        taskId: 'task-1',
        keepBranch: true,
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response).toEqual({
        status: 'success',
        taskId: 'task-1',
        cleaned: true,
        branchDeleted: false,
      });
    });

    it('should use current directory when workdir not provided', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const currentDir = process.cwd();

      await execute({
        taskId: 'task-1',
      } as never);

      expect(mockVcsEngine.initialize).toHaveBeenCalledWith(currentDir);
    });
  });

  describe('Failure Paths', () => {
    it('should handle cleanup errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.cleanupWorktrees.mockRejectedValue(
        new Error('Failed to remove worktree: permission denied'),
      );

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.taskId).toBe('task-1');
      expect(response.cleaned).toBe(false);
      expect(response.error).toBe('Failed to remove worktree: permission denied');
    });

    it('should handle unknown error types', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.cleanupWorktrees.mockRejectedValue('String error');

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.error).toBe('Unknown error');
    });
  });

  describe('Logging', () => {
    it('should log debug info on tool call', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const params = {
        taskId: 'task-1',
        workdir: '/test/project',
      };

      await execute(params as never);

      expect(logger.debug).toHaveBeenCalledWith('cleanup_task_worktree called', { params });
    });

    it('should log cleanup start', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith('Cleaning up worktree for task task-1');
    });

    it('should log cleanup success', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith(
        'Worktree cleanup completed',
        expect.objectContaining({
          taskId: 'task-1',
          branchDeleted: true,
        }),
      );
    });

    it('should log errors with task context', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.cleanupWorktrees.mockRejectedValue(new Error('Test error'));

      await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      expect(logger.error).toHaveBeenCalledWith(
        'cleanup_task_worktree failed',
        expect.objectContaining({
          error: 'Test error',
          taskId: 'task-1',
        }),
      );
    });
  });

  describe('Response Format', () => {
    it('should return JSON.stringify() response', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      expect(typeof result).toBe('string');
      expect(() => {
        JSON.parse(result) as unknown;
      }).not.toThrow();

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('taskId');
    });

    it('should include all required success fields', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'success');
      expect(parsed).toHaveProperty('taskId');
      expect(parsed).toHaveProperty('cleaned');
      expect(parsed).toHaveProperty('branchDeleted');
    });

    it('should include all required failure fields', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.cleanupWorktrees.mockRejectedValue(new Error('Test error'));

      const result = await execute({
        taskId: 'task-1',
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'failed');
      expect(parsed).toHaveProperty('taskId');
      expect(parsed).toHaveProperty('cleaned');
      expect(parsed).toHaveProperty('error');
    });
  });
});

describe('VCS MCP Tools - list_task_worktrees', () => {
  let mockMcp: {
    addTool: ReturnType<typeof mock>;
  };

  let mockGitWrapper: {
    listWorktrees: ReturnType<typeof mock>;
  };

  /**
   * Helper to get the execute function for list_task_worktrees
   */
  function getExecuteFunction(): (params: never) => Promise<string> {
    const listCall = mockMcp.addTool.mock.calls.find(
      (call) => call[0].name === 'list_task_worktrees',
    );
    if (listCall === undefined) {
      throw new Error('list_task_worktrees tool not registered');
    }
    return listCall[0].execute as (params: never) => Promise<string>;
  }

  beforeEach(async () => {
    mock.restore();

    // Mock GitWrapper
    mockGitWrapper = {
      listWorktrees: mock().mockResolvedValue([]),
    };

    // Import and mock the module
    const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
    mock(GitWrapper).mockImplementation(() => mockGitWrapper as never);

    // Create mock FastMCP instance
    mockMcp = {
      addTool: mock(),
    };
  });

  describe('Tool Registration', () => {
    it('should register list_task_worktrees tool', () => {
      registerVcsTools(mockMcp as never);

      expect(mockMcp.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'list_task_worktrees',
          description: expect.stringContaining('List all active worktrees'),
          parameters: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    });
  });

  describe('Success Paths', () => {
    it('should list worktrees successfully', async () => {
      mockGitWrapper.listWorktrees.mockResolvedValue([
        {
          path: '/test/project/.chopstack/shadows/task-1',
          branch: 'task/task-1',
          head: 'abc123',
        },
        {
          path: '/test/project/.chopstack/shadows/task-2',
          branch: 'task/task-2',
          head: 'def456',
        },
      ]);

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('success');
      expect(response.worktrees).toHaveLength(2);
      expect(response.worktrees[0]).toMatchObject({
        taskId: 'task-1',
        path: '/test/project/.chopstack/shadows/task-1',
        branch: 'task/task-1',
        baseRef: 'abc123',
      });
    });

    it('should return empty list when no worktrees exist', async () => {
      mockGitWrapper.listWorktrees.mockResolvedValue([]);

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('success');
      expect(response.worktrees).toEqual([]);
    });

    it('should filter non-chopstack worktrees', async () => {
      mockGitWrapper.listWorktrees.mockResolvedValue([
        {
          path: '/test/project/.chopstack/shadows/task-1',
          branch: 'task/task-1',
          head: 'abc123',
        },
        {
          path: '/test/project',
          branch: 'main',
          head: 'xyz789',
        },
      ]);

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.worktrees).toHaveLength(1);
      expect(response.worktrees[0].taskId).toBe('task-1');
    });
  });

  describe('Failure Paths', () => {
    it('should handle git errors', async () => {
      mockGitWrapper.listWorktrees.mockRejectedValue(new Error('Git repository not found'));

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.error).toBe('Git repository not found');
    });

    it('should handle unknown error types', async () => {
      mockGitWrapper.listWorktrees.mockRejectedValue('String error');

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.error).toBe('Unknown error');
    });
  });

  describe('Logging', () => {
    it('should log debug info on tool call', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const params = {
        workdir: '/test/project',
      };

      await execute(params as never);

      expect(logger.debug).toHaveBeenCalledWith('list_task_worktrees called', { params });
    });

    it('should log worktree list start', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith('Listing active worktrees');
    });

    it('should log worktree count', async () => {
      mockGitWrapper.listWorktrees.mockResolvedValue([
        {
          path: '/test/project/.chopstack/shadows/task-1',
          branch: 'task/task-1',
          head: 'abc123',
        },
      ]);

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith('Found 1 active worktree(s)');
    });

    it('should log errors', async () => {
      mockGitWrapper.listWorktrees.mockRejectedValue(new Error('Test error'));

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        workdir: '/test/project',
      } as never);

      expect(logger.error).toHaveBeenCalledWith(
        'list_task_worktrees failed',
        expect.objectContaining({
          error: 'Test error',
        }),
      );
    });
  });

  describe('Response Format', () => {
    it('should return JSON.stringify() response', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      expect(typeof result).toBe('string');
      expect(() => {
        JSON.parse(result) as unknown;
      }).not.toThrow();

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('status');
    });

    it('should include all required success fields', async () => {
      mockGitWrapper.listWorktrees.mockResolvedValue([
        {
          path: '/test/project/.chopstack/shadows/task-1',
          branch: 'task/task-1',
          head: 'abc123',
        },
      ]);

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'success');
      expect(parsed).toHaveProperty('worktrees');
      expect(parsed.worktrees[0]).toHaveProperty('taskId');
      expect(parsed.worktrees[0]).toHaveProperty('path');
      expect(parsed.worktrees[0]).toHaveProperty('absolutePath');
      expect(parsed.worktrees[0]).toHaveProperty('branch');
      expect(parsed.worktrees[0]).toHaveProperty('baseRef');
      expect(parsed.worktrees[0]).toHaveProperty('created');
      expect(parsed.worktrees[0]).toHaveProperty('status');
    });

    it('should include all required failure fields', async () => {
      mockGitWrapper.listWorktrees.mockRejectedValue(new Error('Test error'));

      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const result = await execute({
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'failed');
      expect(parsed).toHaveProperty('error');
    });
  });
});
