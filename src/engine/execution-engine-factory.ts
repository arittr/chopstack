import type { VcsEngineDependencies, VcsEngineOptions } from '@/vcs/engine/vcs-engine';

import { TaskOrchestrator } from '@/mcp/orchestrator';
import { isNonNullish } from '@/validation/guards';
import { VcsEngine } from '@/vcs/engine/vcs-engine';
import { createDefaultVcsEngineDependencies } from '@/vcs/engine/vcs-engine-factory';

import type { ExecutionEngine, ExecutionEngineDependencies } from './execution-engine';

import { ExecutionMonitor } from './execution-monitor';
import { ExecutionPlanner } from './execution-planner';
import { StateManager } from './state-manager';

/**
 * Configuration for creating ExecutionEngine instances
 */
export type ExecutionEngineFactoryConfig = {
  /** Custom dependencies to override defaults */
  customDependencies?: Partial<ExecutionEngineDependencies>;
  /** VCS engine configuration */
  vcsConfig?: {
    dependencies?: Partial<VcsEngineDependencies>;
    options?: Partial<VcsEngineOptions>;
  };
};

/**
 * Creates default ExecutionEngine dependencies
 */
export function createDefaultExecutionEngineDependencies(
  vcsConfig?: ExecutionEngineFactoryConfig['vcsConfig'],
): ExecutionEngineDependencies {
  const vcsOptions: VcsEngineOptions = {
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
    ...vcsConfig?.options,
  };

  const vcsDependencies = {
    ...createDefaultVcsEngineDependencies(vcsOptions),
    ...vcsConfig?.dependencies,
  };

  return {
    planner: new ExecutionPlanner(),
    stateManager: new StateManager(),
    monitor: new ExecutionMonitor(),
    orchestrator: new TaskOrchestrator(),
    vcsEngine: new VcsEngine(vcsDependencies, vcsOptions),
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
  vcsConfig?: ExecutionEngineFactoryConfig['vcsConfig'],
): Promise<ExecutionEngine> {
  const testVcsConfig: ExecutionEngineFactoryConfig['vcsConfig'] = {
    options: {
      shadowPath: '.test/shadows',
      branchPrefix: 'test/',
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      ...vcsConfig?.options,
    },
    ...(isNonNullish(vcsConfig?.dependencies) && { dependencies: vcsConfig.dependencies }),
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
