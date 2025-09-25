import { execa } from 'execa';

import { hasContent } from '@/validation/guards';

/**
 * Minimal task interface for commit message generation
 * Can be fulfilled by any task object with these properties
 */
export type CommitTask = {
  description: string;
  produces: string[];
  title: string;
};

/**
 * Configuration options for commit message generation
 */
export type CommitMessageGeneratorConfig = {
  /** AI client command (default: 'claude') */
  aiCommand?: string;
  /** Timeout for AI generation in ms (default: 30000) */
  aiTimeout?: number;
  /** Enable/disable AI generation (default: true) */
  enableAI?: boolean;
  /** Custom logger function */
  logger?: {
    warn: (message: string) => void;
  };
  /** Custom signature to append to commits */
  signature?: string;
};

/**
 * Options for generating a commit message
 */
export type CommitMessageOptions = {
  /** Specific files involved in the change */
  files?: string[];
  /** Task execution output or additional context */
  output?: string;
  /** Working directory for git operations */
  workdir: string;
};

/**
 * Standalone commit message generator that can be used independently
 * Designed to be extractable as a separate npm package
 */
export class CommitMessageGenerator {
  private readonly config: Required<CommitMessageGeneratorConfig>;

  constructor(config: CommitMessageGeneratorConfig = {}) {
    this.config = {
      aiCommand: config.aiCommand ?? 'claude',
      aiTimeout: config.aiTimeout ?? 30_000,
      signature:
        config.signature ??
        '🤖 Generated with Claude via chopstack\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
      enableAI: config.enableAI ?? true,
      logger: config.logger ?? { warn: () => {} },
    };
  }

  /**
   * Generate intelligent commit message based on task and changes
   */
  async generateCommitMessage(task: CommitTask, options: CommitMessageOptions): Promise<string> {
    // Try AI-powered generation first if enabled
    if (this.config.enableAI) {
      try {
        const aiMessage = await this._generateAICommitMessage(task, options);
        if (this._isValidMessage(aiMessage)) {
          return this._addSignature(aiMessage);
        }
      } catch (error) {
        this.config.logger.warn(
          `⚠️ AI commit message generation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fallback to intelligent rule-based generation
    const ruleBasedMessage = this._generateRuleBasedCommitMessage(task, options);
    return this._addSignature(ruleBasedMessage);
  }

  /**
   * Generate commit message using AI client
   */
  private async _generateAICommitMessage(
    task: CommitTask,
    options: CommitMessageOptions,
  ): Promise<string> {
    // Get git diff information using raw git commands to avoid dependencies
    const gitDiff = await this._execGit(['diff', '--cached', '--stat'], options.workdir);
    const gitDiffDetails = await this._execGit(
      ['diff', '--cached', '--name-status'],
      options.workdir,
    );

    const prompt = `Generate a professional commit message for this task:

Task: ${task.title}
Description: ${task.description}

Git Changes:
${gitDiffDetails}

Git Diff Summary:
${gitDiff}

Task Output:
${options.output ?? 'No output available'}

Requirements:
1. Clear, descriptive title (50 chars or less)
2. Explain WHAT was changed and WHY
3. Use imperative mood ("Add feature" not "Added feature")
4. Be professional and follow conventional commits style
5. Focus on the business value and purpose
6. DO NOT include preamble like "Looking at the changes" or "Based on the diff"
7. Start directly with the action ("Add", "Fix", "Update", etc.)

Return ONLY the commit message content between these markers:
<<<COMMIT_MESSAGE_START>>>
(commit message goes here)
<<<COMMIT_MESSAGE_END>>>`;

    try {
      const { stdout: aiResponse } = await execa(this.config.aiCommand, [prompt], {
        cwd: options.workdir,
        timeout: this.config.aiTimeout,
      });

      return this._parseAICommitMessage(aiResponse);
    } catch (error) {
      throw new Error(
        `${this.config.aiCommand} CLI failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private _parseAICommitMessage(aiResponse: string): string {
    // Extract content between sentinel markers
    const startTag = '<<<COMMIT_MESSAGE_START>>>';
    const endTag = '<<<COMMIT_MESSAGE_END>>>';
    const startIndex = aiResponse.indexOf(startTag);
    const endIndex = aiResponse.indexOf(endTag);

    let message = '';
    message =
      startIndex !== -1 && endIndex !== -1 && endIndex > startIndex
        ? aiResponse.slice(startIndex + startTag.length, endIndex).trim()
        : aiResponse.trim();

    // Clean up common AI artifacts and preamble
    message = message
      .replaceAll('```', '')
      .replace(/^here's? (?:the |a )?commit message:?\s*/i, '')
      .replace(/^based on (?:the )?git diff.*$/im, '')
      .replace(/^looking at (?:the )?changes.*$/im, '')
      .replace(/^analyzing (?:the )?changes.*$/im, '')
      .replace(/^from (?:the )?changes.*$/im, '')
      .replace(/^i can see (?:that )?this.*$/im, '')
      .replace(/^this (?:change|commit|update).*$/im, '')
      .replace(/^the (?:changes|modifications).*$/im, '')
      .trim();

    // Clean up any remaining preamble patterns and take the first action line
    const lines = message.split('\n').filter((l) => l.trim() !== '');
    for (const line of lines) {
      const cleanLine = line.trim();
      // Skip lines that look like preamble/analysis
      if (
        /^(looking|analyzing|based|from|i can see|this|the changes|the modifications)/i.test(
          cleanLine,
        ) ||
        /^(here|now|let me|first|next|then)/i.test(cleanLine) ||
        cleanLine.length < 5
      ) {
        continue;
      }
      // Take the first line that looks like an actual commit message
      message = cleanLine;
      break;
    }

    // If we didn't find a good line, take the first non-empty one
    if (message === '' && lines.length > 0) {
      message = lines[0] ?? '';
    }

    if (!this._isValidMessage(message)) {
      throw new Error('AI generated empty or too short commit message');
    }

    return message;
  }

  /**
   * Generate commit message using rule-based analysis
   */
  private _generateRuleBasedCommitMessage(task: CommitTask, options: CommitMessageOptions): string {
    const files = options.files ?? [];

    // Analyze file patterns for intelligent categorization
    const categories = this._categorizeFiles(files);

    // Generate message based on task and file changes
    if (categories.components.length > 0) {
      return `Add ${task.title}\n\nImplements ${categories.components.join(', ')} components`;
    }

    if (categories.apis.length > 0) {
      return `Implement ${task.title}\n\nAdds API endpoints: ${categories.apis.join(', ')}`;
    }

    if (categories.tests.length > 0) {
      return `Add ${task.title}\n\nImplements test coverage for core functionality`;
    }

    // Fallback to task-based message
    const verb = task.produces.length > 0 ? 'Add' : 'Update';
    return `${verb} ${task.title}\n\n${task.description}`;
  }

  private _categorizeFiles(files: string[]): {
    apis: string[];
    components: string[];
    configs: string[];
    docs: string[];
    tests: string[];
  } {
    const categories = {
      components: [] as string[],
      apis: [] as string[],
      tests: [] as string[],
      configs: [] as string[],
      docs: [] as string[],
    };

    for (const file of files) {
      const lower = file.toLowerCase();

      if (lower.includes('component') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
        categories.components.push(file);
      } else if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route')) {
        categories.apis.push(file);
      } else if (lower.includes('test') || lower.includes('spec')) {
        categories.tests.push(file);
      } else if (lower.includes('config') || lower.endsWith('.json') || lower.endsWith('.yaml')) {
        categories.configs.push(file);
      } else if (lower.endsWith('.md') || lower.includes('readme') || lower.includes('doc')) {
        categories.docs.push(file);
      }
    }

    return categories;
  }

  /**
   * Add signature to commit message
   */
  private _addSignature(message: string): string {
    if (!hasContent(this.config.signature)) {
      return message;
    }
    return `${message}\n\n${this.config.signature}`;
  }

  /**
   * Check if message is valid (non-empty and has minimum length)
   */
  private _isValidMessage(message: string): boolean {
    return typeof message === 'string' && message.trim().length >= 5;
  }

  /**
   * Execute git command and return stdout
   */
  private async _execGit(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execa('git', args, { cwd });
      return stdout;
    } catch (error) {
      throw new Error(
        `Git command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
