import type { CommitOptions, CommitService, WorktreeContext } from '@/core/vcs/domain-services';
import type { ExecutionTask } from '@/types/execution';

import { CommitMessageGenerator } from '@/adapters/vcs/commit-message-generator';
import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/logger';

export type CommitServiceConfig = {
  defaultGenerateMessage: boolean;
  enforceConventionalCommits: boolean;
};

const defaultCommitServiceConfig: CommitServiceConfig = {
  defaultGenerateMessage: true,
  enforceConventionalCommits: false,
};

/**
 * Implementation of CommitService domain interface
 * Handles commit creation, message generation, and change analysis
 */
export class CommitServiceImpl implements CommitService {
  private readonly commitMessageGenerator: CommitMessageGenerator;
  private readonly config: CommitServiceConfig;

  constructor(config: CommitServiceConfig = defaultCommitServiceConfig) {
    this.config = config;
    this.commitMessageGenerator = new CommitMessageGenerator();
  }

  async commitChanges(
    task: ExecutionTask,
    context: WorktreeContext,
    options: CommitOptions = {},
  ): Promise<string> {
    const workdir = context.absolutePath;
    const git = new GitWrapper(workdir);

    // Generate commit message if not provided
    let commitMessage = options.message;
    if (
      commitMessage === undefined &&
      (options.generateMessage ?? this.config.defaultGenerateMessage)
    ) {
      const changes = await this.analyzeChanges(workdir, options.files);
      commitMessage = await this.generateCommitMessage(task, changes, workdir);
    }

    if (commitMessage === undefined || commitMessage.trim() === '') {
      throw new Error(`No commit message provided for task ${task.id}`);
    }

    // Stage files
    if (options.includeAll === true) {
      await git.add('.');
    } else if (options.files !== undefined && options.files.length > 0) {
      await git.add(options.files);
    } else {
      // Default to staging all changes if no specific files provided
      await git.add('.');
    }

    // Check if there are changes to commit
    const hasChanges = await this.hasChangesToCommit(workdir);
    if (!hasChanges) {
      logger.warn(`⚠️ No changes to commit for task ${task.id}`);
      throw new Error(`No changes to commit for task ${task.id}`);
    }

    // Create commit
    const commitHash = await git.commit(commitMessage);

    logger.info(
      `📝 Committed task ${task.id}: ${commitHash.slice(0, 7)} - ${commitMessage.split('\n')[0]}`,
    );

    return commitHash;
  }

  async generateCommitMessage(
    task: ExecutionTask,
    changes: { files?: string[]; output?: string },
    workdir: string,
  ): Promise<string> {
    return this.commitMessageGenerator.generateCommitMessage(task, {
      files: changes.files ?? [],
      output: changes.output ?? undefined,
      workdir,
    });
  }

  async hasChangesToCommit(workdir: string): Promise<boolean> {
    const git = new GitWrapper(workdir);
    return git.hasChangesToCommit();
  }

  async analyzeChanges(workdir: string, files?: string[]): Promise<{ files: string[] }> {
    if (files !== undefined && files.length > 0) {
      return { files };
    }

    // Get list of changed files using GitWrapper
    const git = new GitWrapper(workdir);
    const status = await git.status();
    const changedFiles = [...status.added, ...status.modified, ...status.deleted];

    return { files: changedFiles };
  }
}
