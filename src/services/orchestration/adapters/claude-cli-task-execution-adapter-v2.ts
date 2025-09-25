import { match } from 'ts-pattern';

import type { ExecutionMode } from '@/core/execution/types';
import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
} from '@/services/orchestration/types';

import { type AgentExecutionResult, AgentRunner } from '@/services/orchestration/agent-runner';
import {
  CommandBuildError,
  OutputParsingError,
  TaskExecutionError,
} from '@/services/orchestration/errors';
import { isNonNullish } from '@/validation/guards';

/**
 * Task execution adapter that delegates to the Claude CLI with improved error handling
 */
export class ClaudeCliTaskExecutionAdapterV2 implements TaskExecutionAdapter {
  private readonly runner = new AgentRunner();

  async executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult> {
    const { taskId, workdir, mode } = request;

    // Emit starting status
    this._emitUpdate(emitUpdate, taskId, 'status', 'running');

    try {
      // Build command arguments
      const args = this._buildClaudeArgs(mode, this._createPrompt(request));

      // Execute the command
      const executionResult = await this.runner.execute({
        taskId,
        command: 'claude',
        args,
        ...(isNonNullish(workdir) && { workdir }),
        onStdout: (data) => {
          this._emitUpdate(emitUpdate, taskId, 'stdout', data);
        },
        onStderr: (data) => {
          this._emitUpdate(emitUpdate, taskId, 'stderr', data);
        },
      });

      // Process the result based on exit code and mode
      const taskResult = this._processResult(request, executionResult);

      // Emit final status
      this._emitUpdate(emitUpdate, taskId, 'status', taskResult.status);

      // If failed, throw proper error
      if (taskResult.status === 'failed') {
        throw new TaskExecutionError(
          taskResult.error ?? `Task ${taskId} failed with exit code ${executionResult.exitCode}`,
          taskId,
          taskResult,
          executionResult.exitCode ?? undefined,
          { stderr: executionResult.stderr },
        );
      }

      return taskResult;
    } catch (error) {
      // If it's already one of our errors, re-throw
      if (error instanceof TaskExecutionError) {
        throw error;
      }

      // Wrap other errors
      const message = error instanceof Error ? error.message : String(error);
      this._emitUpdate(emitUpdate, taskId, 'status', 'failed');

      throw new TaskExecutionError(`Task execution failed: ${message}`, taskId, {
        taskId,
        mode,
        status: 'failed',
        error: message,
        output: '',
        endTime: new Date(),
      });
    }
  }

  stopTask(taskId: string): boolean {
    return this.runner.stop(taskId);
  }

  getAllTaskStatuses(): Map<string, 'running' | 'stopped' | 'completed' | 'failed'> {
    const statuses = new Map<string, 'running' | 'stopped' | 'completed' | 'failed'>();
    for (const taskId of this.runner.getRunningTasks()) {
      statuses.set(taskId, 'running');
    }
    return statuses;
  }

  private _emitUpdate(
    emitUpdate: (update: StreamingUpdate) => void,
    taskId: string,
    type: 'stdout' | 'stderr' | 'status',
    data: string,
  ): void {
    emitUpdate({
      taskId,
      type,
      data,
      timestamp: new Date(),
    });
  }

  private _createPrompt(request: TaskExecutionRequest): string {
    const filesList =
      request.files.length > 0 ? `\nRelevant files: ${request.files.join(', ')}` : '';
    return `Task: ${request.title}\n\n${request.prompt}${filesList}\n\nPlease complete this task by modifying the necessary files.`;
  }

  private _buildClaudeArgs(mode: ExecutionMode, prompt: string): string[] {
    try {
      return match(mode)
        .with('plan', () => ['-p', '--permission-mode', 'plan', '--output-format', 'json', prompt])
        .with('dry-run', () => [
          '-p',
          '--permission-mode',
          'plan',
          '--output-format',
          'json',
          prompt,
        ])
        .with('execute', () => ['-p', prompt])
        .with('validate', () => [
          '-p',
          '--permission-mode',
          'plan',
          '--output-format',
          'json',
          prompt,
        ])
        .exhaustive();
    } catch (error) {
      throw new CommandBuildError(`Failed to build command for mode: ${mode}`, 'unknown', mode, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private _processResult(
    request: TaskExecutionRequest,
    result: AgentExecutionResult,
  ): OrchestratorTaskResult {
    const { taskId, mode } = request;
    const success = result.exitCode === 0;

    // Parse mode-specific results
    const modeSpecific = this._parseModeSpecificResults(mode, result.output, success);

    return {
      taskId,
      mode,
      status: success ? 'completed' : 'failed',
      output: result.output,
      ...(isNonNullish(result.exitCode) && { exitCode: result.exitCode }),
      startTime: result.startTime,
      endTime: result.endTime,
      duration: result.duration,
      ...(!success && { error: `Process exited with code ${result.exitCode}` }),
      ...modeSpecific,
    };
  }

  private _parseModeSpecificResults(
    mode: ExecutionMode,
    output: string,
    success: boolean,
  ): Partial<OrchestratorTaskResult> {
    try {
      return match(mode)
        .with('plan', () => this._parsePlanMode(output))
        .with('dry-run', () => this._parseDryRunMode(output))
        .with('validate', () => this._parseValidateMode(output, success))
        .with('execute', () => this._parseExecuteMode(output))
        .exhaustive();
    } catch (error) {
      // Log parsing errors but don't fail the task for them
      if (error instanceof OutputParsingError) {
        // Could log this if we had a logger
        return {};
      }
      throw error;
    }
  }

  private _parsePlanMode(output: string): Partial<OrchestratorTaskResult> {
    if (output.trim() === '') {
      return {};
    }

    try {
      const planData = JSON.parse(output) as Record<string, unknown>;
      const filesChanged = planData.files_changed as string[] | undefined;
      return filesChanged !== undefined ? { filesChanged } : {};
    } catch (error) {
      throw new OutputParsingError(
        'Failed to parse plan mode JSON output',
        'unknown',
        output,
        error instanceof Error ? error : undefined,
      );
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
