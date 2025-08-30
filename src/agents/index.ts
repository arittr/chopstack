import { match } from 'ts-pattern';

import type { AgentType, DecomposerAgent } from '../types/decomposer';

import { AgentValidator } from '../utils/agent-validator';

import { AiderDecomposer } from './aider';
import { ClaudeCodeDecomposer } from './claude';
import { MockDecomposer } from './mock';

/**
 * Create a decomposer agent after validating required dependencies
 */
export async function createDecomposerAgent(agentType: AgentType | 'mock'): Promise<DecomposerAgent> {
  // Validate agent capabilities before creating the instance
  await AgentValidator.validateAgentCapabilities(agentType);
  
  return match(agentType)
    .with('claude', () => new ClaudeCodeDecomposer())
    .with('aider', () => new AiderDecomposer())
    .with('mock', () => new MockDecomposer())
    .exhaustive();
}

export { AiderDecomposer, ClaudeCodeDecomposer };
export type { DecomposerAgent };
