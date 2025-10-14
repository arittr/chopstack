import type { AgentType, DecomposerAgent } from '@/core/agents/interfaces';
import type { Agent } from '@/types/agent';

import { AgentServiceImpl } from '@/services/agents';

// V1 Legacy exports (deprecated)
export { ClaudeCodeDecomposer } from './claude';

export { CodexDecomposer } from './codex';
// V2 Agent exports
export { MockAgent } from './mock';

/**
 * Create a decomposer agent after validating required dependencies
 * @deprecated Use AgentServiceImpl.createAgent() instead
 */
export async function createDecomposerAgent(agentType: AgentType): Promise<DecomposerAgent> {
  const agentService = new AgentServiceImpl();
  return agentService.createAgent(agentType);
}

export type { Agent, AgentType, DecomposerAgent };
