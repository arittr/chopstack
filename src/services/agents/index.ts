import { AgentServiceImpl } from './agent-service';

export { AgentServiceImpl };
export type { AgentService, AgentType, DecomposerAgent } from '@/core/agents/interfaces';

/**
 * Create a default agent service instance
 */
export function createAgentService(): AgentServiceImpl {
  return new AgentServiceImpl();
}
