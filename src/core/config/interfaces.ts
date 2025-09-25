import type { ExecutionMode, ExecutionStrategy } from '@/types/execution';

/**
 * Core configuration for execution
 */
export type ExecutionConfig = {
  continueOnError: boolean;
  cwd: string;
  dryRun: boolean;
  maxRetries: number;
  mode: ExecutionMode;
  strategy: ExecutionStrategy;
  timeout?: number;
  verbose: boolean;
};

/**
 * Configuration for VCS operations
 */
export type VcsConfig = {
  autoCommit: boolean;
  autoSubmit: boolean;
  baseBranch: string;
  branchPrefix?: string;
  provider: 'git' | 'git-spice' | 'graphite';
  pullRequestTemplate?: string;
};

/**
 * Configuration for agent operations
 */
export type AgentConfig = {
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  timeout?: number;
  type: 'claude' | 'aider' | 'mock';
};

/**
 * Complete application configuration
 */
export type AppConfig = {
  agent: AgentConfig;
  execution: ExecutionConfig;
  vcs: VcsConfig;
};

/**
 * Configuration source
 */
export type ConfigSource = {
  load(): Promise<Partial<AppConfig>>;
};

/**
 * Configuration loader that merges multiple sources
 */
export type ConfigLoader = {
  addSource(source: ConfigSource): void;
  load(): Promise<AppConfig>;
};
