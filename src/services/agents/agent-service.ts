import { match } from 'ts-pattern';

import type { AgentService, AgentType, DecomposerAgent } from '@/core/agents/interfaces';

import { ClaudeCodeDecomposer } from '@/adapters/agents/claude';
import { CodexDecomposer } from '@/adapters/agents/codex';
import { MockAgent as MockDecomposer } from '@/adapters/agents/mock';
import { logger } from '@/utils/global-logger';
import { AgentValidator } from '@/validation/agent-validator';

/**
 * Agent service implementation that provides agent orchestration,
 * capability detection, and fallback mechanisms
 */
export class AgentServiceImpl implements AgentService {
  private readonly agentCache = new Map<AgentType, DecomposerAgent>();
  private readonly capabilityCache = new Map<AgentType, boolean>();

  async createAgent(type: AgentType): Promise<DecomposerAgent> {
    // Check cache first
    const cachedAgent = this.agentCache.get(type);
    if (cachedAgent !== undefined) {
      return cachedAgent;
    }

    // Validate agent capabilities before creating
    await AgentValidator.validateAgentCapabilities(type);

    const agent = match(type)
      .with('claude', () => new ClaudeCodeDecomposer())
      .with('codex', () => new CodexDecomposer())
      .with('mock', () => new MockDecomposer())
      .exhaustive();

    // Cache the agent for reuse
    this.agentCache.set(type, agent);
    return agent;
  }

  async getAvailableAgents(): Promise<AgentType[]> {
    const allAgents: AgentType[] = ['claude', 'codex', 'mock'];
    const availableAgents: AgentType[] = [];

    for (const agentType of allAgents) {
      try {
        const isValid = await this.validateAgent(agentType);
        if (isValid) {
          availableAgents.push(agentType);
        }
      } catch {
        // Agent not available, continue
      }
    }

    return availableAgents;
  }

  async getAgentWithFallback(
    preferredType: AgentType,
    fallbacks: AgentType[] = ['mock'],
  ): Promise<DecomposerAgent> {
    // Try preferred agent first
    try {
      const isValid = await this.validateAgent(preferredType);
      if (isValid) {
        return await this.createAgent(preferredType);
      }
    } catch {
      // Preferred agent failed, try fallbacks
    }

    // Try fallback agents
    for (const fallbackType of fallbacks) {
      try {
        const isValid = await this.validateAgent(fallbackType);
        if (isValid) {
          logger.warn(`⚠️ Using fallback agent '${fallbackType}' instead of '${preferredType}'`);
          return await this.createAgent(fallbackType);
        }
      } catch {
        // Fallback failed, continue to next
      }
    }

    // If all else fails, create mock agent
    logger.warn(`⚠️ All agents failed, using mock agent for testing`);
    return this.createAgent('mock');
  }

  async validateAgent(type: AgentType): Promise<boolean> {
    // Check cache first
    const cachedResult = this.capabilityCache.get(type);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    try {
      await AgentValidator.validateAgentCapabilities(type);
      this.capabilityCache.set(type, true);
      return true;
    } catch {
      this.capabilityCache.set(type, false);
      return false;
    }
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCaches(): void {
    this.agentCache.clear();
    this.capabilityCache.clear();
  }
}
