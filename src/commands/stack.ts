import { execSync } from 'node:child_process';

import chalk from 'chalk';

import type { StackArgs } from '../types/cli';

import { hasContent, isNonEmptyString } from '../utils/guards';

export async function stackCommand(args: StackArgs): Promise<number> {
  try {
    console.log(chalk.blue('🚀 Creating git stack with automatic commit message...'));

    // Check for git status - must have changes to commit
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!hasContent(gitStatus)) {
      console.log(chalk.yellow('⚠️ No changes to commit. Please make some changes first.'));
      return 1;
    }

    // Show what changes will be committed
    console.log(chalk.cyan('📝 Changes to be committed:'));
    const statusLines = gitStatus.trim().split('\n');
    for (const line of statusLines) {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      const statusColor = getStatusColor(status);
      console.log(chalk.gray('  ') + statusColor(status) + chalk.white(` ${file}`));
    }
    console.log();

    // Generate commit message based on changes
    const commitMessage = generateCommitMessage(statusLines, args);
    console.log(chalk.green('💬 Generated commit message:'));
    console.log(chalk.white(`   ${commitMessage}`));
    console.log();

    // Add all changes if auto-add is enabled
    if (args.autoAdd) {
      console.log(chalk.blue('📥 Adding all changes...'));
      execSync('git add -A');
    }

    // TODO: Support multiple VCS backends (git-spice, GitHub stacks, etc.)
    // For now, we assume git-spice is available and configured

    // Create git-spice branch with commit
    if (args.createStack) {
      console.log(chalk.blue('📚 Creating git-spice branch...'));

      try {
        // Check if git-spice is available
        try {
          execSync('gs --version', { stdio: 'pipe' });
        } catch {
          console.log(
            chalk.yellow('⚠️ git-spice (gs) not available. Please install git-spice first.'),
          );
          console.log(chalk.gray('💡 Install with: curl -fsSL https://git-spice.zip | bash'));
          return 1;
        }

        // Generate branch name from commit message
        const branchName = generateBranchName(commitMessage);
        console.log(chalk.cyan(`🌿 Creating git-spice branch: ${branchName}`));

        // Use git-spice to create branch and commit
        execSync(`gs branch create ${branchName} -m "${escapeCommitMessage(commitMessage)}"`, {
          stdio: args.verbose ? 'inherit' : 'pipe',
        });

        console.log(chalk.green('✅ Git-spice branch created successfully'));
        console.log(chalk.cyan('💡 Next steps:'));
        console.log(chalk.gray('   • Continue making changes and use `/stack` again'));
        console.log(chalk.gray('   • Run `gs stack submit` when ready to create PRs'));
        console.log(chalk.gray('   • Use `gs status` to see your stack'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Could not create git-spice branch:'));
        if (args.verbose && error instanceof Error) {
          console.error(chalk.dim(error.message));
        }

        // Fallback to regular git commit
        console.log(chalk.blue('📦 Falling back to regular git commit...'));
        try {
          execSync(`git commit -m "${escapeCommitMessage(commitMessage)}"`, {
            stdio: args.verbose ? 'inherit' : 'pipe',
          });
          console.log(chalk.green('✅ Regular commit created successfully'));
          console.log(
            chalk.gray('💡 You can manually create a git-spice stack with `gs stack create`'),
          );
        } catch (commitError) {
          console.error(chalk.red('❌ Failed to create any commit'));
          if (args.verbose && commitError instanceof Error) {
            console.error(commitError.message);
          }
          return 1;
        }
      }
    } else {
      // Just create a regular commit
      console.log(chalk.blue('📦 Creating commit...'));
      try {
        execSync(`git commit -m "${escapeCommitMessage(commitMessage)}"`, {
          stdio: args.verbose ? 'inherit' : 'pipe',
        });
        console.log(chalk.green('✅ Commit created successfully'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to create commit'));
        if (args.verbose && error instanceof Error) {
          console.error(error.message);
        }
        return 1;
      }
    }

    console.log(chalk.green(`🎉 Stack command completed successfully!`));
    return await Promise.resolve(0);
  } catch (error: unknown) {
    console.error(chalk.red('❌ Stack command failed:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    return 1;
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status.trim()) {
    case 'M':
    case 'MM': {
      return chalk.yellow; // Modified
    }
    case 'A':
    case 'AM': {
      return chalk.green; // Added
    }
    case 'D':
    case 'AD': {
      return chalk.red; // Deleted
    }
    case 'R':
    case 'RM': {
      return chalk.blue; // Renamed
    }
    case '??': {
      return chalk.magenta; // Untracked
    }
    default: {
      return chalk.gray; // Other
    }
  }
}

function generateCommitMessage(statusLines: string[], args: StackArgs): string {
  if (isNonEmptyString(args.message)) {
    return args.message;
  }

  // Analyze the changes to generate an appropriate message
  const modifications = [];
  const additions = [];
  const deletions = [];
  const renames = [];

  for (const line of statusLines) {
    const status = line.slice(0, 2).trim();
    const file = line.slice(3);

    switch (status) {
      case 'M':
      case 'MM': {
        modifications.push(file);
        break;
      }
      case 'A':
      case 'AM': {
        additions.push(file);
        break;
      }
      case 'D':
      case 'AD': {
        deletions.push(file);
        break;
      }
      case 'R':
      case 'RM': {
        renames.push(file);
        break;
      }
      case '??': {
        additions.push(file);
        break;
      }
    }
  }

  // Generate message based on what changed
  const parts = [];

  if (additions.length > 0) {
    if (additions.some((f) => f.includes('test'))) {
      parts.push('add tests');
    } else if (additions.some((f) => f.endsWith('.ts') || f.endsWith('.js'))) {
      parts.push('add new features');
    } else if (additions.some((f) => f.includes('doc') || f.endsWith('.md'))) {
      parts.push('add documentation');
    } else {
      parts.push('add files');
    }
  }

  if (modifications.length > 0) {
    if (modifications.some((f) => f.includes('test'))) {
      parts.push('update tests');
    } else if (modifications.some((f) => f.endsWith('.ts') || f.endsWith('.js'))) {
      parts.push('update implementation');
    } else if (modifications.some((f) => f.includes('doc') || f.endsWith('.md'))) {
      parts.push('update documentation');
    } else {
      parts.push('update files');
    }
  }

  if (deletions.length > 0) {
    parts.push('remove unused code');
  }

  if (renames.length > 0) {
    parts.push('refactor file structure');
  }

  let message = parts.join(' and ');
  if (message.length === 0) {
    message = 'update codebase';
  }

  // Capitalize first letter
  message = message.charAt(0).toUpperCase() + message.slice(1);

  // Add chopstack signature
  return `${message}\n\n🤖 Generated with [Claude Code](https://claude.ai/code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
}

function generateBranchName(commitMessage: string): string {
  // Extract the first line of commit message and convert to branch name
  const firstLine = commitMessage.split('\n')[0];
  if (!isNonEmptyString(firstLine)) {
    return 'feature-branch';
  }
  return firstLine
    .toLowerCase()
    .replaceAll(/[^\d\sa-z-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

function escapeCommitMessage(message: string): string {
  // Escape quotes and special characters for shell
  return message.replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`');
}
