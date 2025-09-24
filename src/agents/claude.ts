import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { match } from 'ts-pattern';

import type { DecomposerAgent, Plan } from '../types/decomposer';

import { type ParsedContent, YamlPlanParser } from '../io/yaml-parser';
import { PromptBuilder } from '../planning/prompts';
import { AgentNotFoundError, PlanParsingError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isNonEmptyString, isNonNullish } from '../validation/guards';

type StreamingMessage = {
  delta?: {
    text?: string;
  };
  error?: {
    message?: string;
  };
  type: string;
};

type ClaudeResponse = {
  result?: string;
  type?: string;
};

export class ClaudeCodeDecomposer implements DecomposerAgent {
  async decompose(
    specContent: string,
    cwd: string,
    options?: { verbose?: boolean },
  ): Promise<Plan> {
    try {
      const prompt = PromptBuilder.buildDecompositionPrompt(specContent);
      const stdout = await this._executeClaudeCommand(prompt, cwd, options?.verbose ?? false);
      const parsedContent = this._parseClaudeResponse(stdout);
      const plan = this._validateAndReturnPlan(parsedContent);

      return plan;
    } catch (error) {
      if (error instanceof PlanParsingError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AgentNotFoundError('claude', error);
      }
      throw new AgentNotFoundError('claude');
    }
  }

  private async _executeClaudeCommand(
    prompt: string,
    cwd: string,
    verbose: boolean,
  ): Promise<string> {
    logger.info('🔍 Running Claude with stdin input...');
    logger.info(`📁 Working directory: ${cwd}`);

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        'claude',
        ['--permission-mode', 'plan', '--verbose', '--output-format', 'stream-json'],
        {
          cwd,
          env: process.env,
        },
      );

      const handler = new ClaudeStreamHandler(resolve, reject, verbose);
      if (!verbose) {
        handler.startInitialSpinner(); // Start spinner only in non-verbose mode
      }
      handler.attachToProcess(child);
      handler.sendPrompt(child, prompt);
    });
  }

  private _parseClaudeResponse(stdout: string): ParsedContent {
    logger.debug(`📤 Claude stdout length: ${stdout.length} characters`);
    if (stdout.length < 500) {
      logger.debug(`📤 Claude stdout: ${stdout}`);
    }

    logger.info('🔍 Searching for YAML or JSON in Claude response...');

    // Try JSON wrapper format first (Claude CLI stream-json)
    const jsonResult = this._tryParseJsonWrapper(stdout);
    if (jsonResult !== null) {
      return jsonResult;
    }

    // Fallback to direct parsing
    return this._tryParseDirectContent(stdout);
  }

  private _tryParseJsonWrapper(stdout: string): ParsedContent | null {
    try {
      // stream-json format outputs one JSON object per line
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (line.trim() === '') {
          continue;
        }

        try {
          const json = JSON.parse(line) as ClaudeResponse;
          // Look for the final result object
          if (json.type === 'result' && isNonEmptyString(json.result)) {
            logger.debug('✅ Found JSON result object, extracting content...');
            return this._extractContentFromResult(json.result);
          }
        } catch {
          // Skip lines that aren't valid JSON
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private _extractContentFromResult(result: string): ParsedContent {
    // Try YAML code block
    const yamlMatch = result.match(/```yaml\n([\S\s]+?)\n```/);
    if (isNonNullish(yamlMatch) && isNonEmptyString(yamlMatch[1])) {
      logger.debug(`✅ Found YAML plan in JSON result, length: ${yamlMatch[1].length} characters`);
      return { content: yamlMatch[1], source: 'yaml' };
    }

    // Try JSON code block
    const jsonMatch = result.match(/```json\n([\S\s]+?)\n```/);
    if (isNonNullish(jsonMatch) && isNonEmptyString(jsonMatch[1])) {
      logger.debug(`✅ Found JSON plan in JSON result, length: ${jsonMatch[1].length} characters`);
      return { content: jsonMatch[1], source: 'json' };
    }

    // Try direct YAML parsing
    logger.debug('🔍 Attempting to parse result field directly as YAML...');
    return { content: result, source: 'yaml' };
  }

  private _tryParseDirectContent(stdout: string): ParsedContent {
    logger.debug('🔍 Not a JSON wrapper, trying direct YAML/JSON extraction...');

    // Try YAML code block
    const yamlMatch = stdout.match(/```yaml\n([\S\s]+?)\n```/);
    if (isNonNullish(yamlMatch) && isNonEmptyString(yamlMatch[1])) {
      logger.debug(`✅ Found YAML plan, length: ${yamlMatch[1].length} characters`);
      return { content: yamlMatch[1], source: 'yaml' };
    }

    // Try JSON code block
    const jsonMatch = stdout.match(/```json\n([\S\s]+?)\n```/);
    if (isNonNullish(jsonMatch) && isNonEmptyString(jsonMatch[1])) {
      logger.debug(`✅ Found JSON plan, length: ${jsonMatch[1].length} characters`);
      return { content: jsonMatch[1], source: 'json' };
    }

    // Try raw JSON extraction
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonString = stdout.slice(jsonStart, jsonEnd + 1);
      logger.debug(`✅ Found raw JSON plan, length: ${jsonString.length} characters`);
      return { content: jsonString, source: 'json' };
    }

    logger.error('❌ No YAML or JSON plan found in Claude output');
    logger.error(`📤 Full stdout for debugging:\n${stdout}`);
    throw new Error('No YAML or JSON plan found in Claude output');
  }

  private _validateAndReturnPlan(parsedContent: ParsedContent): Plan {
    return YamlPlanParser.parseAndValidatePlan(parsedContent);
  }
}

class ClaudeStreamHandler {
  private _fullOutput = '';
  private _contentOutput = '';
  private _errorOutput = '';
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _spinner: Ora | null = null;
  private _progressDots = 0;

  constructor(
    private readonly _resolve: (value: string) => void,
    private readonly _reject: (error: Error) => void,
    private readonly _verbose: boolean = false,
  ) {}

  startInitialSpinner(): void {
    this._spinner ??= ora({
      text: 'Claude is analyzing the codebase',
      spinner: 'dots',
      color: 'cyan',
    }).start();
  }

  attachToProcess(child: ReturnType<typeof spawn>): void {
    this._timeout = setTimeout(() => {
      child.kill();
      this._reject(new Error('Claude command timed out after 5 minutes'));
    }, 300_000); // 5 minutes

    child.stdout?.on('data', (data: Buffer) => {
      this._handleStdout(data);
    });
    child.stderr?.on('data', (data: Buffer) => {
      this._handleStderr(data);
    });
    child.on('error', (error) => {
      this._handleError(error);
    });
    child.on('close', (code: number | null) => {
      this._handleClose(code);
    });
  }

  sendPrompt(child: ReturnType<typeof spawn>, prompt: string): void {
    child.stdin?.write(prompt);
    child.stdin?.end();
  }

  private _handleStdout(data: Buffer): void {
    const chunk = data.toString();
    this._fullOutput += chunk;

    if (this._verbose) {
      // In verbose mode, stream raw output directly
      process.stdout.write(chunk);
    } else if (chunk.trim() !== '') {
      // In standard mode, use spinner with progress
      if (this._spinner === null) {
        this.startInitialSpinner();
      }
      if (this._spinner !== null) {
        this._progressDots++;
        const dots = '.'.repeat(Math.min(this._progressDots % 4, 3));
        this._spinner.text = `Analyzing codebase${dots}`;
      }
    }

    const lines = chunk.split('\n').filter((line: string) => line.trim() !== '');
    for (const line of lines) {
      this._processStreamingLine(line);
    }
  }

  private _processStreamingLine(line: string): void {
    try {
      const json = JSON.parse(line) as StreamingMessage;
      this._handleStreamingMessage(json);
    } catch {
      // Not JSON, treat as regular output
      this._contentOutput += `${line}\n`;
    }
  }

  private _handleStreamingMessage(json: StreamingMessage): void {
    const { type, delta, error } = json;

    if (
      (type === 'message_delta' || type === 'content_block_delta') &&
      isNonEmptyString(delta?.text)
    ) {
      this._contentOutput += delta.text;
      this._showProgress();
      return;
    }

    // Only handle spinner messages in non-verbose mode
    if (!this._verbose) {
      match(type)
        .with('message_start', () => {
          if (this._spinner === null) {
            this._spinner = ora({
              text: 'Claude is analyzing the codebase',
              spinner: 'dots',
              color: 'cyan',
            }).start();
          } else {
            this._spinner.text = 'Claude is analyzing the codebase';
          }
        })
        .with('message_stop', () => {
          if (isNonNullish(this._spinner)) {
            this._spinner.succeed('Claude finished generating response');
            this._spinner = null;
          }
        })
        .with('content_block_start', () => {
          if (isNonNullish(this._spinner)) {
            this._spinner.text = 'Claude is writing the plan';
          }
        })
        .with('error', () => {
          const errorMessage = error?.message ?? 'Unknown error';
          if (isNonNullish(this._spinner)) {
            this._spinner.fail(`Claude error: ${errorMessage}`);
            this._spinner = null;
          } else {
            logger.error(chalk.red(`❌ Claude error: ${errorMessage}`));
          }
        })
        .with('rate_limit', () => {
          if (isNonNullish(this._spinner)) {
            this._spinner.warn(`Rate limit: ${JSON.stringify(json)}`);
          } else {
            logger.warn(chalk.yellow(`⚠️ Rate limit: ${JSON.stringify(json)}`));
          }
        })
        .otherwise(() => {
          // Ignore other message types
        });
    }
  }

  private _showProgress(): void {
    if (!this._verbose && isNonNullish(this._spinner)) {
      this._progressDots++;
      const dots = '.'.repeat(Math.min(this._progressDots % 4, 3));
      this._spinner.text = `Processing response${dots}`;
    }
  }

  private _handleStderr(data: Buffer): void {
    this._errorOutput += data.toString();
  }

  private _handleError(error: Error): void {
    this._clearTimeout();
    if (this._spinner !== null) {
      this._spinner.fail('Failed to start Claude');
      this._spinner = null;
    }
    this._reject(new Error(`Failed to spawn Claude: ${error.message}`));
  }

  private _handleClose(code: number | null): void {
    this._clearTimeout();

    if (isNonNullish(this._spinner)) {
      this._spinner.stop();
      this._spinner = null;
    }

    if (code !== 0) {
      logger.error(chalk.red(`❌ Claude exited with code ${code}`));
      if (this._errorOutput !== '') {
        logger.error(chalk.dim(`Stderr: ${this._errorOutput}`));
      }
      this._reject(new Error(`Claude exited with code ${code}`));
    } else {
      // For stream-json format, the final result is in fullOutput as JSON
      // For regular streaming, content would be accumulated in contentOutput
      const result = this._fullOutput !== '' ? this._fullOutput : this._contentOutput;
      this._resolve(result);
    }
  }

  private _clearTimeout(): void {
    if (isNonNullish(this._timeout)) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
}
