import type { Plan } from '@/types/decomposer';

/**
 * Core agent provider interface
 */
export type AgentProvider = {
  /**
   * Decompose a specification into tasks
   */
  decompose(spec: string, context: DecompositionContext): Promise<DecompositionResult>;

  /**
   * Generate a commit message
   */
  generateCommitMessage(files: string[], context: CommitContext): Promise<string>;

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapabilities;

  /**
   * Initialize the agent
   */
  initialize(config: AgentConfig): Promise<void>;

  /**
   * Check if the agent is available
   */
  isAvailable(): Promise<boolean>;
};

/**
 * Agent configuration
 */
export type AgentConfig = {
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  timeout?: number;
};

/**
 * Context for decomposition
 */
export type DecompositionContext = {
  cwd: string;
  existingPlan?: Plan;
  maxRetries: number;
  verbose: boolean;
};

/**
 * Result of decomposition
 */
export type DecompositionResult = {
  metadata?: Record<string, unknown>;
  plan: Plan;
  rawResponse?: string;
};

/**
 * Context for commit message generation
 */
export type CommitContext = {
  branch?: string;
  cwd: string;
  verbose: boolean;
};

/**
 * Agent capabilities
 */
export type AgentCapabilities = {
  maxContextLength: number;
  models: string[];
  supportsCommitMessages: boolean;
  supportsDecomposition: boolean;
  supportsStreaming: boolean;
};
