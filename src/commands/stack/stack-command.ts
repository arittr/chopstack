/**
 * Stack command implementation using dependency injection
 */

import chalk from 'chalk';

import { CommitMessageGenerator } from '@/adapters/vcs/commit-message-generator';
import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { validateStackArgs } from '@/types/cli';
import { hasContent, isValidArray } from '@/validation/guards';

import type { GitSpiceOptions } from './types';

import { addAllChanges, createCommit, getGitStatus, getStatusColor } from './utils/git-operations';

/**
 * Stack command for creating git stacks with automatic commit message generation
 */
@RegisterCommand('stack')
export class StackCommand extends BaseCommand {
  private readonly commitMessageGenerator: CommitMessageGenerator;
  private readonly gitSpiceBackend: GitSpiceBackend;

  constructor(dependencies: CommandDependencies) {
    super('stack', 'Create git stack with automatic commit message generation', dependencies);
    this.commitMessageGenerator = new CommitMessageGenerator({
      logger: this.logger,
      enableAI: true,
    });
    this.gitSpiceBackend = new GitSpiceBackend();
  }

  async execute(rawArgs: unknown): Promise<number> {
    try {
      const args = validateStackArgs(rawArgs);

      // Check for git status first
      const gitStatus = getGitStatus();

      if (!gitStatus.hasChanges) {
        this.logger.info(chalk.yellow('No changes to commit'));
        return 1;
      }

      // Show intent based on mode
      if (args.createStack) {
        this.logger.info(chalk.blue('🚀 Creating git stack with automatic commit message...'));
      }

      // Show what changes will be committed
      this._displayChanges(gitStatus.statusLines);

      // Generate AI-powered commit message based on changes
      const commitMessage = hasContent(args.message)
        ? args.message
        : await this._generateCommitMessage(gitStatus.statusLines);
      this._displayCommitMessage(commitMessage);

      // Add all changes if auto-add is enabled
      if (args.autoAdd) {
        this.logger.info(chalk.blue('📥 Adding all changes...'));
        addAllChanges();
      }

      // Handle stack creation
      if (args.createStack) {
        const spiceOptions: GitSpiceOptions = {
          autoAdd: args.autoAdd,
          createStack: args.createStack,
          ...(hasContent(args.message) && { message: args.message }),
        };
        return await this._handleStackCreation(spiceOptions, commitMessage);
      }
      // Just create a regular commit
      return this._handleRegularCommit(commitMessage);
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Stack command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }

  private _displayChanges(statusLines: string[]): void {
    this.logger.info(chalk.cyan('📝 Changes to be committed:'));
    for (const line of statusLines) {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      const statusColor = getStatusColor(status);
      this.logger.info(chalk.gray('  ') + statusColor(status) + chalk.white(` ${file}`));
    }
    this.logger.info('');
  }

  private _displayCommitMessage(message: string): void {
    this.logger.info(chalk.green('💬 Generated commit message:'));
    const lines = message.split('\n');
    for (const line of lines) {
      this.logger.info(chalk.white(`   ${line}`));
    }
    this.logger.info('');
  }

  private async _handleStackCreation(
    args: GitSpiceOptions,
    commitMessage: string,
  ): Promise<number> {
    this.logger.info(chalk.blue('📚 Creating git-spice branch...'));

    try {
      // Check if git-spice is available
      if (!(await this.gitSpiceBackend.isAvailable())) {
        this.logger.warn(chalk.yellow('⚠️ git-spice (gs) is not installed or not in PATH.'));
        this.logger.info(chalk.cyan('Install it from: https://github.com/abhinav/git-spice'));

        // Fall back to regular commit
        this.logger.info(chalk.blue('📝 Falling back to regular git commit...'));
        return this._handleRegularCommit(commitMessage);
      }

      // Initialize git-spice if needed
      const workdir = process.cwd();
      await this.gitSpiceBackend.initialize(workdir);

      // Create git-spice branch
      const branchName = await this.gitSpiceBackend.createBranchWithCommit(
        workdir,
        args.branchName ?? '',
        commitMessage,
      );

      this.logger.info(chalk.green(`✅ Created git-spice branch: ${branchName}`));

      // Submit stack if requested
      if (args.submit ?? false) {
        return await this._handleStackSubmission();
      }

      return 0;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Failed to create stack: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }

  private _handleRegularCommit(commitMessage: string): number {
    try {
      createCommit(commitMessage);
      this.logger.info(chalk.green('✅ Created commit with message:'));
      this.logger.info(chalk.white(`   ${commitMessage.split('\n')[0]}`));
      return 0;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Failed to create commit: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }

  private async _handleStackSubmission(): Promise<number> {
    this.logger.info(chalk.blue('🚀 Submitting stack to GitHub...'));

    try {
      const workdir = process.cwd();
      const prUrls = await this.gitSpiceBackend.submitStack(workdir);

      if (isValidArray(prUrls)) {
        this.logger.info(chalk.green('✅ Stack submitted successfully!'));
        this.logger.info(chalk.cyan('📎 Pull Request URLs:'));
        for (const url of prUrls) {
          this.logger.info(chalk.white(`   ${url}`));
        }
      }

      return 0;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Failed to submit stack: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }

  private async _generateCommitMessage(statusLines: string[]): Promise<string> {
    // Create a simple task object for the commit message generator
    const task = {
      title: 'Stack changes',
      description: `${statusLines.length} files changed`,
      produces: statusLines.map((line) => line.slice(3)),
    };

    try {
      return await this.commitMessageGenerator.generateCommitMessage(task, {
        workdir: process.cwd(),
        files: task.produces,
      });
    } catch {
      // Fallback to simple message if AI generation fails
      this.logger.warn(chalk.yellow('⚠️ AI commit message generation failed, using fallback'));
      return this._generateFallbackMessage(statusLines);
    }
  }

  private _generateFallbackMessage(statusLines: string[]): string {
    const files = statusLines.map((line) => line.slice(3));
    const addedCount = statusLines.filter((l) => l.startsWith('A')).length;
    const modifiedCount = statusLines.filter((l) => l.startsWith('M')).length;
    const deletedCount = statusLines.filter((l) => l.startsWith('D')).length;

    const parts = [];
    if (addedCount > 0) {
      parts.push(`add ${addedCount} files`);
    }
    if (modifiedCount > 0) {
      parts.push(`update ${modifiedCount} files`);
    }
    if (deletedCount > 0) {
      parts.push(`remove ${deletedCount} files`);
    }

    const summary = `${parts.join(', ')}, files changed: ${files.join(', ')}`;
    return `chore: ${summary}`;
  }
}
