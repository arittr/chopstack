import { execSync } from 'node:child_process';

import chalk from 'chalk';

import { validateStackArgs } from '../types/cli';
import { hasContent, isNonEmptyString } from '../utils/guards';

export function stackCommand(rawArgs: unknown): number {
  try {
    const args = validateStackArgs(rawArgs);
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

    // Generate AI-powered commit message based on changes
    const commitMessage = generateAICommitMessage(statusLines, args);
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
        console.error(chalk.red('❌ Failed to create git-spice branch'));
        if (args.verbose && error instanceof Error) {
          console.error(chalk.dim(error.message));
        }
        return 1;
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
    return 0;
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

function generateAICommitMessage(
  statusLines: string[],
  args: ReturnType<typeof validateStackArgs>,
): string {
  if (isNonEmptyString(args.message)) {
    return args.message;
  }

  try {
    // Check if Claude CLI is available
    console.log(chalk.blue('🔍 Checking if Claude CLI is available...'));
    try {
      execSync('claude --version', { stdio: 'pipe' });
      console.log(chalk.green('✅ Claude CLI is available'));
    } catch {
      console.log(chalk.yellow('⚠️ Claude CLI not available, using fallback...'));
      return generateFallbackCommitMessage(statusLines);
    }

    // Get the actual diff to understand what changed
    const gitDiff = execSync('git diff --cached --stat', { encoding: 'utf8' });
    const gitDiffDetails = execSync('git diff --cached --name-status', { encoding: 'utf8' });

    const prompt = `Analyze these git changes and generate a professional commit message:

Git Status:
${statusLines.join('\n')}

Git Diff Summary:
${gitDiff}

Git Changes:
${gitDiffDetails}

Please generate a commit message that:
1. Has a clear, descriptive title (50 chars or less)
2. Explains WHAT was changed and WHY (not just which files)
3. Uses imperative mood ("Add feature" not "Added feature")
4. Is professional and follows conventional commits style
5. Include a brief body if the changes are complex

Return only the commit message, no explanations or markdown formatting.`;

    console.log(chalk.blue('🤖 Generating AI-powered commit message...'));

    // Use Claude CLI directly for commit message generation
    const aiResponse = execSync(`claude "${prompt}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Extract the commit message from the AI response
    let commitMessage = aiResponse.trim();

    // Clean up any markdown or extra formatting
    commitMessage = commitMessage
      .replaceAll('```', '')
      .replaceAll(/^\s*[*+`-]\s*/gm, '')
      .trim();

    // If the model included a preamble like "Here's the commit message:", keep only content after it
    const linesAll = commitMessage.split('\n');
    const markerIndex = linesAll.findIndex((raw) => {
      const s = raw.trim().toLowerCase();
      return (
        s.startsWith("here's the commit message") ||
        s.startsWith('heres the commit message') ||
        s.startsWith('this commit message') ||
        s === 'commit message:' ||
        s.startsWith('commit message:')
      );
    });
    const lines = markerIndex !== -1 ? linesAll.slice(markerIndex + 1) : linesAll;

    // Remove AI signature/promotion lines that we add ourselves later or that reference Claude marketing
    const filtered = lines
      .map((l) => l.replace(/\r$/u, ''))
      .filter((raw) => {
        const s = raw.trim();
        const lower = s.toLowerCase();
        if (s === '') {
          return true;
        }
        if (lower.startsWith('🤖 generated with')) {
          return false;
        }
        if (lower.startsWith('co-authored-by:')) {
          return false;
        }
        if (lower.includes('claude.ai/code')) {
          return false;
        }
        if (lower === 'here is the commit message' || lower === "here's the commit message") {
          return false;
        }
        return true;
      });

    // Collapse multiple blank lines to a single blank line
    const collapsed: string[] = [];
    for (const l of filtered) {
      const isBlank = l.trim() === '';
      const previousBlank = collapsed.length > 0 && (collapsed.at(-1) ?? '').trim() === '';
      if (isBlank && previousBlank) {
        continue;
      }
      collapsed.push(l);
    }
    commitMessage = collapsed.join('\n').trim();

    // Fallback to basic analysis if AI fails
    if (commitMessage === '' || commitMessage.length < 10) {
      commitMessage = generateFallbackCommitMessage(statusLines);
    }

    // Add chopstack signature
    return `${commitMessage}\n\n🤖 Generated with Claude via chopstack\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
  } catch {
    console.log(chalk.yellow('⚠️ AI generation failed, using fallback...'));
    return generateFallbackCommitMessage(statusLines);
  }
}

function generateFallbackCommitMessage(statusLines: string[]): string {
  // Simple fallback when AI fails
  const fileCount = statusLines.length;
  const firstFile = statusLines[0]?.slice(3) ?? 'files';

  if (fileCount === 1) {
    return `Update ${firstFile}\n\nChanges: 1 file modified\n\n🤖 Generated with Claude via chopstack\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
  }

  return `Update ${fileCount} files\n\nChanges: ${fileCount} files modified\n\n🤖 Generated with Claude via chopstack\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
}

function generateBranchName(commitMessage: string): string {
  // Extract the first line of commit message and convert to branch name
  const lines = commitMessage
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const subject =
    lines.find((l) => {
      const lower = l.toLowerCase();
      return (
        isNonEmptyString(l) &&
        !l.endsWith(':') &&
        !lower.startsWith('co-authored-by:') &&
        !lower.startsWith('co-authored-by') &&
        !l.startsWith('http://') &&
        !l.startsWith('https://') &&
        !/^[*+-]\s+/.test(l) &&
        !l.startsWith('🤖') &&
        !l.startsWith('#')
      );
    }) ??
    lines[0] ??
    '';

  if (!isNonEmptyString(subject)) {
    return 'feature-branch';
  }

  return subject
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
