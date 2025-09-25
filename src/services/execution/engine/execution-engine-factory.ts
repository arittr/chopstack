import { TaskOrchestrator } from '@/services/mcp/orchestrator';
import { type VcsEngineConfig, VcsEngineServiceImpl } from '@/services/vcs';

import type { ExecutionEngine, ExecutionEngineDependencies } from './execution-engine';

import { StateManager } from './state-manager';

/**
 * Configuration for creating ExecutionEngine instances
 */
export type ExecutionEngineFactoryConfig = {
  /** Custom dependencies to override defaults */
  customDependencies?: Partial<ExecutionEngineDependencies>;
  /** VCS engine configuration */
  vcsConfig?: Partial<VcsEngineConfig>;
};

/**
 * Creates default ExecutionEngine dependencies
 */
export function createDefaultExecutionEngineDependencies(
  vcsConfig?: Partial<VcsEngineConfig>,
): ExecutionEngineDependencies {
  const defaultVcsConfig: VcsEngineConfig = {
    shadowPath: '.chopstack/shadows',
    branchPrefix: 'chopstack/',
    cleanupOnSuccess: true,
    cleanupOnFailure: false,
    conflictStrategy: 'auto',
    stackSubmission: {
      enabled: false,
      draft: true,
      autoMerge: false,
    },
    ...vcsConfig,
  };

  return {
    stateManager: new StateManager(),
    orchestrator: new TaskOrchestrator(),
    vcsEngine: new VcsEngineServiceImpl(defaultVcsConfig),
  };
}

/**
 * Factory function for creating ExecutionEngine instances with dependency injection
 */
export async function createExecutionEngine(
  config: ExecutionEngineFactoryConfig = {},
): Promise<ExecutionEngine> {
  const defaultDependencies = createDefaultExecutionEngineDependencies(config.vcsConfig);

  const dependencies: ExecutionEngineDependencies = {
    ...defaultDependencies,
    ...config.customDependencies,
  };

  const { ExecutionEngine } = await import('./execution-engine');
  return new ExecutionEngine(dependencies);
}

/**
 * Creates a test ExecutionEngine with mocked dependencies
 */
export async function createTestExecutionEngine(
  mockDependencies: Partial<ExecutionEngineDependencies> = {},
  vcsConfig?: Partial<VcsEngineConfig>,
): Promise<ExecutionEngine> {
  const testVcsConfig: Partial<VcsEngineConfig> = {
    shadowPath: '.test/shadows',
    branchPrefix: 'test/',
    cleanupOnSuccess: false,
    cleanupOnFailure: false,
    ...vcsConfig,
  };

  const defaultDeps = createDefaultExecutionEngineDependencies(testVcsConfig);

  const dependencies: ExecutionEngineDependencies = {
    ...defaultDeps,
    ...mockDependencies,
  };

  // Use dynamic import
  const { ExecutionEngine } = await import('./execution-engine');
  return new ExecutionEngine(dependencies);
}
