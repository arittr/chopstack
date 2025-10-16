/**
 * Unit tests for VCS MCP tools
 *
 * Tests the configure_vcs tool with mocked VcsConfigService.
 * Validates parameter handling, success/failure paths, and response format.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VcsConfigServiceImpl } from '@/services/vcs/vcs-config';
import { logger } from '@/utils/global-logger';

import { registerVcsTools } from '../vcs-tools';

// Mock VcsConfigService
vi.mock('@/services/vcs/vcs-config', () => ({
  VcsConfigServiceImpl: vi.fn(),
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
