/**
 * Unit tests for VCS MCP tools
 *
 * Tests all VCS tools with mocked VCS services for isolation.
 * Verifies parameter validation, success cases, error handling, and response formats.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorktreeContext } from '@/core/vcs/domain-services';

import { VcsConfigServiceImpl } from '@/services/vcs/vcs-config';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';

import { registerVcsTools } from '../vcs-tools';

// Mock VcsConfigService
vi.mock('@/services/vcs/vcs-config', () => ({
  VcsConfigServiceImpl: vi.fn(),
}));

// Mock VcsEngineService
vi.mock('@/services/vcs/vcs-engine-service', () => ({
  VcsEngineServiceImpl: vi.fn(),
}));

// Mock logger
vi.mock('@/utils/global-logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('VCS MCP Tools - configure_vcs', () => {
  let mockConfigService: {
    createBackend: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    loadConfig: ReturnType<typeof vi.fn>;
    validateMode: ReturnType<typeof vi.fn>;
  };

  let mockBackend: {
    initialize: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
  };

  let mockMcp: {
    addTool: ReturnType<typeof vi.fn>;
  };

  /**
   * Helper to get the execute function from registered tool
   */
  function getExecuteFunction(): (params: never) => Promise<string> {
    const toolConfig = mockMcp.addTool.mock.calls[0]?.[0];
    if (toolConfig === undefined) {
      throw new Error('Tool not registered');
    }
    return toolConfig.execute as (params: never) => Promise<string>;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock backend
    mockBackend = {
      isAvailable: vi.fn(),
      initialize: vi.fn(),
    };

    // Create mock config service
    mockConfigService = {
      loadConfig: vi.fn(),
      validateMode: vi.fn(),
      createBackend: vi.fn(),
      getConfig: vi.fn(),
    };

    // Mock VcsConfigServiceImpl constructor to return our mock
    vi.mocked(VcsConfigServiceImpl).mockImplementation(() => mockConfigService as never);

    // Create mock FastMCP instance
    mockMcp = {
      addTool: vi.fn(),
    };
  });

  describe('Tool Registration', () => {
    it('should register configure_vcs tool', () => {
      registerVcsTools(mockMcp as never);

      expect(mockMcp.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'configure_vcs',
          description: expect.stringContaining('Configure VCS mode'),
          parameters: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    });
  });

  describe('Success Paths', () => {
    beforeEach(() => {
      mockConfigService.validateMode.mockResolvedValue('git-spice');
      mockConfigService.createBackend.mockResolvedValue(mockBackend as never);
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.initialize.mockResolvedValue(undefined);
    });

    it('should configure explicit git-spice mode successfully', async () => {
      registerVcsTools(mockMcp as never);
      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
        trunk: 'main',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'success',
        mode: 'git-spice',
        available: true,
        capabilities: {
          supportsStacking: true,
          supportsParallel: true,
        },
      });

      // Verify service calls
      expect(mockConfigService.loadConfig).toHaveBeenCalledWith('/test/project', 'git-spice');
      expect(mockConfigService.validateMode).toHaveBeenCalledWith('git-spice', true);
      expect(mockBackend.initialize).toHaveBeenCalledWith('/test/project', 'main');
    });

    it('should configure default merge-commit mode when mode omitted', async () => {
      mockConfigService.validateMode.mockResolvedValue('merge-commit');
      registerVcsTools(mockMcp as never);
      const executeFunction = getExecuteFunction();

      const params = {
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'success',
        mode: 'merge-commit',
        available: true,
        capabilities: {
          supportsStacking: false,
          supportsParallel: true,
        },
      });

      // Verify explicit mode is false
      expect(mockConfigService.validateMode).toHaveBeenCalledWith('merge-commit', false);
    });

    it('should support graphite mode with stacking capabilities', async () => {
      mockConfigService.validateMode.mockResolvedValue('graphite');
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'graphite' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed.capabilities).toMatchObject({
        supportsStacking: true,
        supportsParallel: true,
      });
    });

    it('should support legacy stacked mode alias', async () => {
      mockConfigService.validateMode.mockResolvedValue('stacked');
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'stacked' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed.capabilities.supportsStacking).toBe(true);
    });
  });

  describe('Failure Paths', () => {
    beforeEach(() => {
      mockConfigService.createBackend.mockResolvedValue(mockBackend as never);
      mockBackend.initialize.mockResolvedValue(undefined);
    });

    it('should fail with installation instructions for explicit unavailable mode', async () => {
      mockConfigService.validateMode.mockResolvedValue('git-spice');
      mockBackend.isAvailable.mockResolvedValue(false);

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'failed',
        mode: 'git-spice',
        available: false,
        error: expect.stringContaining("VCS tool for mode 'git-spice' not found"),
      });

      expect(logger.error).toHaveBeenCalled();
    });

    it('should fail with git error for default mode when git missing', async () => {
      mockConfigService.validateMode.mockResolvedValue('merge-commit');
      mockBackend.isAvailable.mockResolvedValue(false);

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'failed',
        error: 'Git not found. Please install git to use chopstack.',
      });
    });

    it('should handle VcsConfigService errors gracefully', async () => {
      mockConfigService.loadConfig.mockRejectedValue(new Error('Config file corrupted'));

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'failed',
        error: 'Config file corrupted',
      });

      expect(logger.error).toHaveBeenCalledWith('configure_vcs failed', expect.any(Object));
    });

    it('should handle backend initialization errors', async () => {
      mockConfigService.validateMode.mockResolvedValue('git-spice');
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.initialize.mockRejectedValue(new Error('Repository not initialized'));

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'failed',
        error: 'Repository not initialized',
      });
    });

    it('should handle unknown errors gracefully', async () => {
      mockConfigService.loadConfig.mockRejectedValue('String error');

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toMatchObject({
        status: 'failed',
        error: 'Unknown error',
      });
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      mockConfigService.validateMode.mockResolvedValue('git-spice');
      mockConfigService.createBackend.mockResolvedValue(mockBackend as never);
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.initialize.mockResolvedValue(undefined);
    });

    it('should log debug info on tool call', async () => {
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      await executeFunction(params as never);

      expect(logger.debug).toHaveBeenCalledWith('configure_vcs called', { params });
    });

    it('should log mode configuration', async () => {
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      await executeFunction(params as never);

      expect(logger.info).toHaveBeenCalledWith('Configuring VCS mode: git-spice (explicit: true)');
    });

    it('should log backend initialization', async () => {
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
        trunk: 'develop',
      };

      await executeFunction(params as never);

      expect(logger.info).toHaveBeenCalledWith(
        'VCS backend initialized: git-spice',
        expect.objectContaining({
          workdir: '/test/project',
          trunk: 'develop',
        }),
      );
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      mockConfigService.validateMode.mockResolvedValue('merge-commit');
      mockConfigService.createBackend.mockResolvedValue(mockBackend as never);
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.initialize.mockResolvedValue(undefined);
    });

    it('should return JSON.stringify() response', async () => {
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);

      expect(typeof result).toBe('string');
      expect(() => {
        JSON.parse(result) as unknown;
      }).not.toThrow();
    });

    it('should include all required success fields', async () => {
      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'merge-commit' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('status', 'success');
      expect(parsed).toHaveProperty('mode');
      expect(parsed).toHaveProperty('available');
      expect(parsed).toHaveProperty('capabilities');
      expect(parsed.capabilities).toHaveProperty('supportsStacking');
      expect(parsed.capabilities).toHaveProperty('supportsParallel');
    });

    it('should include all required failure fields', async () => {
      mockBackend.isAvailable.mockResolvedValue(false);

      registerVcsTools(mockMcp as never);

      const executeFunction = getExecuteFunction();

      const params = {
        mode: 'git-spice' as const,
        workdir: '/test/project',
      };

      const result = await executeFunction(params as never);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('status', 'failed');
      expect(parsed).toHaveProperty('error');
    });
  });
});

describe('VCS MCP Tools - create_task_worktree', () => {
  let mockVcsEngine: {
    createWorktreesForTasks: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
  };

  let mockMcp: {
    addTool: ReturnType<typeof vi.fn>;
  };

  /**
   * Helper to get the execute function for create_task_worktree
   */
  function getExecuteFunction(): (params: never) => Promise<string> {
    const createWorktreeCall = mockMcp.addTool.mock.calls.find(
      (call) => call[0].name === 'create_task_worktree',
    );
    if (createWorktreeCall === undefined) {
      throw new Error('create_task_worktree tool not registered');
    }
    return createWorktreeCall[0].execute as (params: never) => Promise<string>;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock VcsEngineService
    mockVcsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      createWorktreesForTasks: vi.fn(),
    };

    vi.mocked(VcsEngineServiceImpl).mockImplementation(
      () => mockVcsEngine as unknown as VcsEngineServiceImpl,
    );

    // Create mock FastMCP instance
    mockMcp = {
      addTool: vi.fn(),
    };
  });

  describe('Tool Registration', () => {
    it('should register create_task_worktree tool', () => {
      registerVcsTools(mockMcp as never);

      expect(mockMcp.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'create_task_worktree',
          description: expect.stringContaining('isolated worktree'),
          parameters: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    });
  });

  describe('Success Paths', () => {
    it('should create worktree successfully with minimal params', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const mockWorktree: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'task/task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: '/test/project/.chopstack/shadows/task-1',
        baseRef: 'main',
        created: new Date(),
      };

      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response).toEqual({
        status: 'success',
        taskId: 'task-1',
        path: '.chopstack/shadows/task-1',
        absolutePath: '/test/project/.chopstack/shadows/task-1',
        branch: 'task/task-1',
        baseRef: 'main',
      });

      // Verify VcsEngine was called correctly
      expect(mockVcsEngine.initialize).toHaveBeenCalledWith('/test/project');
      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'task-1',
            name: 'task-1',
            files: [],
            complexity: 'M',
            description: 'task-1',
            acceptanceCriteria: [],
            dependencies: [],
            maxRetries: 0,
            retryCount: 0,
            state: 'pending',
            stateHistory: [],
          }),
        ],
        'main',
        '/test/project',
      );
    });

    it('should create worktree with task metadata', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const mockWorktree: WorktreeContext = {
        taskId: 'task-auth',
        branchName: 'task/task-auth',
        worktreePath: '.chopstack/shadows/task-auth',
        absolutePath: '/test/project/.chopstack/shadows/task-auth',
        baseRef: 'main',
        created: new Date(),
      };

      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);

      const result = await execute({
        taskId: 'task-auth',
        baseRef: 'main',
        workdir: '/test/project',
        task: {
          name: 'Implement authentication',
          files: ['src/auth/login.ts', 'src/auth/session.ts'],
        },
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('success');
      expect(response.taskId).toBe('task-auth');

      // Verify task metadata was passed
      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'task-auth',
            name: 'Implement authentication',
            files: ['src/auth/login.ts', 'src/auth/session.ts'],
            complexity: 'M',
            description: 'Implement authentication',
          }),
        ],
        'main',
        '/test/project',
      );
    });

    it('should use current directory when workdir not provided', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const currentDir = process.cwd();
      const mockWorktree: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'task/task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: `${currentDir}/.chopstack/shadows/task-1`,
        baseRef: 'main',
        created: new Date(),
      };

      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);

      await execute({
        taskId: 'task-1',
        baseRef: 'main',
      } as never);

      expect(mockVcsEngine.initialize).toHaveBeenCalledWith(currentDir);
      expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
        expect.any(Array),
        'main',
        currentDir,
      );
    });
  });

  describe('Failure Paths', () => {
    it('should handle branch name collision errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.createWorktreesForTasks.mockRejectedValue(
        new Error('Branch already exists: task/task-1'),
      );

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.taskId).toBe('task-1');
      expect(response.error).toContain('Branch name collision');
      expect(response.error).toContain('git worktree remove');
      expect(response.error).toContain('git branch -d');
    });

    it('should handle worktree creation failure with no contexts', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      // Return empty array (no worktrees created)
      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([]);

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.taskId).toBe('task-1');
      expect(response.error).toContain('Failed to create worktree');
    });

    it('should handle generic errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.createWorktreesForTasks.mockRejectedValue(
        new Error('Git operation failed: unable to write to repository'),
      );

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.taskId).toBe('task-1');
      expect(response.error).toBe('Git operation failed: unable to write to repository');
    });

    it('should handle collision error pattern variations', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.createWorktreesForTasks.mockRejectedValue(
        new Error('worktree collision detected for task-1'),
      );

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.error).toContain('Branch name collision');
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      const mockWorktree: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'task/task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: '/test/project/.chopstack/shadows/task-1',
        baseRef: 'main',
        created: new Date(),
      };
      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);
    });

    it('should log debug info on tool call', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const params = {
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      };

      await execute(params as never);

      expect(logger.debug).toHaveBeenCalledWith('create_task_worktree called', { params });
    });

    it('should log worktree creation start', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith('Creating worktree for task task-1 from main');
    });

    it('should log worktree creation success', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith(
        'Worktree created successfully',
        expect.objectContaining({
          taskId: 'task-1',
          branch: 'task/task-1',
        }),
      );
    });

    it('should log errors with task context', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.createWorktreesForTasks.mockRejectedValue(new Error('Test error'));

      await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      expect(logger.error).toHaveBeenCalledWith(
        'create_task_worktree failed',
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

      const mockWorktree: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'task/task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: '/test/project/.chopstack/shadows/task-1',
        baseRef: 'main',
        created: new Date(),
      };

      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      // Verify result is a valid JSON string
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

      const mockWorktree: WorktreeContext = {
        taskId: 'task-1',
        branchName: 'task/task-1',
        worktreePath: '.chopstack/shadows/task-1',
        absolutePath: '/test/project/.chopstack/shadows/task-1',
        baseRef: 'main',
        created: new Date(),
      };

      mockVcsEngine.createWorktreesForTasks.mockResolvedValue([mockWorktree]);

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'success');
      expect(parsed).toHaveProperty('taskId');
      expect(parsed).toHaveProperty('path');
      expect(parsed).toHaveProperty('absolutePath');
      expect(parsed).toHaveProperty('branch');
      expect(parsed).toHaveProperty('baseRef');
    });

    it('should include all required failure fields', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.createWorktreesForTasks.mockRejectedValue(new Error('Test error'));

      const result = await execute({
        taskId: 'task-1',
        baseRef: 'main',
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'failed');
      expect(parsed).toHaveProperty('taskId');
      expect(parsed).toHaveProperty('error');
    });
  });
});

describe('VCS MCP Tools - integrate_task_stack', () => {
  let mockVcsEngine: {
    buildStackFromTasks: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
  };

  let mockMcp: {
    addTool: ReturnType<typeof vi.fn>;
  };

  /**
   * Helper to get the execute function for integrate_task_stack
   */
  function getExecuteFunction(): (params: never) => Promise<string> {
    const integrateStackCall = mockMcp.addTool.mock.calls.find(
      (call) => call[0].name === 'integrate_task_stack',
    );
    if (integrateStackCall === undefined) {
      throw new Error('integrate_task_stack tool not registered');
    }
    return integrateStackCall[0].execute as (params: never) => Promise<string>;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock VcsEngineService
    mockVcsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      buildStackFromTasks: vi.fn(),
    };

    vi.mocked(VcsEngineServiceImpl).mockImplementation(
      () => mockVcsEngine as unknown as VcsEngineServiceImpl,
    );

    // Create mock FastMCP instance
    mockMcp = {
      addTool: vi.fn(),
    };
  });

  describe('Tool Registration', () => {
    it('should register integrate_task_stack tool', () => {
      registerVcsTools(mockMcp as never);

      expect(mockMcp.addTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'integrate_task_stack',
          description: expect.stringContaining('Integrate completed task branches'),
          parameters: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    });
  });

  describe('Success Paths', () => {
    it('should integrate single task successfully', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: [],
      });

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        submit: false,
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response).toEqual({
        status: 'success',
        branches: ['task/task-1'],
        conflicts: [],
        prUrls: [],
      });

      // Verify VcsEngine was called correctly
      expect(mockVcsEngine.initialize).toHaveBeenCalledWith('/test/project');
      expect(mockVcsEngine.buildStackFromTasks).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'task-1',
            name: 'Setup types',
            branchName: 'task/task-1',
            complexity: 'M',
            state: 'completed',
          }),
        ],
        '/test/project',
        {
          parentRef: 'main',
          submitStack: false,
        },
      );
    });

    it('should integrate multiple tasks successfully', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [
          { branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' },
          { branchName: 'task/task-2', commitHash: 'def456', taskId: 'task-2' },
        ],
        parentRef: 'main',
        prUrls: [],
      });

      const result = await execute({
        tasks: [
          { id: 'task-1', name: 'Setup types' },
          { id: 'task-2', name: 'Add validation' },
        ],
        targetBranch: 'main',
        submit: false,
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('success');
      expect(response.branches).toEqual(['task/task-1', 'task/task-2']);
      expect(response.conflicts).toEqual([]);
    });

    it('should integrate with custom branch names', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'custom/branch-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: [],
      });

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Custom task', branchName: 'custom/branch-1' }],
        targetBranch: 'main',
        submit: false,
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.branches).toEqual(['custom/branch-1']);

      // Verify custom branch name was passed
      expect(mockVcsEngine.buildStackFromTasks).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'task-1',
            branchName: 'custom/branch-1',
          }),
        ],
        '/test/project',
        expect.any(Object),
      );
    });

    it('should integrate with PR submission', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: ['https://github.com/org/repo/pull/123'],
      });

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        submit: true,
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('success');
      expect(response.prUrls).toEqual(['https://github.com/org/repo/pull/123']);

      // Verify submit flag was passed
      expect(mockVcsEngine.buildStackFromTasks).toHaveBeenCalledWith(
        expect.any(Array),
        '/test/project',
        expect.objectContaining({
          submitStack: true,
        }),
      );
    });

    it('should use current directory when workdir not provided', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const currentDir = process.cwd();
      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: [],
      });

      await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
      } as never);

      expect(mockVcsEngine.initialize).toHaveBeenCalledWith(currentDir);
      expect(mockVcsEngine.buildStackFromTasks).toHaveBeenCalledWith(
        expect.any(Array),
        currentDir,
        expect.any(Object),
      );
    });
  });

  describe('Failure Paths', () => {
    it('should handle merge conflict errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue(
        new Error('Merge conflict in src/auth/login.ts'),
      );

      const result = await execute({
        tasks: [
          { id: 'task-1', name: 'Setup types' },
          { id: 'task-2', name: 'Add validation' },
        ],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.conflicts).toHaveLength(2);
      expect(response.conflicts[0]).toMatchObject({
        taskId: 'task-1',
        files: [],
        resolution: expect.stringContaining('Fix conflicts in worktree'),
      });
      expect(response.error).toContain('merge conflicts');
    });

    it('should handle rebase conflict errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue(
        new Error('Rebase failed with conflicts'),
      );

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.conflicts).toHaveLength(1);
      expect(response.error).toContain('merge conflicts');
    });

    it('should handle generic integration errors', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue(
        new Error('Branch not found: task/task-1'),
      );

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.conflicts).toEqual([]);
      expect(response.error).toBe('Branch not found: task/task-1');
    });

    it('should handle unknown error types', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue('String error');

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      const response = JSON.parse(result);
      expect(response.status).toBe('failed');
      expect(response.error).toBe('Unknown error');
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: [],
      });
    });

    it('should log debug info on tool call', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      const params = {
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      };

      await execute(params as never);

      expect(logger.debug).toHaveBeenCalledWith('integrate_task_stack called', { params });
    });

    it('should log integration start', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        submit: false,
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith('Integrating 1 task(s) into main');
    });

    it('should log integration with PR submission', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        submit: true,
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith(
        'Integrating 1 task(s) into main with PR submission',
      );
    });

    it('should log integration success', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      expect(logger.info).toHaveBeenCalledWith(
        'Stack integration completed',
        expect.objectContaining({
          branches: ['task/task-1'],
        }),
      );
    });

    it('should log errors with task context', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue(new Error('Test error'));

      await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      expect(logger.error).toHaveBeenCalledWith(
        'integrate_task_stack failed',
        expect.objectContaining({
          error: 'Test error',
          tasks: [{ id: 'task-1', name: 'Setup types' }],
        }),
      );
    });
  });

  describe('Response Format', () => {
    it('should return JSON.stringify() response', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: [],
      });

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      // Verify result is a valid JSON string
      expect(typeof result).toBe('string');
      expect(() => {
        JSON.parse(result) as unknown;
      }).not.toThrow();

      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('branches');
    });

    it('should include all required success fields', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockResolvedValue({
        branches: [{ branchName: 'task/task-1', commitHash: 'abc123', taskId: 'task-1' }],
        parentRef: 'main',
        prUrls: ['https://github.com/org/repo/pull/123'],
      });

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        submit: true,
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'success');
      expect(parsed).toHaveProperty('branches');
      expect(parsed).toHaveProperty('conflicts');
      expect(parsed).toHaveProperty('prUrls');
    });

    it('should include all required failure fields', async () => {
      registerVcsTools(mockMcp as never);
      const execute = getExecuteFunction();

      mockVcsEngine.buildStackFromTasks.mockRejectedValue(new Error('Test error'));

      const result = await execute({
        tasks: [{ id: 'task-1', name: 'Setup types' }],
        targetBranch: 'main',
        workdir: '/test/project',
      } as never);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status', 'failed');
      expect(parsed).toHaveProperty('branches');
      expect(parsed).toHaveProperty('conflicts');
      expect(parsed).toHaveProperty('error');
    });
  });
});
