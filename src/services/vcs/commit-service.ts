import { CommitMessageGenerator } from 'commitment';

import type { ExecutionTask } from '@/core/execution/types';
import type { CommitOptions, CommitService, WorktreeContext } from '@/core/vcs/domain-services';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';
import { isNonEmptyString, isValidArray } from '@/validation/guards';

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

    logger.info(`🔍 [COMMIT] Starting commit for task ${task.id}`);
    logger.info(`  📂 Working directory: ${workdir}`);
    logger.info(`  🌳 Worktree path: ${context.worktreePath}`);
    logger.info(`  🔧 Options: ${JSON.stringify(options)}`);

    // Check current git status before anything
    const initialStatus = await git.status();
    logger.info(`  📊 Initial git status:`);
    logger.info(
      `    - Added: ${isValidArray(initialStatus.added) ? initialStatus.added.join(', ') : 'none'}`,
    );
    logger.info(
      `    - Modified: ${isValidArray(initialStatus.modified) ? initialStatus.modified.join(', ') : 'none'}`,
    );
    logger.info(
      `    - Deleted: ${isValidArray(initialStatus.deleted) ? initialStatus.deleted.join(', ') : 'none'}`,
    );
    logger.info(
      `    - Untracked: ${isValidArray(initialStatus.untracked) ? initialStatus.untracked.join(', ') : 'none'}`,
    );

    // Generate commit message if not provided
    let commitMessage = options.message;
    if (
      commitMessage === undefined &&
      (options.generateMessage ?? this.config.defaultGenerateMessage)
    ) {
      logger.info(`  💬 Generating commit message...`);
      const changes = await this.analyzeChanges(workdir, options.files);
      commitMessage = await this.generateCommitMessage(task, changes, workdir);
      logger.info(`  💬 Generated message: ${commitMessage.split('\n')[0]}`);
    }

    if (commitMessage === undefined || commitMessage.trim() === '') {
      logger.error(`  ❌ No commit message for task ${task.id}`);
      throw new Error(`No commit message provided for task ${task.id}`);
    }

    // Stage files
    logger.info(`  📝 Staging files...`);
    if (options.includeAll === true) {
      logger.info(`    - Staging all files with 'git add .'`);
      await git.add('.');
    } else if (options.files !== undefined && options.files.length > 0) {
      logger.info(`    - Staging specific files: ${options.files.join(', ')}`);
      await git.add(options.files);
    } else {
      logger.info(`    - No specific files, staging all with 'git add .'`);
      await git.add('.');
    }

    // Check status after staging
    const afterStageStatus = await git.status();
    logger.info(`  📊 After staging git status:`);
    logger.info(
      `    - Staged: ${isValidArray(afterStageStatus.staged) ? afterStageStatus.staged.join(', ') : 'none'}`,
    );
    logger.info(
      `    - Modified: ${isValidArray(afterStageStatus.modified) ? afterStageStatus.modified.join(', ') : 'none'}`,
    );

    // Check if there are changes to commit
    const hasChanges = await this.hasChangesToCommit(workdir);
    logger.info(`  ✅ Has changes to commit: ${hasChanges}`);

    if (!hasChanges) {
      logger.warn(`  ⚠️ No changes to commit for task ${task.id}`);
      logger.warn(`  🔍 Running 'git diff --cached' to check staged changes...`);
      const { execSync } = await import('node:child_process');
      try {
        const diffOutput = execSync('git diff --cached', { cwd: workdir, encoding: 'utf8' });
        logger.warn(
          `  📝 Staged diff output: ${isNonEmptyString(diffOutput) ? diffOutput : 'empty'}`,
        );
      } catch (error) {
        logger.warn(`  ❌ Failed to get diff: ${String(error)}`);
      }
      throw new Error(`No changes to commit for task ${task.id}`);
    }

    // Create commit
    logger.info(`  💾 Creating commit with message: "${commitMessage.split('\n')[0]}"`);
    const commitHash = await git.commit(commitMessage);

    logger.info(`  ✅ Successfully committed task ${task.id}: ${commitHash.slice(0, 7)}`);

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
