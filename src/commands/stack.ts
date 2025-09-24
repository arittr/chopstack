import chalk from 'chalk';
import { execaSync } from 'execa';

import { validateStackArgs } from '../types/cli';
import { hasContent, isNonEmptyString } from '../utils/guards';
import { logger } from '../utils/logger';

export function stackCommand(rawArgs: unknown): number {
  try {
    const args = validateStackArgs(rawArgs);
    logger.info(chalk.blue('🚀 Creating git stack with automatic commit message...'));

    // Check for git status - must have changes to commit
    const gitStatus = execaSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    if (!hasContent(gitStatus)) {
      logger.warn(chalk.yellow('⚠️ No changes to commit. Please make some changes first.'));
      return 1;
    }

    // Show what changes will be committed
    logger.info(chalk.cyan('📝 Changes to be committed:'));
    const statusLines = gitStatus.trim().split('\n');
    for (const line of statusLines) {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      const statusColor = getStatusColor(status);
      logger.info(chalk.gray('  ') + statusColor(status) + chalk.white(` ${file}`));
    }
    logger.info('');

    // Generate AI-powered commit message based on changes
    const commitMessage = generateAICommitMessage(statusLines, args);
    logger.info(chalk.green('💬 Generated commit message:'));
    logger.info(chalk.white(`   ${commitMessage}`));
    logger.info('');

    // Add all changes if auto-add is enabled
    if (args.autoAdd) {
      logger.info(chalk.blue('📥 Adding all changes...'));
      execaSync('git', ['add', '-A']);
    }

    // TODO: Support multiple VCS backends (git-spice, GitHub stacks, etc.)
    // For now, we assume git-spice is available and configured

    // Create git-spice branch with commit
    if (args.createStack) {
      logger.info(chalk.blue('📚 Creating git-spice branch...'));

      try {
        // Check if git-spice is available
        try {
          execaSync('gs', ['--version'], { stdio: 'pipe' });
        } catch {
          logger.info(
            chalk.yellow('⚠️ git-spice (gs) not available. Please install git-spice first.'),
          );
          logger.info(chalk.gray('💡 Install with: curl -fsSL https://git-spice.zip | bash'));
          return 1;
        }

        // Generate branch name from commit message
        const branchName = generateBranchName(commitMessage);
        logger.info(chalk.cyan(`🌿 Creating git-spice branch: ${branchName}`));

        // Use git-spice to create branch and commit (arg array to avoid shell quoting issues)
        const gsResult = execaSync(
          'gs',
          ['branch', 'create', branchName, '--message', commitMessage],
          {
            stdio: args.verbose ? 'inherit' : 'pipe',
            encoding: 'utf8',
          },
        );
        if (gsResult.exitCode !== 0) {
          if (!args.verbose && isNonEmptyString(gsResult.stderr)) {
            logger.error(chalk.dim(gsResult.stderr));
          }
          throw new Error(`git-spice failed with code ${gsResult.exitCode ?? 'unknown'}`);
        }

        logger.info(chalk.green('✅ Git-spice branch created successfully'));
        logger.info(chalk.cyan('💡 Next steps:'));
        logger.info(chalk.gray('   • Continue making changes and use `/stack` again'));
        logger.info(chalk.gray('   • Run `gs stack submit` when ready to create PRs'));
        logger.info(chalk.gray('   • Use `gs status` to see your stack'));
      } catch (error) {
        logger.error(chalk.red('❌ Failed to create git-spice branch'));
        if (args.verbose && error instanceof Error) {
          logger.error(chalk.dim(error.message));
        }
        return 1;
      }
    } else {
      // Just create a regular commit
      logger.info(chalk.blue('📦 Creating commit...'));
      try {
        execaSync('git', ['commit', '-m', commitMessage], {
          stdio: args.verbose ? 'inherit' : 'pipe',
        });
        logger.info(chalk.green('✅ Commit created successfully'));
      } catch (error) {
        logger.error(chalk.red('❌ Failed to create commit'));
        if (args.verbose && error instanceof Error) {
          logger.error(error.message);
        }
        return 1;
      }
    }

    logger.info(chalk.green(`🎉 Stack command completed successfully!`));
    return 0;
  } catch (error: unknown) {
    logger.error(chalk.red('❌ Stack command failed:'));
    if (error instanceof Error) {
      logger.error(chalk.red(error.message));
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
    logger.info(chalk.blue('🔍 Checking if Claude CLI is available...'));
    try {
      execaSync('claude', ['--version'], { stdio: 'pipe' });
      logger.info(chalk.green('✅ Claude CLI is available'));
    } catch {
      logger.info(chalk.yellow('⚠️ Claude CLI not available, using fallback...'));
      return generateFallbackCommitMessage(statusLines);
    }

    // Get the actual diff to understand what changed
    const gitDiff = execaSync('git', ['diff', '--cached', '--stat'], { encoding: 'utf8' }).stdout;
    const gitDiffDetails = execaSync('git', ['diff', '--cached', '--name-status'], {
      encoding: 'utf8',
    }).stdout;

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

Output requirements:
- Return ONLY the commit message content between these exact markers:
<<<COMMIT_MESSAGE_START>>>
(commit message goes here)
<<<COMMIT_MESSAGE_END>>>
- Do NOT include any commentary outside the markers
- Do NOT wrap in code fences
- Do NOT include links or promotional text
- If you include bullet points, use '-' or numbered list items
- Keep the message concise and readable`;

    logger.info(chalk.blue('🤖 Generating AI-powered commit message...'));

    // Use Claude CLI directly for commit message generation
    const aiResponse = execaSync('claude', [prompt], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).stdout;

    // Prefer sentinel-extracted content when available
    const startTag = '<<<COMMIT_MESSAGE_START>>>';
    const endTag = '<<<COMMIT_MESSAGE_END>>>';
    const startIndex = aiResponse.indexOf(startTag);
    const endIndex = aiResponse.indexOf(endTag);
    let commitMessage =
      startIndex !== -1 && endIndex !== -1 && endIndex > startIndex
        ? aiResponse.slice(startIndex + startTag.length, endIndex).trim()
        : aiResponse.trim();

    // Clean up any markdown code fences; keep list markers for later parsing
    commitMessage = commitMessage.replaceAll('```', '').trim();

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
        if (
          lower.startsWith('here is the commit message') ||
          lower.startsWith("here's the commit message")
        ) {
          return false;
        }
        if (lower.startsWith('based on the git diff')) {
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
    // Build structured message: subject line + up to 5 bullets when available
    const collapsedTrimmed = collapsed.map((l) => l.trim());
    const subject =
      collapsedTrimmed.find((l) => {
        const lower = l.toLowerCase();
        return (
          l !== '' &&
          !l.endsWith(':') &&
          !lower.startsWith('key changes:') &&
          !lower.startsWith('co-authored-by:') &&
          !lower.startsWith('http://') &&
          !lower.startsWith('https://') &&
          !/^[*+-]/.test(l) &&
          !/^\d+[).]\s+/.test(l) &&
          !lower.startsWith('🤖 generated with')
        );
      }) ?? '';

    const bulletCandidates: string[] = [];
    for (const raw of collapsed) {
      const line = raw.trim();
      const unorderedMatch = line.match(/^[*+-]\s+(.*)$/);
      if (isNonEmptyString(unorderedMatch?.[1])) {
        bulletCandidates.push(unorderedMatch[1].trim());
        continue;
      }
      const orderedMatch = line.match(/^\d+[).]\s+(.*)$/);
      if (isNonEmptyString(orderedMatch?.[1])) {
        bulletCandidates.push(orderedMatch[1].trim());
      }
    }

    if (bulletCandidates.length === 0) {
      const keyIndex = collapsedTrimmed.findIndex((l) => l.toLowerCase() === 'key changes:');
      if (keyIndex !== -1) {
        for (let index = keyIndex + 1; index < collapsedTrimmed.length; index++) {
          const nextLine = collapsedTrimmed[index];
          if (nextLine === '') {
            break;
          }
          const stripped = (nextLine ?? '').replace(/^[\d)*+.-]+\s+/, '').trim();
          if (isNonEmptyString(stripped)) {
            bulletCandidates.push(stripped);
          }
        }
      }
    }

    const bullets = bulletCandidates.slice(0, 5);

    if (subject !== '') {
      commitMessage =
        bullets.length > 0 ? `${subject}\n\n${bullets.map((b) => `- ${b}`).join('\n')}` : subject;
    } else if (bullets.length > 0) {
      commitMessage = bullets.map((b) => `- ${b}`).join('\n');
    } else {
      commitMessage = collapsed.join('\n').trim();
    }

    // Fallback to basic analysis if AI fails
    if (commitMessage === '' || commitMessage.length < 10) {
      commitMessage = generateFallbackCommitMessage(statusLines);
    }

    // Add chopstack signature
    return `${commitMessage}\n\n🤖 Generated with Claude via chopstack\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
  } catch {
    logger.info(chalk.yellow('⚠️ AI generation failed, using fallback...'));
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
