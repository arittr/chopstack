import { type ChildProcess, spawn } from 'node:child_process';

import { match } from 'ts-pattern';

import type { ExecutionMode } from '@/core/execution/types';
import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
} from '@/services/orchestration/types';

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

    this.taskOutputs.set(taskId, []);
    this.taskStartTimes.set(taskId, new Date());

    const prompt = this._createPrompt(request);
    const args = this._buildClaudeArgs(mode, prompt);

    const claudeProcess = spawn('claude', args, {
      cwd: workdir ?? process.cwd(),
      env: { ...process.env },
      shell: false,
    });

    this.runningTasks.set(taskId, claudeProcess);

    claudeProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
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
      this._appendOutput(taskId, `[stderr] ${output}`);
      emitUpdate({
        taskId,
        type: 'stderr',
        data: output,
        timestamp: new Date(),
      });
    });

    return new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        const result = this._createResultFromClose(request, code);
        this._finalizeTask(taskId);

        emitUpdate({
          taskId,
          type: 'status',
          data: result.status,
          timestamp: new Date(),
        });

        if (code === 0) {
          resolve(result);
        } else {
          result.error = `Process exited with code ${code}`;
          reject(result);
        }
      });

      claudeProcess.on('error', (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
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
      .with('execute', () => ['-p', prompt])
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
