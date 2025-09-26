import { type ChildProcess, spawn } from 'node:child_process';

import { match } from 'ts-pattern';

import type { ExecutionMode } from '@/core/execution/types';
import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
} from '@/services/orchestration/types';

import { logger } from '@/utils/global-logger';

/**
 * Task execution adapter that delegates to the Claude CLI
 */
export class ClaudeCliTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly runningTasks = new Map<string, ChildProcess>();
  private readonly taskOutputs = new Map<string, string[]>();
  private readonly taskStartTimes = new Map<string, Date>();

  async executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult> {
    const { taskId, workdir, mode } = request;

    logger.info(`[ClaudeCliAdapter] Starting task ${taskId} in ${workdir ?? process.cwd()}`);

    this.taskOutputs.set(taskId, []);
    this.taskStartTimes.set(taskId, new Date());

    const prompt = this._createPrompt(request);
    const args = this._buildClaudeArgs(mode, prompt);

    logger.info(`[ClaudeCliAdapter] Created prompt (first 200 chars): ${prompt.slice(0, 200)}`);
    logger.info(`[ClaudeCliAdapter] Spawning claude with args: ${JSON.stringify(args)}`);
    logger.info(`[ClaudeCliAdapter] Working directory: ${workdir ?? process.cwd()}`);

    const claudeProcess = spawn('claude', args, {
      cwd: workdir ?? process.cwd(),
      env: process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    logger.info(`[ClaudeCliAdapter] Process spawned with PID: ${claudeProcess.pid}`);

    // Close stdin since we're not sending any input
    claudeProcess.stdin.end();

    // Add timeout to detect if process hangs - Claude CLI can take 60+ seconds
    const hangTimeout = global.setTimeout(() => {
      logger.warn(
        `[ClaudeCliAdapter] Task ${taskId} appears to be hanging after 2 minutes - this may be normal for complex tasks`,
      );
    }, 120_000);

    // Add periodic status updates
    const statusInterval = global.setInterval(() => {
      if (this.runningTasks.has(taskId)) {
        // Check if process is actually still running
        try {
          if (claudeProcess.pid !== undefined) {
            process.kill(claudeProcess.pid, 0); // Signal 0 just checks if process exists
            logger.info(
              `[ClaudeCliAdapter] Task ${taskId} still running (PID: ${claudeProcess.pid} confirmed alive)`,
            );
          }
        } catch {
          logger.warn(
            `[ClaudeCliAdapter] Task ${taskId} PID ${claudeProcess.pid} is not running anymore but hasn't fired close event`,
          );
        }
      }
    }, 30_000);

    this.runningTasks.set(taskId, claudeProcess);

    // Track if we've received any output
    let receivedOutput = false;

    claudeProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      receivedOutput = true;
      logger.info(`[ClaudeCliAdapter] Task ${taskId} STDOUT received (${output.length} chars)`);
      logger.info(`[ClaudeCliAdapter] Task ${taskId} STDOUT content: ${output}`);
      global.clearTimeout(hangTimeout);
      global.clearInterval(statusInterval);
      this._appendOutput(taskId, output);
      emitUpdate({
        taskId,
        type: 'stdout',
        data: output,
        timestamp: new Date(),
      });
    });

    claudeProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      receivedOutput = true;
      logger.info(`[ClaudeCliAdapter] Task ${taskId} STDERR received (${output.length} chars)`);
      logger.info(`[ClaudeCliAdapter] Task ${taskId} STDERR content: ${output}`);
      global.clearTimeout(hangTimeout);
      global.clearInterval(statusInterval);
      this._appendOutput(taskId, `[stderr] ${output}`);
      emitUpdate({
        taskId,
        type: 'stderr',
        data: output,
        timestamp: new Date(),
      });
    });

    // Also listen for stdout/stderr end events
    claudeProcess.stdout.on('end', () => {
      logger.info(`[ClaudeCliAdapter] Task ${taskId} stdout stream ended`);
    });

    claudeProcess.stderr.on('end', () => {
      logger.info(`[ClaudeCliAdapter] Task ${taskId} stderr stream ended`);
    });

    return new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        logger.info(
          `[ClaudeCliAdapter] Task ${taskId} process CLOSE event fired with code: ${code}`,
        );
        logger.info(`[ClaudeCliAdapter] Task ${taskId} received output: ${receivedOutput}`);

        global.clearTimeout(hangTimeout);
        global.clearInterval(statusInterval);

        const result = this._createResultFromClose(request, code);
        logger.info(
          `[ClaudeCliAdapter] Task ${taskId} result status: ${result.status}, output length: ${result.output?.length ?? 0}`,
        );

        this._finalizeTask(taskId);

        emitUpdate({
          taskId,
          type: 'status',
          data: result.status,
          timestamp: new Date(),
        });

        if (code === 0) {
          logger.info(`[ClaudeCliAdapter] Task ${taskId} resolving promise with success`);
          resolve(result);
        } else {
          logger.info(`[ClaudeCliAdapter] Task ${taskId} rejecting promise with code ${code}`);
          result.error = `Process exited with code ${code}`;
          reject(result);
        }
      });

      claudeProcess.on('error', (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[ClaudeCliAdapter] Process error for task ${taskId}: ${errorMessage}`);
        global.clearTimeout(hangTimeout);
        global.clearInterval(statusInterval);
        const result = this._createErrorResult(request, errorMessage);

        this._finalizeTask(taskId);
        emitUpdate({
          taskId,
          type: 'status',
          data: 'failed',
          timestamp: new Date(),
        });

        reject(result);
      });

      // Also listen for spawn event to confirm process started
      claudeProcess.on('spawn', () => {
        logger.info(`[ClaudeCliAdapter] Task ${taskId} process spawned successfully`);
      });

      // Listen for exit event separately from close
      claudeProcess.on('exit', (code, signal) => {
        logger.info(
          `[ClaudeCliAdapter] Task ${taskId} process exited with code: ${code}, signal: ${signal}`,
        );
      });
    });
  }

  stopTask(taskId: string): boolean {
    const process = this.runningTasks.get(taskId);
    if (process === undefined) {
      return false;
    }

    process.kill('SIGTERM');
    this.runningTasks.delete(taskId);
    this.taskStartTimes.delete(taskId);
    this.taskOutputs.delete(taskId);
    return true;
  }

  private _createPrompt(request: TaskExecutionRequest): string {
    const filesList =
      request.files.length > 0 ? `\nRelevant files: ${request.files.join(', ')}` : '';
    return `Task: ${request.title}\n\n${request.prompt}${filesList}\n\nPlease complete this task by modifying the necessary files.`;
  }

  private _appendOutput(taskId: string, output: string): void {
    const outputs = this.taskOutputs.get(taskId);
    if (outputs !== undefined) {
      outputs.push(output);
    }
  }

  private _createResultFromClose(
    request: TaskExecutionRequest,
    code: number | null,
  ): OrchestratorTaskResult {
    const { taskId, mode } = request;
    const endTime = new Date();
    const startTime = this.taskStartTimes.get(taskId);
    const duration = startTime !== undefined ? endTime.getTime() - startTime.getTime() : undefined;
    const output = this.taskOutputs.get(taskId)?.join('\n') ?? '';

    const modeSpecific = this._processModeSpecificResults(mode, output, code === 0);

    return {
      taskId,
      mode,
      status: code === 0 ? 'completed' : 'failed',
      output,
      ...(code !== null ? { exitCode: code } : {}),
      ...(startTime !== undefined && { startTime }),
      endTime,
      ...(duration !== undefined && { duration }),
      ...modeSpecific,
    };
  }

  private _createErrorResult(
    request: TaskExecutionRequest,
    errorMessage: string,
  ): OrchestratorTaskResult {
    const startTime = this.taskStartTimes.get(request.taskId);
    return {
      taskId: request.taskId,
      mode: request.mode,
      status: 'failed',
      error: errorMessage,
      output: `Process error: ${errorMessage}`,
      ...(startTime !== undefined && { startTime }),
      endTime: new Date(),
    };
  }

  private _finalizeTask(taskId: string): void {
    this.runningTasks.delete(taskId);
    this.taskStartTimes.delete(taskId);
    this.taskOutputs.delete(taskId);
  }

  private _buildClaudeArgs(mode: ExecutionMode, prompt: string): string[] {
    return match(mode)
      .with('plan', () => ['-p', '--permission-mode', 'plan', '--output-format', 'json', prompt])
      .with('dry-run', () => ['-p', '--permission-mode', 'plan', '--output-format', 'json', prompt])
      .with('execute', () => ['-p', '--permission-mode', 'bypassPermissions', prompt])
      .with('validate', () => [
        '-p',
        '--permission-mode',
        'plan',
        '--output-format',
        'json',
        prompt,
      ])
      .otherwise(() => {
        throw new Error(`Unsupported execution mode: ${String(mode)}`);
      });
  }

  private _processModeSpecificResults(
    mode: ExecutionMode,
    output: string,
    success: boolean,
  ): Partial<OrchestratorTaskResult> {
    return match(mode)
      .with('plan', () => this._parsePlanMode(output))
      .with('dry-run', () => this._parseDryRunMode(output))
      .with('validate', () => this._parseValidateMode(output, success))
      .with('execute', () => this._parseExecuteMode(output))
      .otherwise(() => ({}));
  }

  private _parsePlanMode(output: string): Partial<OrchestratorTaskResult> {
    try {
      if (output.trim() === '') {
        return {};
      }

      const planData = JSON.parse(output) as Record<string, unknown>;
      const filesChanged = planData.files_changed as string[] | undefined;
      return filesChanged !== undefined ? { filesChanged } : {};
    } catch {
      return {};
    }
  }

  private _parseDryRunMode(output: string): Partial<OrchestratorTaskResult> {
    const fileMatches = output.match(/would (?:create|modify|update): (.+)/gi);
    if (fileMatches === null) {
      return {};
    }

    const filesChanged = fileMatches.map((match) =>
      match.replace(/^would (?:create|modify|update): /i, '').trim(),
    );

    return { filesChanged };
  }

  private _parseValidateMode(output: string, success: boolean): Partial<OrchestratorTaskResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const errorMatches = output.match(/error: (.+)/gi);
    const warningMatches = output.match(/warning: (.+)/gi);

    if (errorMatches !== null) {
      errors.push(...errorMatches.map((match) => match.replace(/^error: /i, '').trim()));
    }

    if (warningMatches !== null) {
      warnings.push(...warningMatches.map((match) => match.replace(/^warning: /i, '').trim()));
    }

    return {
      validationResults: {
        canProceed: success && errors.length === 0,
        errors,
        warnings,
      },
    };
  }

  private _parseExecuteMode(output: string): Partial<OrchestratorTaskResult> {
    const executeMatches = output.match(/(?:created|modified|updated): (.+)/gi);
    if (executeMatches === null) {
      return {};
    }

    const filesChanged = executeMatches.map((match) =>
      match.replace(/^(?:created|modified|updated): /i, '').trim(),
    );

    return { filesChanged };
  }
}
