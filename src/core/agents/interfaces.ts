import type { PlanV2 } from '@/types/schemas-v2';

/**
 * Core agent interface for task decomposition
 */
export type AgentProvider = {
  /**
   * Decompose a specification into tasks
   */
  decompose(spec: string, context: DecompositionContext): Promise<DecompositionResult>;

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapabilities | Promise<AgentCapabilities>;

  /**
   * Get agent type identifier
   */
  getType(): AgentType;

  /**
   * Check if the agent is available
   */
  isAvailable(): boolean | Promise<boolean>;
};

/**
 * Decomposer agent interface using v2 types
 */
export type DecomposerAgent = {
  decompose(specContent: string, cwd: string, options?: { verbose?: boolean }): Promise<PlanV2>;

  /**
   * Query the agent with an arbitrary prompt and return the raw response.
   * This is used for tasks that don't fit the decomposition pattern,
   * like codebase analysis or specification generation.
   */
  query?(prompt: string, cwd: string, options?: { verbose?: boolean }): Promise<string>;
};

/**
 * Agent type enumeration
 */
export type AgentType = 'claude' | 'codex' | 'mock';

/**
 * Agent service for orchestrating multiple agents
 */
export type AgentService = {
  /**
   * Create an agent instance
   */
  createAgent(type: AgentType): Promise<DecomposerAgent>;

  /**
   * Get agent with fallback support
   */
  getAgentWithFallback(preferredType: AgentType, fallbacks?: AgentType[]): Promise<DecomposerAgent>;

  /**
   * Get available agents
   */
  getAvailableAgents(): Promise<AgentType[]>;

  /**
   * Validate agent capabilities
   */
  validateAgent(type: AgentType): Promise<boolean>;
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
  existingPlan?: PlanV2;
  maxRetries?: number;
  verbose?: boolean;
};

/**
 * Result of decomposition
 */
export type DecompositionResult = {
  metadata?: Record<string, unknown>;
  plan: PlanV2;
  rawResponse?: string;
};

/**
 * Agent capabilities
 */
export type AgentCapabilities = {
  maxContextLength: number;
  models?: string[];
  supportsDecomposition: boolean;
  supportsStreaming?: boolean;
  version?: string;
};
