import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import type { DecomposerAgent, Plan } from '@/types/decomposer';

import { type ParsedContent, YamlPlanParser } from '@/io/yaml-parser';
import { PromptBuilder } from '@/services/planning/prompts';
import { AgentNotFoundError, PlanParsingError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

const FIVE_MINUTES_IN_MS = 300_000;

const DEFAULT_CODEX_COMMAND = 'codex';
// Run Codex in headless mode so it prints JSONL events that we can stream-parse.
const DEFAULT_CODEX_ARGS = [
  'exec',
  '--json',
  '--color',
  'never',
  '--sandbox',
  'read-only',
  '-',
] as const;

type CodexEvent = {
  msg?: Record<string, unknown> | null;
};

type CodexInvocation = {
  args: string[];
  command: string;
};

function readStringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArgsFromJson(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((entry): entry is string => typeof entry === 'string')
    ) {
      return [...parsed];
    }
    logger.warn('⚠️ CODEX_CLI_ARGS_JSON must be a JSON array of strings. Ignoring override.');
    return null;
  } catch (error) {
    logger.warn('⚠️ Failed to parse CODEX_CLI_ARGS_JSON. Ignoring override.', { error });
    return null;
  }
}

function parseArgsFromShellString(value: string): string[] | null {
  const matches = value.match(/"[^"]*"|'[^']*'|\S+/g);
  if (matches === null) {
    return null;
  }

  const cleaned = matches
    .map((token) => token.replaceAll(/^["']|["']$/g, ''))
    .map((token) => token.trim())
    .filter((token): token is string => token !== '');

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Resolve the Codex command/arguments taking environment overrides into account.
 */
function resolveCodexInvocation(): CodexInvocation {
  const commandOverride = process.env.CODEX_CLI_COMMAND;
  const argsOverrideJson = process.env.CODEX_CLI_ARGS_JSON;
  const argsOverrideShell = process.env.CODEX_CLI_ARGS;

  const command = isNonEmptyString(commandOverride)
    ? commandOverride.trim()
    : DEFAULT_CODEX_COMMAND;

  let args: string[] = [...DEFAULT_CODEX_ARGS];

  if (isNonEmptyString(argsOverrideJson)) {
    const parsed = parseArgsFromJson(argsOverrideJson);
    if (parsed !== null) {
      args = parsed;
      return { command, args };
    }
  }

  if (isNonEmptyString(argsOverrideShell)) {
    const parsed = parseArgsFromShellString(argsOverrideShell);
    if (parsed !== null) {
      args = parsed;
    }
  }

  return { command, args };
}

export class CodexDecomposer implements DecomposerAgent {
  async decompose(
    specContent: string,
    cwd: string,
    options?: { verbose?: boolean },
  ): Promise<Plan> {
    try {
      const prompt = PromptBuilder.buildDecompositionPrompt(specContent);
      const stdout = await this._executeCodexCommand(prompt, cwd, options?.verbose ?? false);
      const parsedContent = this._parseCodexResponse(stdout);
      const plan = this._validateAndReturnPlan(parsedContent);

      return plan;
    } catch (error) {
      if (error instanceof PlanParsingError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AgentNotFoundError('codex', error);
      }
      throw new AgentNotFoundError('codex');
    }
  }

  private async _executeCodexCommand(
    prompt: string,
    cwd: string,
    verbose: boolean,
  ): Promise<string> {
    logger.info('🔍 Running Codex CLI in non-interactive mode...');
    logger.info(`📁 Working directory: ${cwd}`);

    return new Promise<string>((resolve, reject) => {
      const { command, args } = resolveCodexInvocation();

      const child = spawn(command, args, {
        cwd,
        env: process.env,
      });

      const handler = new CodexStreamCollector(resolve, reject, verbose);
      if (!verbose) {
        handler.startInitialSpinner(); // Start spinner only in non-verbose mode
      }
      handler.attachToProcess(child, prompt);
    });
  }

  private _parseCodexResponse(stdout: string): ParsedContent {
    logger.debug(`📤 Codex stdout length: ${stdout.length} characters`);
    if (stdout.length < 500) {
      logger.debug(`📤 Codex stdout: ${stdout}`);
    }

    const parsedContent = this._extractPlanContent(stdout);
    if (parsedContent !== null) {
      return parsedContent;
    }

    logger.error('❌ No YAML or JSON plan found in Codex output');
    logger.error(`📤 Full stdout for debugging:\n${stdout}`);
    throw new PlanParsingError('No YAML or JSON plan found in Codex CLI output', stdout);
  }

  private _extractPlanContent(stdout: string): ParsedContent | null {
    logger.info('🔍 Extracting YAML/JSON plan from Codex response...');

    // First try markdown-wrapped content
    const yamlPlan = YamlPlanParser.extractYamlFromMarkdown(stdout);
    if (isNonEmptyString(yamlPlan)) {
      logger.debug(`✅ Found YAML plan in markdown, length: ${yamlPlan.length} characters`);
      return { content: yamlPlan, source: 'yaml' };
    }

    const jsonPlan = YamlPlanParser.extractJsonFromMarkdown(stdout);
    if (isNonEmptyString(jsonPlan)) {
      logger.debug(`✅ Found JSON plan in markdown, length: ${jsonPlan.length} characters`);
      return { content: jsonPlan, source: 'json' };
    }

    // If no markdown blocks found, try raw YAML (common for Codex)
    if (stdout.trim().startsWith('tasks:')) {
      logger.debug(`✅ Found raw YAML plan, length: ${stdout.length} characters`);
      return { content: stdout.trim(), source: 'yaml' };
    }

    // Finally try raw JSON
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonString = stdout.slice(jsonStart, jsonEnd + 1);
      logger.debug(`✅ Found raw JSON plan, length: ${jsonString.length} characters`);
      return { content: jsonString, source: 'json' };
    }

    return null;
  }

  private _validateAndReturnPlan(parsedContent: ParsedContent): Plan {
    return YamlPlanParser.parseAndValidatePlan(parsedContent);
  }
}

/**
 * Collects JSONL output from `codex exec --json`, tracking the latest agent message.
 */
class CodexStreamCollector {
  private _fullStdout = '';
  private _stderr = '';
  private _lineBuffer = '';
  private readonly agentMessages: string[] = [];
  private _lastAgentMessage: string | null = null;
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
      text: 'Codex is analyzing the codebase',
      spinner: 'dots',
      color: 'cyan',
    }).start();
  }

  attachToProcess(child: ReturnType<typeof spawn>, prompt: string): void {
    this._timeout = setTimeout(() => {
      child.kill();
      this._reject(new Error('Codex command timed out after 5 minutes'));
    }, FIVE_MINUTES_IN_MS);

    child.stdout?.on('data', (data: Buffer) => {
      this._handleStdout(data);
    });

    child.stderr?.on('data', (data: Buffer) => {
      this._handleStderr(data);
    });

    child.on('error', (error) => {
      this._clearTimeout();
      if (this._spinner !== null) {
        this._spinner.fail('Failed to start Codex');
        this._spinner = null;
      }
      this._reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });

    child.on('close', (code: number | null) => {
      this._handleClose(code);
    });

    this._sendPrompt(child, prompt);
  }

  private _sendPrompt(child: ReturnType<typeof spawn>, prompt: string): void {
    child.stdin?.write(prompt);
    child.stdin?.end();
  }

  private _handleStdout(data: Buffer): void {
    const chunk = data.toString();
    this._fullStdout += chunk;
    this._lineBuffer += chunk;

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
        this._spinner.text = `Codex is analyzing${dots}`;
      }
    }

    const lines = this._lineBuffer.split('\n');
    this._lineBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line !== '') {
        this._processLine(line);
      }
    }
  }

  private _processLine(line: string): void {
    try {
      const event = JSON.parse(line) as CodexEvent;
      this._handleCodexEvent(event);
    } catch {
      // Non-JSON output (config summaries, etc.)
      this.agentMessages.push(line);
    }
  }

  private _handleCodexEvent(event: CodexEvent): void {
    const { msg } = event;
    if (!isRecord(msg)) {
      return;
    }

    const type = readStringField(msg, 'type');

    if (type === null) {
      return;
    }

    switch (type) {
      case 'agent_message': {
        const message = readStringField(msg, 'message');
        if (isNonEmptyString(message)) {
          this.agentMessages.push(message);
          if (!this._verbose && this._spinner !== null) {
            this._spinner.text = 'Codex is generating the plan';
          }
        }
        break;
      }
      case 'agent_message_delta': {
        const delta = readStringField(msg, 'delta');
        if (isNonEmptyString(delta)) {
          this.agentMessages.push(delta);
          if (!this._verbose && this._spinner !== null) {
            this._progressDots++;
            const dots = '.'.repeat(Math.min(this._progressDots % 4, 3));
            this._spinner.text = `Codex is writing${dots}`;
          }
        }
        break;
      }
      case 'task_complete': {
        const lastAgentMessage = readStringField(msg, 'last_agent_message');
        if (isNonEmptyString(lastAgentMessage)) {
          this._lastAgentMessage = lastAgentMessage;
          if (!this._verbose && this._spinner !== null) {
            this._spinner.succeed('Codex finished generating response');
            this._spinner = null;
          }
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  private _handleStderr(data: Buffer): void {
    this._stderr += data.toString();
  }

  private _handleClose(code: number | null): void {
    this._clearTimeout();
    this._flushRemainingBuffer();

    if (this._spinner !== null) {
      this._spinner.stop();
      this._spinner = null;
    }

    if (code !== 0) {
      logger.error(chalk.red(`❌ Codex CLI exited with code ${code}`));
      if (this._stderr !== '') {
        logger.error(chalk.dim(`Stderr: ${this._stderr}`));
      }
      this._reject(new Error(`Codex CLI exited with code ${code}`));
      return;
    }

    const result = this._lastAgentMessage ?? this.agentMessages.join('\n');

    if (!isNonEmptyString(result)) {
      if (this._fullStdout.trim() === '') {
        this._reject(new PlanParsingError('Codex CLI produced no output'));
        return;
      }
      this._resolve(this._fullStdout);
      return;
    }

    this._resolve(result);
  }

  private _flushRemainingBuffer(): void {
    const remaining = this._lineBuffer.trim();
    if (remaining !== '') {
      this._processLine(remaining);
      this._lineBuffer = '';
    }
  }

  private _clearTimeout(): void {
    if (isNonNullish(this._timeout)) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
}
