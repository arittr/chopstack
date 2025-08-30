import { match } from 'ts-pattern';

import type { AgentType, DecomposerAgent } from '../types/decomposer';

import { AiderDecomposer } from './aider';
import { ClaudeCodeDecomposer } from './claude';
import { MockDecomposer } from './mock';

export function createDecomposerAgent(agentType: AgentType | 'mock'): DecomposerAgent {
  return match(agentType)
    .with('claude', () => new ClaudeCodeDecomposer())
    .with('aider', () => new AiderDecomposer())
    .with('mock', () => new MockDecomposer())
    .exhaustive();
}

export { AiderDecomposer, ClaudeCodeDecomposer };
export type { DecomposerAgent };
