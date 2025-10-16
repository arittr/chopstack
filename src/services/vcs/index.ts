/**
 * VCS Services - Application layer services for VCS operations
 * These services implement the domain interfaces and coordinate with adapters
 */

export { CommitServiceImpl } from './commit-service';
export type { CommitServiceConfig } from './commit-service';

export { ConflictResolutionServiceImpl } from './conflict-resolution-service';
export { RepositoryServiceImpl } from './repository-service';

export { StackBuildServiceImpl } from './stack-build-service';
export type { StackBuildServiceConfig, StackEvent } from './stack-build-service';

export type {
  VcsConfig,
  VcsConfigError,
  VcsConfigFileError,
  VcsConfigService,
  VcsToolUnavailableError,
} from './types';

export { VcsAnalysisServiceImpl } from './vcs-analysis-service';

export { VcsConfigServiceImpl } from './vcs-config';

// Main orchestration service
export { VcsEngineServiceImpl } from './vcs-engine-service';
export type {
  VcsEngineDependencies,
  VcsEngineConfig,
  WorktreeExecutionContext,
} from './vcs-engine-service';

// Domain services
export { WorktreeServiceImpl } from './worktree-service';
export type { WorktreeEvent, WorktreeServiceConfig } from './worktree-service';
