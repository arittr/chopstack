import { type ChildProcess, spawn } from 'node:child_process';

import { ProcessSpawnError } from './errors';

/**
 * Result from agent execution
 */
export type AgentExecutionResult = {
  duration: number;
  endTime: Date;
  exitCode: number | null;
  output: string;
  startTime: Date;
  stderr: string;
};

/**
 * Options for agent execution
 */
export type AgentExecutionOptions = {
  args: string[];
  command: string;
  env?: Record<string, string | undefined>;
  onStderr?: (data: string) => void;
  onStdout?: (data: string) => void;
  taskId: string;
  workdir?: string;
};

/**
 * Helper class to execute agent commands with proper error handling
 */
export class AgentRunner {
  private readonly activeProcesses = new Map<string, ChildProcess>();

  /**
   * Execute an agent command and return structured result
   */
  async execute(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const { taskId, command, args, workdir, env, onStdout, onStderr } = options;
    const startTime = new Date();
    const outputChunks: string[] = [];
    const stderrChunks: string[] = [];

    try {
      const childProcess = spawn(command, args, {
        cwd: workdir ?? process.cwd(),
        env: { ...process.env, ...env },
        shell: false,
      });

      this.activeProcesses.set(taskId, childProcess);

      // Capture stdout
      childProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        outputChunks.push(chunk);
        onStdout?.(chunk);
      });

      // Capture stderr
      childProcess.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrChunks.push(chunk);
        onStderr?.(chunk);
      });

      // Wait for process to complete
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        childProcess.on('close', (code) => {
          resolve(code);
        });

        childProcess.on('error', (error) => {
          reject(
            new ProcessSpawnError(
              `Failed to spawn process: ${error.message}`,
              taskId,
              command,
              args,
              error,
              { workdir, env },
            ),
          );
        });
      });

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        exitCode,
        output: outputChunks.join(''),
        stderr: stderrChunks.join(''),
        startTime,
        endTime,
        duration,
      };
    } finally {
      this.activeProcesses.delete(taskId);
    }
  }

  /**
   * Stop a running task
   */
  stop(taskId: string): boolean {
    const process = this.activeProcesses.get(taskId);
    if (process === undefined) {
      return false;
    }

    process.kill('SIGTERM');
    this.activeProcesses.delete(taskId);
    return true;
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    return this.activeProcesses.has(taskId);
  }

  /**
   * Get all running task IDs
   */
  getRunningTasks(): string[] {
    return [...this.activeProcesses.keys()];
  }
}
