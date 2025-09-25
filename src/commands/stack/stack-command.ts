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
      if (args.dryRun) {
        this.logger.info(
          chalk.blue('🎨 DRY RUN: Showing what would be done without making changes'),
        );
      }

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
        if (!args.dryRun) {
          addAllChanges();
        } else {
          this.logger.info(chalk.gray('   (DRY RUN: would run `git add -A`)'));
        }
      }

      // Handle stack creation
      if (args.createStack) {
        const spiceOptions: GitSpiceOptions = {
          autoAdd: args.autoAdd,
          createStack: args.createStack,
          dryRun: args.dryRun,
          ...(hasContent(args.message) && { message: args.message }),
        };
        return await this._handleStackCreation(spiceOptions, commitMessage);
      }
      // Just create a regular commit
      return this._handleRegularCommit(commitMessage, args.dryRun);
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

      // Create git-spice branch
      const workdir = process.cwd();
      if (args.dryRun === true) {
        const proposedBranchName = args.branchName ?? 'auto-generated-branch-name';
        this.logger.info(
          chalk.gray(`   (DRY RUN: would create git-spice branch: ${proposedBranchName})`),
        );
        this.logger.info(
          chalk.gray(
            `   (DRY RUN: would run: gs branch create ${proposedBranchName} -m "${commitMessage.split('\n')[0]}")`,
          ),
        );
      } else {
        const branchName = await this.gitSpiceBackend.createBranchWithCommit(
          workdir,
          args.branchName ?? '',
          commitMessage,
        );
        this.logger.info(chalk.green(`✅ Created git-spice branch: ${branchName}`));
      }

      // Submit stack if requested
      if (args.submit === true) {
        return await this._handleStackSubmission(args.dryRun);
      }

      if (args.dryRun === true) {
        this.logger.info(chalk.blue('\n🚀 DRY RUN COMPLETE - No actual changes were made'));
        this.logger.info(
          chalk.gray('   To execute these actions, run the same command without --dry-run'),
        );
      }

      return 0;
    } catch (error) {
      // Display detailed error information for debugging
      this._displayDetailedError('Failed to create stack', error);
      return 1;
    }
  }

  private _handleRegularCommit(commitMessage: string, dryRun = false): number {
    try {
      if (dryRun) {
        this.logger.info(
          chalk.gray(`   (DRY RUN: would run: git commit -m "${commitMessage.split('\n')[0]}")`),
        );
        this.logger.info(chalk.green('✅ Would create commit with message:'));
      } else {
        createCommit(commitMessage);
        this.logger.info(chalk.green('✅ Created commit with message:'));
      }
      this.logger.info(chalk.white(`   ${commitMessage.split('\n')[0]}`));

      if (dryRun) {
        this.logger.info(chalk.blue('\n🚀 DRY RUN COMPLETE - No actual changes were made'));
        this.logger.info(
          chalk.gray('   To execute these actions, run the same command without --dry-run'),
        );
      }

      return 0;
    } catch (error) {
      // Display detailed error information for debugging
      this._displayDetailedError('Failed to create commit', error);
      return 1;
    }
  }

  private async _handleStackSubmission(dryRun = false): Promise<number> {
    this.logger.info(chalk.blue('🚀 Submitting stack to GitHub...'));

    try {
      const workdir = process.cwd();
      if (dryRun) {
        this.logger.info(chalk.gray(`   (DRY RUN: would run: gs stack submit --draft)`));
        this.logger.info(chalk.green('✅ Would submit stack as draft PRs'));
      } else {
        const prUrls = await this.gitSpiceBackend.submitStack(workdir);

        if (isValidArray(prUrls)) {
          this.logger.info(chalk.green('✅ Stack submitted successfully!'));
          this.logger.info(chalk.cyan('📎 Pull Request URLs:'));
          for (const url of prUrls) {
            this.logger.info(chalk.white(`   ${url}`));
          }
        }
      }

      return 0;
    } catch (error) {
      // Display detailed error information for debugging
      this._displayDetailedError('Failed to submit stack', error);
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
    } catch (error) {
      // Don't use fallback - encourage user to provide manual message
      this.logger.error(chalk.red('❌ AI commit message generation failed'));
      this.logger.info(
        chalk.blue('💡 Tip: Provide a manual commit message using --message "your message"'),
      );
      throw new Error(
        `AI commit message generation failed: ${error instanceof Error ? error.message : String(error)}. Use --message to provide a manual commit message.`,
      );
    }
  }

  /**
   * Display detailed error information with proper formatting
   */
  private _displayDetailedError(context: string, error: unknown): void {
    this.logger.error(chalk.red(`❌ ${context}`));

    if (error instanceof Error) {
      // Check if it's a GitSpiceError with additional details
      const gitSpiceError = error as Error & {
        command?: string;
        stderr?: string;
      };

      this.logger.error(chalk.red(`   Error: ${error.message}`));

      // Display command that failed if available
      if (hasContent(gitSpiceError.command)) {
        this.logger.error(chalk.yellow(`   Command: ${gitSpiceError.command}`));
      }

      // Display stderr output if available (this is where pre-commit hook errors appear)
      if (hasContent(gitSpiceError.stderr)) {
        this.logger.error(chalk.cyan('   Detailed output:'));
        // Split stderr by lines and indent each line for better readability
        const stderrLines = gitSpiceError.stderr.split('\n').filter((line) => line.trim() !== '');
        for (const line of stderrLines) {
          this.logger.error(chalk.gray(`   │ ${line}`));
        }
      }

      // Add helpful hints for common errors
      if (error.message.includes('pre-commit') || error.message.includes('lint')) {
        this.logger.info(
          chalk.blue('\n💡 Tip: Fix linting issues with `pnpm lint:fix` and try again'),
        );
      } else if (error.message.includes('not initialized')) {
        this.logger.info(chalk.blue('\n💡 Tip: Initialize git-spice with `gs repo init` first'));
      }
    } else {
      this.logger.error(chalk.red(`   Error: ${String(error)}`));
    }
  }
}
