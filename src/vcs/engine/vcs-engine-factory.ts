import {
  CommitMessageGenerator,
  type CommitMessageGeneratorConfig,
} from '@/adapters/vcs/commit-message-generator';
import { logger } from '@/utils/logger';
import { ConflictResolver } from '@/vcs/conflict-resolver';
import { StackBuilder } from '@/vcs/stack-builder';
import { WorktreeManager } from '@/vcs/worktree-manager';

import type { VcsEngine, VcsEngineDependencies, VcsEngineOptions } from './vcs-engine';

/**
 * Factory configuration for creating VcsEngine instances
 */
export type VcsEngineFactoryConfig = {
  /** Custom commit message generator configuration */
  commitMessageConfig?: CommitMessageGeneratorConfig;
  /** Custom dependencies to override defaults */
  customDependencies?: Partial<VcsEngineDependencies>;
  /** VCS engine options */
  options?: Partial<VcsEngineOptions>;
};

/**
 * Creates default VcsEngine dependencies
 */
export function createDefaultVcsEngineDependencies(
  options: VcsEngineOptions,
  commitMessageConfig?: CommitMessageGeneratorConfig,
): VcsEngineDependencies {
  return {
    worktreeManager: new WorktreeManager(options),
    stackBuilder: new StackBuilder(options),
    conflictResolver: new ConflictResolver(options),
    commitMessageGenerator: new CommitMessageGenerator(
      commitMessageConfig ?? {
        logger: { warn: logger.warn.bind(logger) },
      },
    ),
  };
}

/**
 * Factory function for creating VcsEngine instances with dependency injection
 */
export async function createVcsEngine(config: VcsEngineFactoryConfig = {}): Promise<VcsEngine> {
  const options: VcsEngineOptions = {
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
    ...config.options,
  };

  const defaultDependencies = createDefaultVcsEngineDependencies(
    options,
    config.commitMessageConfig,
  );

  const dependencies: VcsEngineDependencies = {
    ...defaultDependencies,
    ...config.customDependencies,
  };

  // Use dynamic import to avoid circular dependency at module load time
  const { VcsEngine } = await import('./vcs-engine');

  return new VcsEngine(dependencies, options);
}

/**
 * Creates a test VcsEngine with mocked dependencies
 */
export async function createTestVcsEngine(
  mockDependencies: Partial<VcsEngineDependencies> = {},
  options: Partial<VcsEngineOptions> = {},
): Promise<VcsEngine> {
  const fullOptions: VcsEngineOptions = {
    shadowPath: '.test/shadows',
    branchPrefix: 'test/',
    cleanupOnSuccess: false,
    cleanupOnFailure: false,
    conflictStrategy: 'manual',
    stackSubmission: {
      enabled: false,
      draft: true,
      autoMerge: false,
    },
    ...options,
  };

  const defaultDeps = createDefaultVcsEngineDependencies(fullOptions);
  const dependencies: VcsEngineDependencies = {
    ...defaultDeps,
    ...mockDependencies,
  };

  // Use dynamic import to avoid circular dependency at module load time
  const { VcsEngine } = await import('./vcs-engine');

  return new VcsEngine(dependencies, fullOptions);
}
