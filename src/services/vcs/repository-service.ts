import type { RepositoryService } from '@/core/vcs/domain-services';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';

/**
 * Implementation of RepositoryService domain interface
 * Handles basic Git repository operations
 */
export class RepositoryServiceImpl implements RepositoryService {
  async getStatus(workdir: string): Promise<{
    branch: string;
    clean: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    const git = new GitWrapper(workdir);
    const status = await git.status();

    return {
      branch: status.current ?? 'unknown',
      clean: status.isClean ?? false,
      staged: status.staged ?? [],
      unstaged: [...status.modified, ...status.deleted],
      untracked: status.notAdded ?? [],
    };
  }

  async isClean(workdir: string): Promise<boolean> {
    const git = new GitWrapper(workdir);
    const status = await git.status();
    return status.isClean ?? false;
  }

  async getCurrentBranch(workdir: string): Promise<string> {
    const git = new GitWrapper(workdir);
    const status = await git.status();
    return status.current ?? 'unknown';
  }

  async createBranch(name: string, base: string, workdir: string): Promise<void> {
    const git = new GitWrapper(workdir);

    // Check if branch already exists
    const exists = await this.branchExists(name, workdir);
    if (exists) {
      logger.warn(`⚠️ Branch ${name} already exists`);
      return;
    }

    await git.checkoutLocalBranch(name);
    logger.info(`✅ Created branch ${name} from ${base}`);
  }

  async switchBranch(name: string, workdir: string): Promise<void> {
    const git = new GitWrapper(workdir);

    // Check if branch exists
    const exists = await this.branchExists(name, workdir);
    if (!exists) {
      throw new Error(`Branch ${name} does not exist`);
    }

    await git.checkout(name);
    logger.info(`✅ Switched to branch ${name}`);
  }

  async branchExists(name: string, workdir: string): Promise<boolean> {
    const git = new GitWrapper(workdir);
    return git.branchExists(name);
  }
}
