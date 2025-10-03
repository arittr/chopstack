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

import type { ClaudeExecutionStats, ClaudeStreamEvent } from './claude-stream-types';

/**
 * Task execution adapter that delegates to the Claude CLI
 */
export class ClaudeCliTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly runningTasks = new Map<string, ChildProcess>();
  private readonly taskOutputs = new Map<string, string[]>();
  private readonly taskStartTimes = new Map<string, Date>();
  private readonly taskStats = new Map<string, ClaudeExecutionStats>();
  private readonly verbose: boolean;

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
  }

  async executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult> {
    const { taskId, workdir, mode } = request;

    logger.info(`[ClaudeCliAdapter] Starting task ${taskId} in ${workdir ?? process.cwd()}`);

    this.taskOutputs.set(taskId, []);
    this.taskStartTimes.set(taskId, new Date());
    this._initializeStats(taskId);

    const actualWorkdir = workdir ?? process.cwd();
    const prompt = this._createPrompt(request, actualWorkdir);
    const args = this._buildClaudeArgs(mode, prompt);
    logger.info(`[ClaudeCliAdapter] Created prompt (first 200 chars): ${prompt.slice(0, 200)}`);
    logger.info(`[ClaudeCliAdapter] Spawning claude with args: ${JSON.stringify(args)}`);
    logger.info(`[ClaudeCliAdapter] Working directory: ${actualWorkdir}`);
    logger.info(
      `[ClaudeCliAdapter] 🔍 DEBUGGING: Is worktree: ${actualWorkdir.includes('.chopstack/shadows')}`,
    );
    logger.info(`[ClaudeCliAdapter] 🔍 DEBUGGING: Absolute workdir path: ${actualWorkdir}`);

    const claudeProcess = spawn('claude', args, {
      cwd: actualWorkdir,
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

    // Add periodic status updates with event-based monitoring
    const statusInterval = global.setInterval(() => {
      if (!this.runningTasks.has(taskId)) {
        return;
      }

      const stats = this.taskStats.get(taskId);
      if (stats === undefined) {
        return;
      }

      // Check if we've received events recently
      const timeSinceLastEvent =
        stats.lastEventTime !== null ? Date.now() - stats.lastEventTime.getTime() : null;

      if (timeSinceLastEvent !== null && timeSinceLastEvent > 120_000) {
        // No events for 2 minutes - task might be hanging
        logger.warn(
          `[ClaudeCliAdapter] Task ${taskId} hasn't sent events in ${Math.floor(timeSinceLastEvent / 1000)}s (last: ${stats.lastEventType})`,
        );
      } else {
        // Task is actively working
        const status = this._getTaskStatus(taskId);
        logger.info(`[ClaudeCliAdapter] Task ${taskId} status: ${status}`);
      }
    }, 30_000);

    this.runningTasks.set(taskId, claudeProcess);

    // Track if we've received any output
    let receivedOutput = false;

    claudeProcess.stdout.on('data', (data: Buffer) => {
      receivedOutput = true;

      // Parse stream-json events
      const events = this._parseStreamJson(data);

      for (const event of events) {
        this._handleStreamEvent(taskId, event);

        // Emit streaming updates
        emitUpdate({
          taskId,
          type: 'stdout',
          data: JSON.stringify(event),
          timestamp: new Date(),
        });
      }

      // Don't clear timeouts on every event - they'll be managed by periodic checks
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
        void (async () => {
          logger.info(
            `[ClaudeCliAdapter] Task ${taskId} process CLOSE event fired with code: ${code}`,
          );
          logger.info(`[ClaudeCliAdapter] Task ${taskId} received output: ${receivedOutput}`);

          // Post-commit analysis: Check for file modifications
          let modifiedFiles: string[] = [];
          const { workdir } = request;
          if (workdir !== undefined) {
            try {
              const { execa: execaImport } = await import('execa');
              const { stdout: lsOutput } = await execaImport('ls', ['-la', workdir], {
                reject: false,
              });
              logger.info(`  🔍 DEBUGGING: Post-execution ls of ${workdir}:\n${lsOutput}`);

              const { stdout: gitStatus } = await execaImport('git', ['status', '--short'], {
                cwd: workdir,
                reject: false,
              });
              logger.info(`  🔍 DEBUGGING: Post-execution git status in worktree:\n${gitStatus}`);

              // Parse git status to get modified files
              modifiedFiles = gitStatus
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map((line) => {
                  // Git status format: "XY filename"
                  // We want just the filename
                  const parts = line.trim().split(/\s+/);
                  return parts.length > 1 ? parts.slice(1).join(' ') : '';
                })
                .filter((file) => file.length > 0);

              // Post-commit analysis: Detect hallucination (no changes)
              if (code === 0 && modifiedFiles.length === 0) {
                logger.warn(
                  `⚠️ Task ${taskId} reported success but made NO changes (possible hallucination)`,
                );
                logger.warn(`  Task claimed to complete successfully but git status shows 0 files`);

                // DEBUGGING: Check if files were written to the main repo instead
                logger.warn(
                  `  🔍 DEBUGGING: Checking if files were written to main repo instead...`,
                );
                try {
                  // Get the main repo path (parent of .chopstack)
                  const mainRepoPath = workdir.replace(/\/\.chopstack\/.*$/, '');
                  const { stdout: mainGitStatus } = await execaImport(
                    'git',
                    ['status', '--short'],
                    {
                      cwd: mainRepoPath,
                      reject: false,
                    },
                  );
                  if (mainGitStatus.trim() !== '') {
                    logger.warn(
                      `  🔍 DEBUGGING: FOUND CHANGES IN MAIN REPO! (${mainRepoPath}):\n${mainGitStatus}`,
                    );
                    logger.warn(
                      `  🔍 This suggests Claude wrote files to the main repo instead of the worktree!`,
                    );
                  } else {
                    logger.warn(`  🔍 DEBUGGING: Main repo is clean, no leaked changes`);
                  }
                } catch (mainRepoError) {
                  logger.warn(`  ⚠️ Failed to check main repo: ${String(mainRepoError)}`);
                }

                // DEBUGGING: Check if Claude actually wrote any files anywhere
                logger.warn(`  🔍 DEBUGGING: Searching for recently modified TypeScript files...`);
                try {
                  const { stdout: findOutput } = await execaImport(
                    'find',
                    [
                      workdir,
                      '-name',
                      '*.ts',
                      '-o',
                      '-name',
                      '*.tsx',
                      '-o',
                      '-name',
                      '*.css',
                      '-mmin',
                      '-5',
                      '-type',
                      'f',
                    ],
                    { reject: false },
                  );
                  if (findOutput.trim() !== '') {
                    logger.warn(
                      `  🔍 DEBUGGING: Recently modified files in worktree:\n${findOutput}`,
                    );
                  } else {
                    logger.warn(
                      `  🔍 DEBUGGING: No recently modified source files found in worktree`,
                    );
                  }
                } catch (findError) {
                  logger.warn(`  ⚠️ Failed to search for modified files: ${String(findError)}`);
                }
              }
            } catch (error) {
              logger.warn(`  ⚠️ Failed to debug post-execution state: ${String(error)}`);
            }
          }

          global.clearTimeout(hangTimeout);
          global.clearInterval(statusInterval);

          const result = this._createResultFromClose(request, code);

          // Add modified files to result for downstream validation
          if (modifiedFiles.length > 0) {
            result.filesChanged = modifiedFiles;
          }

          logger.info(
            `[ClaudeCliAdapter] Task ${taskId} result status: ${result.status}, output length: ${result.output?.length ?? 0}, files changed: ${modifiedFiles.length}`,
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
        })();
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

  private _createPrompt(request: TaskExecutionRequest, workdir: string): string {
    const filesList =
      request.files.length > 0 ? `\nRelevant files: ${request.files.join(', ')}` : '';

    // Add working directory instruction for worktree execution
    const workdirInstruction =
      workdir !== process.cwd()
        ? `\n\nIMPORTANT: You are working in an isolated directory: ${workdir}\nAll file paths should be relative to this directory. Do NOT write files outside this directory.`
        : '';

    // Add forbidden files warning if provided
    let forbiddenFilesWarning = '';
    if (request.forbiddenFiles !== undefined && request.forbiddenFiles.length > 0) {
      const forbiddenList = request.forbiddenFiles
        .slice(0, 10) // Limit to first 10 to avoid bloating prompt
        .map((f) => `  - ${f}`)
        .join('\n');
      const moreCount =
        request.forbiddenFiles.length > 10
          ? ` (and ${request.forbiddenFiles.length - 10} more)`
          : '';

      forbiddenFilesWarning = `\n\nIMPORTANT: You MUST ONLY modify the files listed above in "Relevant files".

DO NOT modify any of these files (they belong to other tasks):\n${forbiddenList}${moreCount}

Your changes will be validated. Modifying files outside your scope will cause this task to fail.`;
    }

    return `Task: ${request.title}\n\n${request.prompt}${filesList}${workdirInstruction}${forbiddenFilesWarning}\n\nPlease complete this task by modifying the necessary files.`;
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
    this.taskStats.delete(taskId);
  }

  /**
   * Initialize statistics tracking for a task
   */
  private _initializeStats(taskId: string): void {
    this.taskStats.set(taskId, {
      thinkingCount: 0,
      toolUseCount: 0,
      lastEventType: null,
      lastEventTime: null,
      toolsUsed: new Set(),
    });
  }

  /**
   * Parse JSONL stream into individual events
   */
  private _parseStreamJson(chunk: Buffer): ClaudeStreamEvent[] {
    const events: ClaudeStreamEvent[] = [];
    const lines = chunk.toString().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as ClaudeStreamEvent;
        events.push(parsed);
      } catch {
        // Not valid JSON, might be plain text fallback
        logger.debug(`[ClaudeCliAdapter] Failed to parse stream event: ${trimmed}`);
      }
    }

    return events;
  }

  /**
   * Handle a stream event and update stats
   */
  private _handleStreamEvent(taskId: string, event: ClaudeStreamEvent): void {
    const stats = this.taskStats.get(taskId);
    if (stats === undefined) {
      return;
    }

    stats.lastEventType = event.type;
    stats.lastEventTime = new Date();

    // Track event-specific stats
    switch (event.type) {
      case 'thinking': {
        stats.thinkingCount++;
        if (this.verbose && 'content' in event && typeof event.content === 'string') {
          const { content } = event;
          logger.info(
            `[${taskId}] 💭 ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`,
          );
        }

        break;
      }
      case 'tool_use': {
        stats.toolUseCount++;
        if ('tool' in event && typeof event.tool === 'string') {
          stats.toolsUsed.add(event.tool);
          if (this.verbose && 'input' in event) {
            const inputPreview = JSON.stringify(event.input).slice(0, 100);
            logger.info(
              `[${taskId}] 🔧 ${event.tool}(${inputPreview}${inputPreview.length > 100 ? '...' : ''})`,
            );
          }
        }

        break;
      }
      case 'content': {
        // This is the final output
        if ('content' in event && typeof event.content === 'string') {
          this._appendOutput(taskId, event.content);
        }

        break;
      }
      case 'error': {
        if ('error' in event && typeof event.error === 'string') {
          logger.error(`[${taskId}] ❌ ${event.error}`);
        }

        break;
      }
      // No default
    }

    // Always log to debug level for tail -f
    logger.debug(`[${taskId}] Event: ${JSON.stringify(event)}`);
  }

  /**
   * Get human-readable status for a task
   */
  private _getTaskStatus(taskId: string): string {
    const stats = this.taskStats.get(taskId);
    if (stats?.lastEventType === null || stats === undefined) {
      return 'starting...';
    }

    const timeSince =
      stats.lastEventTime !== null
        ? `${Math.floor((Date.now() - stats.lastEventTime.getTime()) / 1000)}s ago`
        : 'unknown';

    return `${stats.lastEventType} (${timeSince})`;
  }

  private _buildClaudeArgs(mode: ExecutionMode, prompt: string): string[] {
    // Always use stream-json for better monitoring, regardless of mode
    return match(mode)
      .with('plan', () => [
        '-p',
        '--output-format',
        'stream-json',
        '--permission-mode',
        'plan',
        prompt,
      ])
      .with('dry-run', () => [
        '-p',
        '--output-format',
        'stream-json',
        '--permission-mode',
        'plan',
        prompt,
      ])
      .with('execute', () => [
        '-p',
        '--output-format',
        'stream-json',
        '--permission-mode',
        'bypassPermissions',
        prompt,
      ])
      .with('validate', () => [
        '-p',
        '--output-format',
        'stream-json',
        '--permission-mode',
        'plan',
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
