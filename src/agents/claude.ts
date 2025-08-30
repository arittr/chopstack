import { exec, spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';
import { promisify } from 'node:util';

import { match } from 'ts-pattern';
import { parse as parseYaml } from 'yaml';

import type { DecomposerAgent, Plan } from '../types/decomposer';

import { PlanSchema } from '../types/decomposer';
import { PromptBuilder } from '../types/prompts';
import { isNonEmptyString, isNonNullish } from '../utils/guards';

const execAsync = promisify(exec);

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

type ParsedContent = {
  content: string;
  source: 'yaml' | 'json' | 'raw';
};

export class ClaudeCodeDecomposer implements DecomposerAgent {
  private static readonly CLI_CHECK_TIMEOUT = 5000;

  async decompose(specContent: string, cwd: string): Promise<Plan> {
    await this._validateClaudeCLI();

    const prompt = PromptBuilder.buildDecompositionPrompt(specContent);
    const stdout = await this._executeClaudeCommand(prompt, cwd);
    const parsedContent = this._parseClaudeResponse(stdout);
    const plan = this._validateAndReturnPlan(parsedContent);

    return plan;
  }

  private async _validateClaudeCLI(): Promise<void> {
    console.log('🔍 Checking if Claude CLI is available...');

    try {
      await execAsync('claude --version', { timeout: ClaudeCodeDecomposer.CLI_CHECK_TIMEOUT });
      console.log('✅ Claude CLI is available');
    } catch {
      console.warn('⚠️ Claude CLI not found. Please install the Claude CLI first.');
      console.warn('⚠️ Falling back to mock agent for demonstration.');
      throw new Error('Claude CLI not found. Please install the Claude CLI or use --agent mock');
    }
  }

  private async _executeClaudeCommand(prompt: string, cwd: string): Promise<string> {
    console.log('🔍 Running Claude with stdin input...');
    console.log(`📁 Working directory: ${cwd}`);

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        'claude',
        ['--permission-mode', 'plan', '--verbose', '--output-format', 'stream-json'],
        {
          cwd,
          env: process.env,
        },
      );

      const handler = new ClaudeStreamHandler(resolve, reject);
      handler.attachToProcess(child);
      handler.sendPrompt(child, prompt);
    });
  }

  private _parseClaudeResponse(stdout: string): ParsedContent {
    console.log(`📤 Claude stdout length: ${stdout.length} characters`);
    if (stdout.length < 500) {
      console.log(`📤 Claude stdout: ${stdout}`);
    }

    console.log('🔍 Searching for YAML or JSON in Claude response...');

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
            console.log('✅ Found JSON result object, extracting content...');
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
      console.log(`✅ Found YAML plan in JSON result, length: ${yamlMatch[1].length} characters`);
      return { content: yamlMatch[1], source: 'yaml' };
    }

    // Try JSON code block
    const jsonMatch = result.match(/```json\n([\S\s]+?)\n```/);
    if (isNonNullish(jsonMatch) && isNonEmptyString(jsonMatch[1])) {
      console.log(`✅ Found JSON plan in JSON result, length: ${jsonMatch[1].length} characters`);
      return { content: jsonMatch[1], source: 'json' };
    }

    // Try direct YAML parsing
    console.log('🔍 Attempting to parse result field directly as YAML...');
    return { content: result, source: 'yaml' };
  }

  private _tryParseDirectContent(stdout: string): ParsedContent {
    console.log('🔍 Not a JSON wrapper, trying direct YAML/JSON extraction...');

    // Try YAML code block
    const yamlMatch = stdout.match(/```yaml\n([\S\s]+?)\n```/);
    if (isNonNullish(yamlMatch) && isNonEmptyString(yamlMatch[1])) {
      console.log(`✅ Found YAML plan, length: ${yamlMatch[1].length} characters`);
      return { content: yamlMatch[1], source: 'yaml' };
    }

    // Try JSON code block
    const jsonMatch = stdout.match(/```json\n([\S\s]+?)\n```/);
    if (isNonNullish(jsonMatch) && isNonEmptyString(jsonMatch[1])) {
      console.log(`✅ Found JSON plan, length: ${jsonMatch[1].length} characters`);
      return { content: jsonMatch[1], source: 'json' };
    }

    // Try raw JSON extraction
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonString = stdout.slice(jsonStart, jsonEnd + 1);
      console.log(`✅ Found raw JSON plan, length: ${jsonString.length} characters`);
      return { content: jsonString, source: 'json' };
    }

    console.error('❌ No YAML or JSON plan found in Claude output');
    console.error(`📤 Full stdout for debugging:\n${stdout}`);
    throw new Error('No YAML or JSON plan found in Claude output');
  }

  private _validateAndReturnPlan(parsedContent: ParsedContent): Plan {
    console.log('🔍 Validating plan structure with Zod...');

    try {
      const rawPlan = match(parsedContent.source)
        .with('yaml', () => parseYaml(parsedContent.content) as unknown)
        .with('json', () => JSON.parse(parsedContent.content) as unknown)
        .with('raw', () => parseYaml(parsedContent.content) as unknown)
        .exhaustive();

      const validatedPlan = PlanSchema.parse(rawPlan);
      console.log(`✅ Plan validated successfully with ${validatedPlan.tasks.length} tasks`);

      return validatedPlan;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parsing error';
      console.error(`❌ Failed to parse ${parsedContent.source}: ${message}`);
      console.error(`📤 Content for debugging:\n${parsedContent.content}`);
      throw new Error(`Failed to parse ${parsedContent.source}: ${message}`);
    }
  }
}

class ClaudeStreamHandler {
  private _fullOutput = '';
  private _contentOutput = '';
  private _errorOutput = '';
  private _timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _resolve: (value: string) => void,
    private readonly _reject: (error: Error) => void,
  ) {}

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

    // Show the raw chunk for immediate feedback (streaming feel)
    if (chunk.trim() !== '') {
      process.stdout.write('.');
      if ('flush' in process.stdout && typeof process.stdout.flush === 'function') {
        (process.stdout.flush as () => void)();
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

    match(type)
      .with('message_start', () => {
        console.log('\n🤖 Claude is analyzing the codebase...');
      })
      .with('message_stop', () => {
        console.log('\n✅ Claude finished generating response');
      })
      .with('content_block_start', () => {
        console.log('📝 Claude is writing the plan...');
      })
      .with('error', () => {
        const errorMessage = error?.message ?? 'Unknown error';
        console.error(`\n❌ Claude error: ${errorMessage}`);
      })
      .with('rate_limit', () => {
        console.warn(`\n⚠️ Rate limit: ${JSON.stringify(json)}`);
      })
      .otherwise(() => {
        // Ignore other message types
      });
  }

  private _showProgress(): void {
    process.stdout.write('.');
    if ('flush' in process.stdout && typeof process.stdout.flush === 'function') {
      (process.stdout.flush as () => void)();
    }
  }

  private _handleStderr(data: Buffer): void {
    this._errorOutput += data.toString();
  }

  private _handleError(error: Error): void {
    this._clearTimeout();
    this._reject(new Error(`Failed to spawn Claude: ${error.message}`));
  }

  private _handleClose(code: number | null): void {
    this._clearTimeout();

    if (code !== 0) {
      console.error(`\n❌ Claude exited with code ${code}`);
      if (this._errorOutput !== '') {
        console.error(`Stderr: ${this._errorOutput}`);
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
