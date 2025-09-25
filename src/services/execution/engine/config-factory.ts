/**
 * Configuration-driven factory for creating engine instances
 * This enables dependency injection from configuration files
 */

import type { VcsEngineService } from '@/core/vcs/interfaces';

import { type VcsEngineConfig, VcsEngineServiceImpl } from '@/services/vcs';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

import type { ExecutionEngine } from './execution-engine';
import type { ExecutionEngineFactoryConfig } from './execution-engine-factory';

import { createExecutionEngine } from './execution-engine-factory';

/**
 * Complete engine configuration for both execution and VCS engines
 */
export type EngineConfiguration = {
  /** Execution engine specific configuration */
  execution?: {
    /** Custom dependencies to inject */
    customDependencies?: ExecutionEngineFactoryConfig['customDependencies'];
  };
  /** VCS engine configuration */
  vcs?: {
    /** VCS engine config options */
    config?: Partial<VcsEngineConfig>;
  };
};

/**
 * Creates engines from a configuration object
 * This allows dependency injection via JSON/YAML configuration files
 */
export async function createEnginesFromConfig(config: EngineConfiguration): Promise<{
  executionEngine: ExecutionEngine;
  vcsEngine: VcsEngineService;
}> {
  // Create VCS engine service
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
    ...config.vcs?.config,
  };

  const vcsEngine = new VcsEngineServiceImpl(defaultVcsConfig);

  // Create execution engine with optional custom dependencies
  const executionEngine = await createExecutionEngine({
    customDependencies: {
      ...config.execution?.customDependencies,
      // Allow overriding the vcsEngine in execution engine
      ...(isNonNullish(config.execution?.customDependencies?.vcsEngine) ? {} : { vcsEngine }),
    },
  });

  return { executionEngine, vcsEngine };
}

/**
 * Loads engine configuration from environment variables
 * Supports common configuration patterns
 */
export function loadEngineConfigFromEnv(): EngineConfiguration {
  const config: EngineConfiguration = {};

  // VCS configuration from environment
  if (
    isNonEmptyString(process.env.CHOPSTACK_SHADOW_PATH) ||
    isNonEmptyString(process.env.CHOPSTACK_BRANCH_PREFIX)
  ) {
    config.vcs = {
      config: {
        ...(isNonEmptyString(process.env.CHOPSTACK_SHADOW_PATH) && {
          shadowPath: process.env.CHOPSTACK_SHADOW_PATH,
        }),
        ...(isNonEmptyString(process.env.CHOPSTACK_BRANCH_PREFIX) && {
          branchPrefix: process.env.CHOPSTACK_BRANCH_PREFIX,
        }),
        ...(isNonEmptyString(process.env.CHOPSTACK_CLEANUP_ON_SUCCESS) && {
          cleanupOnSuccess: process.env.CHOPSTACK_CLEANUP_ON_SUCCESS === 'true',
        }),
        ...(isNonEmptyString(process.env.CHOPSTACK_CLEANUP_ON_FAILURE) && {
          cleanupOnFailure: process.env.CHOPSTACK_CLEANUP_ON_FAILURE === 'true',
        }),
        ...(isNonEmptyString(process.env.CHOPSTACK_CONFLICT_STRATEGY) && {
          conflictStrategy: process.env.CHOPSTACK_CONFLICT_STRATEGY as 'auto' | 'manual' | 'fail',
        }),
      },
    };
  }

  return config;
}

/**
 * Creates engines from environment configuration with defaults
 */
export async function createEnginesFromEnv(): Promise<{
  executionEngine: ExecutionEngine;
  vcsEngine: VcsEngineService;
}> {
  const config = loadEngineConfigFromEnv();
  return createEnginesFromConfig(config);
}
