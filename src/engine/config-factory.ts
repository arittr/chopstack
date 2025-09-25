/**
 * Configuration-driven factory for creating engine instances
 * This enables dependency injection from configuration files
 */

import type { CommitMessageGeneratorConfig } from '@/vcs/commit-message-generator';
import type { VcsEngine, VcsEngineOptions } from '@/vcs/engine/vcs-engine';
import type { VcsEngineFactoryConfig } from '@/vcs/engine/vcs-engine-factory';

import { isNonEmptyString, isNonNullish } from '@/validation/guards';
import { createVcsEngine } from '@/vcs/engine/vcs-engine-factory';

import type { ExecutionEngine } from './execution-engine';
import type { ExecutionEngineFactoryConfig } from './execution-engine-factory';

import { createExecutionEngine } from './execution-engine-factory';

/**
 * Complete engine configuration for both execution and VCS engines
 */
export type EngineConfiguration = {
  /** Commit message generation configuration */
  commitMessage?: CommitMessageGeneratorConfig;
  /** Execution engine specific configuration */
  execution?: {
    /** Custom dependencies to inject */
    customDependencies?: ExecutionEngineFactoryConfig['customDependencies'];
  };
  /** VCS engine configuration */
  vcs?: {
    /** Custom dependencies to inject */
    customDependencies?: VcsEngineFactoryConfig['customDependencies'];
    /** VCS engine options */
    options?: Partial<VcsEngineOptions>;
  };
};

/**
 * Creates engines from a configuration object
 * This allows dependency injection via JSON/YAML configuration files
 */
export async function createEnginesFromConfig(config: EngineConfiguration): Promise<{
  executionEngine: ExecutionEngine;
  vcsEngine: VcsEngine;
}> {
  // Create VCS engine first
  const vcsEngine = await createVcsEngine({
    ...(isNonNullish(config.vcs?.options) && { options: config.vcs.options }),
    ...(isNonNullish(config.commitMessage) && { commitMessageConfig: config.commitMessage }),
    ...(isNonNullish(config.vcs?.customDependencies) && {
      customDependencies: config.vcs.customDependencies,
    }),
  });

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
      options: {
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

  // Commit message configuration from environment
  if (
    isNonEmptyString(process.env.CHOPSTACK_AI_COMMAND) ||
    isNonEmptyString(process.env.CHOPSTACK_ENABLE_AI)
  ) {
    config.commitMessage = {
      ...(isNonEmptyString(process.env.CHOPSTACK_AI_COMMAND) && {
        aiCommand: process.env.CHOPSTACK_AI_COMMAND,
      }),
      ...(isNonEmptyString(process.env.CHOPSTACK_ENABLE_AI) && {
        enableAI: process.env.CHOPSTACK_ENABLE_AI === 'true',
      }),
      ...(isNonEmptyString(process.env.CHOPSTACK_AI_TIMEOUT) && {
        aiTimeout: Number.parseInt(process.env.CHOPSTACK_AI_TIMEOUT, 10),
      }),
      ...(isNonEmptyString(process.env.CHOPSTACK_COMMIT_SIGNATURE) && {
        signature: process.env.CHOPSTACK_COMMIT_SIGNATURE,
      }),
    };
  }

  return config;
}

/**
 * Creates engines from environment configuration with defaults
 */
export async function createEnginesFromEnv(): Promise<{
  executionEngine: ExecutionEngine;
  vcsEngine: VcsEngine;
}> {
  const config = loadEngineConfigFromEnv();
  return createEnginesFromConfig(config);
}
