import type { AgentType, DecomposerAgent } from '@/core/agents/interfaces';

import { AgentServiceImpl } from '@/services/agents';

export { ClaudeCodeDecomposer } from './claude';
export { CodexDecomposer } from './codex';
export { MockDecomposer } from './mock';

/**
 * Create a decomposer agent after validating required dependencies
 * @deprecated Use AgentServiceImpl.createAgent() instead
 */
export async function createDecomposerAgent(agentType: AgentType): Promise<DecomposerAgent> {
  const agentService = new AgentServiceImpl();
  return agentService.createAgent(agentType);
}

export type { AgentType, DecomposerAgent };
