import { match } from 'ts-pattern';

import type { AgentType, DecomposerAgent } from '../types/decomposer';

import { AgentValidator } from '../validation/agent-validator';

import { ClaudeCodeDecomposer } from './claude';
import { CodexDecomposer } from './codex';
import { MockDecomposer } from './mock';

/**
 * Create a decomposer agent after validating required dependencies
 */
export async function createDecomposerAgent(
  agentType: AgentType | 'mock',
): Promise<DecomposerAgent> {
  // Validate agent capabilities before creating the instance
  await AgentValidator.validateAgentCapabilities(agentType);

  return match(agentType)
    .with('claude', () => new ClaudeCodeDecomposer())
    .with('codex', () => new CodexDecomposer())
    .with('mock', () => new MockDecomposer())
    .exhaustive();
}

export { ClaudeCodeDecomposer, CodexDecomposer };
export type { DecomposerAgent };
