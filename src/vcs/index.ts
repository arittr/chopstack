import { match } from 'ts-pattern';

import type { ExecutionTask, GitSpiceStackInfo } from '@/types/execution';

/**
 * VCS backend types for different stacking tools
 */
export type VcsBackendType = 'git-spice' | 'jj' | 'graphite';

/**
 * Common interface for all VCS backends
 */
export type VcsBackend = {
  /**
   * Create a stack from executed tasks
   */
  createStack(
    tasks: ExecutionTask[],
    workdir: string,
    baseRef?: string,
  ): Promise<GitSpiceStackInfo>;

  /**
   * Initialize the VCS backend in the repository if needed
   */
  initialize(workdir: string): Promise<void>;

  /**
   * Check if the VCS backend is available in the system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Submit the stack to the remote repository as pull requests
   */
  submitStack(workdir: string): Promise<string[]>;
};

/**
 * VCS backend configuration
 */
export type VcsBackendConfig = {
  // Future: backend-specific options
  options?: Record<string, unknown>;
  type: VcsBackendType;
};

/**
 * Create a VCS backend instance
 */
export async function createVcsBackend(
  type: VcsBackendType,
  config?: VcsBackendConfig,
): Promise<VcsBackend> {
  return match(type)
    .with('git-spice', async () => {
      const { GitSpiceBackend } = await import('./git-spice');
      return new GitSpiceBackend(config?.options);
    })
    .with('jj', () => {
      // Future implementation
      throw new Error('Jujutsu backend not yet implemented');
    })
    .with('graphite', () => {
      // Future implementation
      throw new Error('Graphite backend not yet implemented');
    })
    .exhaustive();
}

/**
 * Detect available VCS backends in order of preference
 */
export async function detectAvailableVcsBackend(): Promise<VcsBackendType | null> {
  const backends: VcsBackendType[] = ['git-spice', 'graphite', 'jj'];

  // Sequential check is intentional - we want to return the first available backend
  for (const type of backends) {
    try {
      const backend = await createVcsBackend(type);
      if (await backend.isAvailable()) {
        return type;
      }
    } catch {
      // Backend not available, continue to next
    }
  }

  return null;
}

// Commit message generation
export {
  CommitMessageGenerator,
  type CommitTask,
  type CommitMessageGeneratorConfig,
  type CommitMessageOptions,
} from './commit-message-generator';

// Git utilities
export { GitWrapper, type GitStatus, type WorktreeInfo } from './git-wrapper';

export type { GitSpiceStackInfo };
