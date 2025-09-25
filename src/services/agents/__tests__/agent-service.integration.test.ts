import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentType } from '@/core/agents/interfaces';

import { AgentServiceImpl } from '@/services/agents/agent-service';

// Mock external dependencies but use real agent classes
vi.mock('@/validation/agent-validator', () => ({
  AgentValidator: {
    validateAgentCapabilities: vi.fn().mockResolvedValue(true),
  },
}));

// Mock the actual agent implementations to avoid external API calls
vi.mock('@/adapters/agents/claude', () => ({
  ClaudeCodeDecomposer: class MockClaudeCodeDecomposer {
    async decompose(): Promise<{ tasks: unknown[] }> {
      await Promise.resolve();
      return { tasks: [] };
    }
  },
}));

vi.mock('@/adapters/agents/codex', () => ({
  CodexDecomposer: class MockCodexDecomposer {
    async decompose(): Promise<{ tasks: unknown[] }> {
      await Promise.resolve();
      return { tasks: [] };
    }
  },
}));

describe('AgentService integration tests', () => {
  let agentService: AgentServiceImpl;

  beforeEach(() => {
    agentService = new AgentServiceImpl();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAgent', () => {
    it('should create and cache claude agent', async () => {
      const agent1 = await agentService.createAgent('claude');
      const agent2 = await agentService.createAgent('claude');

      // Should return the same cached instance
      expect(agent1).toBe(agent2);
      expect(agent1).toBeDefined();
    });

    it('should create different instances for different agent types', async () => {
      const claudeAgent = await agentService.createAgent('claude');
      const mockAgent = await agentService.createAgent('mock');

      expect(claudeAgent).not.toBe(mockAgent);
      expect(claudeAgent).toBeDefined();
      expect(mockAgent).toBeDefined();
    });

    it('should create codex agent when requested', async () => {
      const agent = await agentService.createAgent('codex');

      expect(agent).toBeDefined();
      expect(typeof agent.decompose).toBe('function');
    });

    it('should create mock agent when requested', async () => {
      const agent = await agentService.createAgent('mock');

      expect(agent).toBeDefined();
      expect(typeof agent.decompose).toBe('function');
    });
  });

  describe('getAvailableAgents', () => {
    it('should return all agents when validation passes', async () => {
      const available = await agentService.getAvailableAgents();

      expect(available).toContain('claude');
      expect(available).toContain('codex');
      expect(available).toContain('mock');
      expect(available.length).toBeGreaterThan(0);
    });

    it('should exclude agents that fail validation', async () => {
      // Create new service instance to avoid cached results
      const freshService = new AgentServiceImpl();

      const { AgentValidator } = await import('@/validation/agent-validator');
      const mockValidate = vi.mocked(AgentValidator.validateAgentCapabilities);

      // Mock claude to fail validation, others to pass
      mockValidate.mockImplementation(async (type: AgentType) => {
        await Promise.resolve();
        if (type === 'claude') {
          throw new Error('Claude not available');
        }
      });

      const available = await freshService.getAvailableAgents();

      expect(available).not.toContain('claude');
      expect(available).toContain('codex');
      expect(available).toContain('mock');
    });
  });

  describe('validateAgent', () => {
    it('should validate agents and cache results', async () => {
      // First validation
      const result1 = await agentService.validateAgent('claude');
      expect(result1).toBe(true);

      // Second validation should use cached result
      const result2 = await agentService.validateAgent('claude');
      expect(result2).toBe(true);

      // Should have called the validator only once due to caching
      const { AgentValidator } = await import('@/validation/agent-validator');
      expect(AgentValidator.validateAgentCapabilities).toHaveBeenCalledTimes(1);
    });

    it('should handle validation failures gracefully', async () => {
      const { AgentValidator } = await import('@/validation/agent-validator');
      const mockValidate = vi.mocked(AgentValidator.validateAgentCapabilities);

      mockValidate.mockRejectedValue(new Error('Validation failed'));

      const result = await agentService.validateAgent('claude');

      expect(result).toBe(false);
    });
  });

  describe('getAgentWithFallback', () => {
    it('should return preferred agent when available', async () => {
      const agent = await agentService.getAgentWithFallback('claude', ['mock']);

      expect(agent).toBeDefined();
      expect(typeof agent.decompose).toBe('function');
    });

    it('should fallback to alternative when preferred fails', async () => {
      // Create fresh service to avoid caching
      const freshService = new AgentServiceImpl();

      const { AgentValidator } = await import('@/validation/agent-validator');
      const mockValidate = vi.mocked(AgentValidator.validateAgentCapabilities);

      // Mock claude to fail, mock to succeed
      mockValidate.mockImplementation(async (type: AgentType) => {
        await Promise.resolve();
        if (type === 'claude') {
          throw new Error('Claude not available');
        }
      });

      const agent = await freshService.getAgentWithFallback('claude', ['mock']);

      expect(agent).toBeDefined();
      expect(typeof agent.decompose).toBe('function');
    });
  });

  describe('error handling and resilience', () => {
    it('should handle agent creation failures gracefully', async () => {
      const { AgentValidator } = await import('@/validation/agent-validator');
      vi.mocked(AgentValidator.validateAgentCapabilities).mockRejectedValue(
        new Error('Agent not available'),
      );

      await expect(agentService.createAgent('claude')).rejects.toThrow('Agent not available');
    });

    it('should maintain separate caches for different agent types', async () => {
      // Create agents of different types
      const claude = await agentService.createAgent('claude');
      const mock = await agentService.createAgent('mock');

      // Create them again - should get cached versions
      const claude2 = await agentService.createAgent('claude');
      const mock2 = await agentService.createAgent('mock');

      expect(claude).toBe(claude2);
      expect(mock).toBe(mock2);
      expect(claude).not.toBe(mock);
    });
  });

  describe('agent lifecycle management', () => {
    it('should provide methods for agent lifecycle', async () => {
      // Test that the service handles agent lifecycle appropriately
      const agent = await agentService.createAgent('mock');

      // Should have standard decomposer interface
      expect(agent.decompose).toBeDefined();
      expect(typeof agent.decompose).toBe('function');

      // Should be able to call decompose method
      const result = await agent.decompose('test spec', '/test/dir', { verbose: false });
      expect(result).toBeDefined();
      expect(result.tasks).toBeDefined();
    });

    it('should handle concurrent agent creation', async () => {
      // Create multiple agents concurrently
      const promises = [
        agentService.createAgent('claude'),
        agentService.createAgent('claude'),
        agentService.createAgent('mock'),
        agentService.createAgent('mock'),
      ];

      const agents = await Promise.all(promises);

      // All agents should exist
      expect(agents).toHaveLength(4);
      for (const agent of agents) {
        expect(agent).toBeDefined();
        expect(typeof agent.decompose).toBe('function');
      }

      // Different agent types should be different instances
      expect(agents[0]).not.toBe(agents[2]); // Claude vs Mock
    });
  });
});
