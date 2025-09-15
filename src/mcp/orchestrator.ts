import { type ChildProcess, exec as execCallback, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { ExecutionMode } from '../types/execution';

const exec = promisify(execCallback);

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export type TaskResult = {
  duration?: number;
  endTime?: Date;
  error?: string;
  exitCode?: number;
  filesChanged?: string[];
  mode: ExecutionMode;
  output?: string;
  startTime?: Date;
  status: TaskStatus;
  taskId: string;
  validationResults?: {
    canProceed: boolean;
    errors: string[];
    warnings: string[];
  };
};

export type StreamingUpdate = {
  data: string;
  taskId: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'status';
};

export class TaskOrchestrator extends EventEmitter {
  private readonly runningTasks: Map<string, ChildProcess> = new Map();
  private readonly taskStatuses: Map<string, TaskStatus> = new Map();
  private readonly taskOutputs: Map<string, string[]> = new Map();
  private readonly taskStartTimes: Map<string, Date> = new Map();

  /**
   * Build Claude CLI arguments based on execution mode
   */
  private _buildClaudeArgs(mode: ExecutionMode, prompt: string): string[] {
    switch (mode) {
      case 'plan': {
        return ['-p', '--permission-mode', 'plan', '--output-format', 'json', prompt];
      }
      case 'dry-run': {
        return ['--dry-run', '--message', prompt];
      }
      case 'execute': {
        return ['--message', prompt];
      }
      case 'validate': {
        return ['--validate-only', '--message', prompt];
      }
      default: {
        throw new Error(`Unsupported execution mode: ${String(mode)}`);
      }
    }
  }

  /**
   * Process mode-specific results from Claude CLI output
   */
  private _processModeSpecificResults(
    mode: ExecutionMode,
    output: string,
    success: boolean,
  ): Partial<TaskResult> {
    const results: Partial<TaskResult> = {};

    switch (mode) {
      case 'plan': {
        // Plan mode returns JSON with execution plan details
        try {
          if (output.trim() !== '') {
            const planData = JSON.parse(output) as Record<string, unknown>;
            const filesChanged = planData.files_changed as string[] | undefined;
            if (filesChanged !== undefined) {
              results.filesChanged = filesChanged;
            }
          }
        } catch {
          // If JSON parsing fails, continue without file change info
        }
        break;
      }

      case 'dry-run': {
        // Dry-run mode shows what would be changed without actually doing it
        const fileMatches = output.match(/would (?:create|modify|update): (.+)/gi);
        if (fileMatches !== null) {
          results.filesChanged = fileMatches.map((match) =>
            match.replace(/^would (?:create|modify|update): /i, '').trim(),
          );
        }
        break;
      }

      case 'validate': {
        // Validate mode checks dependencies and readiness
        const errors: string[] = [];
        const warnings: string[] = [];

        // Parse validation output for errors and warnings
        const errorMatches = output.match(/error: (.+)/gi);
        const warningMatches = output.match(/warning: (.+)/gi);

        if (errorMatches !== null) {
          errors.push(...errorMatches.map((match) => match.replace(/^error: /i, '').trim()));
        }
        if (warningMatches !== null) {
          warnings.push(...warningMatches.map((match) => match.replace(/^warning: /i, '').trim()));
        }

        results.validationResults = {
          canProceed: success && errors.length === 0,
          errors,
          warnings,
        };
        break;
      }

      case 'execute': {
        // Execute mode - extract actual file changes from output
        const executeFileMatches = output.match(/(?:created|modified|updated): (.+)/gi);
        if (executeFileMatches !== null) {
          results.filesChanged = executeFileMatches.map((match) =>
            match.replace(/^(?:created|modified|updated): /i, '').trim(),
          );
        }
        break;
      }
    }

    return results;
  }

  async executeClaudeTask(
    taskId: string,
    title: string,
    prompt: string,
    files: string[],
    workdir?: string,
    mode: ExecutionMode = 'execute',
  ): Promise<TaskResult> {
    // Mark task as running
    this.taskStatuses.set(taskId, 'running');
    this.taskStartTimes.set(taskId, new Date());
    this.taskOutputs.set(taskId, []);

    // Emit status update
    this.emit('taskUpdate', {
      taskId,
      type: 'status',
      data: 'running',
      timestamp: new Date(),
    } as StreamingUpdate);

    // Construct the Claude Code command
    const filesList = files.length > 0 ? `\nRelevant files: ${files.join(', ')}` : '';
    const fullPrompt = `Task: ${title}\n\n${prompt}${filesList}\n\nPlease complete this task by modifying the necessary files.`;

    // Build Claude CLI arguments based on execution mode
    const args = this._buildClaudeArgs(mode, fullPrompt);

    // Use claude CLI (note: claude-code vs claude)
    const commandName = 'claude';
    const claudeProcess = spawn(commandName, args, {
      cwd: workdir ?? process.cwd(),
      env: { ...process.env },
      shell: true,
    });

    this.runningTasks.set(taskId, claudeProcess);

    // Stream stdout
    claudeProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      this.taskOutputs.get(taskId)?.push(output);

      this.emit('taskUpdate', {
        taskId,
        type: 'stdout',
        data: output,
        timestamp: new Date(),
      } as StreamingUpdate);
    });

    // Stream stderr
    claudeProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      this.taskOutputs.get(taskId)?.push(`[stderr] ${output}`);

      this.emit('taskUpdate', {
        taskId,
        type: 'stderr',
        data: output,
        timestamp: new Date(),
      } as StreamingUpdate);
    });

    // Wait for process to complete
    return new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        const endTime = new Date();
        const startTime = this.taskStartTimes.get(taskId);
        const duration =
          startTime !== undefined ? endTime.getTime() - startTime.getTime() : undefined;

        this.runningTasks.delete(taskId);
        const output = this.taskOutputs.get(taskId)?.join('\n') ?? '';

        // Process mode-specific results
        const modeSpecificResults = this._processModeSpecificResults(mode, output, code === 0);

        const result: TaskResult = {
          taskId,
          mode,
          status: code === 0 ? 'completed' : 'failed',
          output,
          ...(code !== null ? { exitCode: code } : {}),
          ...(startTime !== undefined && { startTime }),
          endTime,
          ...(duration !== undefined && { duration }),
          ...modeSpecificResults,
        };

        this.taskStatuses.set(taskId, result.status);

        // Emit final status
        this.emit('taskUpdate', {
          taskId,
          type: 'status',
          data: result.status,
          timestamp: new Date(),
        } as StreamingUpdate);

        if (code === 0) {
          resolve(result);
        } else {
          result.error = `Process exited with code ${code}`;
          reject(result);
        }
      });

      claudeProcess.on('error', (error) => {
        const endTime = new Date();
        const startTime = this.taskStartTimes.get(taskId);
        const duration =
          startTime !== undefined ? endTime.getTime() - startTime.getTime() : undefined;

        this.runningTasks.delete(taskId);
        this.taskStatuses.set(taskId, 'failed');

        const result: TaskResult = {
          taskId,
          mode,
          status: 'failed',
          error: error.message,
          ...(startTime !== undefined && { startTime }),
          endTime,
          ...(duration !== undefined && { duration }),
        };

        this.emit('taskUpdate', {
          taskId,
          type: 'status',
          data: 'failed',
          timestamp: new Date(),
        } as StreamingUpdate);

        reject(result);
      });
    });
  }

  async createWorktreeForTask(taskId: string, baseRef: string): Promise<string> {
    const worktreePath = path.join('.chopstack-shadows', taskId);

    // Ensure shadows directory exists
    await fs.mkdir('.chopstack-shadows', { recursive: true });

    // Create a branch name from task ID
    const branchName = `chopstack/${taskId}`;

    // Remove existing worktree if it exists
    try {
      await exec(`git worktree remove ${worktreePath} --force`);
    } catch {
      // Ignore errors if worktree doesn't exist
    }

    // Create new worktree
    await exec(`git worktree add -b ${branchName} ${worktreePath} ${baseRef}`);

    return worktreePath;
  }

  async executeParallelTasks(
    tasks: Array<{
      files: string[];
      id: string;
      prompt: string;
      title: string;
    }>,
    baseRef: string,
    mode: ExecutionMode = 'execute',
  ): Promise<TaskResult[]> {
    // Create worktrees for all tasks
    const worktreeSetup = await Promise.all(
      tasks.map(async (task) => {
        const worktreePath = await this.createWorktreeForTask(task.id, baseRef);
        return { task, worktreePath };
      }),
    );

    // Execute all tasks in parallel
    const executionPromises = worktreeSetup.map(async ({ task, worktreePath }) => {
      try {
        const result = await this.executeClaudeTask(
          task.id,
          task.title,
          task.prompt,
          task.files,
          worktreePath,
          mode,
        );
        return { ...result, worktreePath } as TaskResult & { worktreePath: string };
      } catch (error) {
        return { ...(error as TaskResult), worktreePath } as TaskResult & { worktreePath: string };
      }
    });

    // Wait for all tasks to complete
    const results = await Promise.allSettled(executionPromises);

    // Process and return results
    return results.map((result, index) => {
      const task = tasks[index];
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        taskId: task?.id ?? `task-${index}`,
        mode,
        status: 'failed' as TaskStatus,
        error: (result.reason as TaskResult | undefined)?.error ?? 'Unknown error',
      };
    });
  }

  async commitChangesInWorktree(worktreePath: string, commitMessage: string): Promise<void> {
    const originalCwd = process.cwd();

    try {
      process.chdir(worktreePath);
      await exec('git add -A');
      await exec(`git commit -m "${commitMessage}"`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async cleanupWorktree(taskId: string): Promise<void> {
    const worktreePath = path.join('.chopstack-shadows', taskId);

    try {
      await exec(`git worktree remove ${worktreePath} --force`);
    } catch (error) {
      console.error(`Failed to cleanup worktree for ${taskId}:`, error);
    }
  }

  stopTask(taskId: string): boolean {
    const process = this.runningTasks.get(taskId);

    if (process !== undefined) {
      process.kill('SIGTERM');
      this.runningTasks.delete(taskId);
      this.taskStatuses.set(taskId, 'stopped');

      this.emit('taskUpdate', {
        taskId,
        type: 'status',
        data: 'stopped',
        timestamp: new Date(),
      } as StreamingUpdate);

      return true;
    }

    return false;
  }

  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskStatuses.get(taskId);
  }

  getAllTaskStatuses(): Map<string, TaskStatus> {
    return new Map(this.taskStatuses);
  }

  getRunningTasks(): string[] {
    return [...this.runningTasks.keys()];
  }

  getTaskOutput(taskId: string): string | undefined {
    return this.taskOutputs.get(taskId)?.join('\n');
  }
}
