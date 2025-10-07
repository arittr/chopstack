import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

import dayjs from 'dayjs';

import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

/**
 * Service to write logs to files in .chopstack/logs/
 */
export class FileLogWriter {
  private readonly streams: Map<string, WriteStream> = new Map();
  private readonly logDir: string;
  private _globalStream: WriteStream | null = null;
  private _isEnabled: boolean = false;
  private readonly jobId: string | undefined;

  constructor(baseDir: string = process.cwd(), enabled: boolean = false, jobId?: string) {
    this.logDir = join(baseDir, '.chopstack', 'logs');
    this._isEnabled = enabled;
    this.jobId = jobId;

    if (this._isEnabled) {
      this._ensureLogDirectory();
      this._initializeGlobalLog();
    }
  }

  /**
   * Enable or disable log writing
   */
  setEnabled(enabled: boolean): void {
    if (enabled && !this._isEnabled) {
      this._isEnabled = true;
      this._ensureLogDirectory();
      this._initializeGlobalLog();
    } else if (!enabled && this._isEnabled) {
      this._isEnabled = false;
      this.closeAllStreams();
    }
  }

  /**
   * Ensure the log directory exists
   */
  private _ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
      logger.debug(`📁 Created log directory: ${this.logDir}`);
    }
  }

  /**
   * Initialize the global log file for the entire run
   */
  private _initializeGlobalLog(): void {
    // Format: 2025-10-07T14-30-45-07-00 (system timezone with ISO offset)
    const timestamp = dayjs().format('YYYY-MM-DDTHH-mm-ssZZ').replace(':', '-');
    const jobIdPart = isNonNullish(this.jobId) ? `-${this.jobId}` : '';
    const globalLogPath = join(this.logDir, `chopstack-run-${timestamp}${jobIdPart}.log`);

    this._globalStream = createWriteStream(globalLogPath, { flags: 'a' });

    // Write header
    this._globalStream.write(
      `================================================================================\n`,
    );
    this._globalStream.write(`ChopStack Execution Log\n`);
    this._globalStream.write(`Started: ${new Date().toISOString()}\n`);
    this._globalStream.write(`Working Directory: ${process.cwd()}\n`);
    this._globalStream.write(
      `================================================================================\n\n`,
    );

    logger.info(`📝 Writing logs to: ${globalLogPath}`);
  }

  /**
   * Get or create a write stream for a specific task
   */
  private _getTaskStream(taskId: string): WriteStream {
    if (!this._isEnabled) {
      throw new Error('Log writing is not enabled');
    }

    if (!this.streams.has(taskId)) {
      const taskLogPath = join(this.logDir, `task-${taskId}.log`);
      const stream = createWriteStream(taskLogPath, { flags: 'a' });

      // Write header for task log
      stream.write(
        `================================================================================\n`,
      );
      stream.write(`Task: ${taskId}\n`);
      stream.write(`Started: ${new Date().toISOString()}\n`);
      stream.write(
        `================================================================================\n\n`,
      );

      this.streams.set(taskId, stream);
      logger.debug(`📝 Created task log: ${taskLogPath}`);
    }

    const stream = this.streams.get(taskId);
    if (stream === undefined) {
      throw new Error(`Stream not found for task ${taskId}`);
    }
    return stream;
  }

  /**
   * Write a log entry (goes to both global and task-specific logs if applicable)
   */
  write(message: string, taskId?: string): void {
    if (!this._isEnabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;

    // Write to global log
    if (this._globalStream !== null) {
      this._globalStream.write(logLine);
    }

    // Write to task-specific log if taskId provided
    if (taskId !== undefined && taskId.length > 0) {
      try {
        const taskStream = this._getTaskStream(taskId);
        taskStream.write(logLine);
      } catch (error) {
        logger.debug(`Failed to write to task log: ${String(error)}`);
      }
    }
  }

  /**
   * Write a raw message without timestamp (for preserving TUI output format)
   */
  writeRaw(message: string, taskId?: string): void {
    if (!this._isEnabled) {
      return;
    }

    // Write to global log
    if (this._globalStream !== null) {
      this._globalStream.write(message);
      if (!message.endsWith('\n')) {
        this._globalStream.write('\n');
      }
    }

    // Write to task-specific log if taskId provided
    if (taskId !== undefined && taskId.length > 0) {
      try {
        const taskStream = this._getTaskStream(taskId);
        taskStream.write(message);
        if (!message.endsWith('\n')) {
          taskStream.write('\n');
        }
      } catch (error) {
        logger.debug(`Failed to write to task log: ${String(error)}`);
      }
    }
  }

  /**
   * Write a section separator
   */
  writeSeparator(label?: string, taskId?: string): void {
    if (!this._isEnabled) {
      return;
    }

    const separator =
      label !== undefined && label.length > 0
        ? `\n${'='.repeat(80)}\n${label}\n${'='.repeat(80)}\n\n`
        : `\n${'='.repeat(80)}\n\n`;

    this.writeRaw(separator, taskId);
  }

  /**
   * Close a specific task stream
   */
  closeTaskStream(taskId: string): void {
    const stream = this.streams.get(taskId);
    if (stream !== undefined) {
      stream.write(
        `\n================================================================================\n`,
      );
      stream.write(`Task ${taskId} completed: ${new Date().toISOString()}\n`);
      stream.write(
        `================================================================================\n`,
      );
      stream.end();
      this.streams.delete(taskId);
      logger.debug(`📝 Closed task log: ${taskId}`);
    }
  }

  /**
   * Close all streams
   */
  closeAllStreams(): void {
    // Close task streams
    for (const [taskId, stream] of this.streams) {
      stream.end();
      logger.debug(`📝 Closed task log: ${taskId}`);
    }
    this.streams.clear();

    // Close global stream
    if (this._globalStream !== null) {
      this._globalStream.write(
        `\n================================================================================\n`,
      );
      this._globalStream.write(`Execution completed: ${new Date().toISOString()}\n`);
      this._globalStream.write(
        `================================================================================\n`,
      );
      this._globalStream.end();
      this._globalStream = null;
      logger.debug(`📝 Closed global log`);
    }
  }

  /**
   * Get the log directory path
   */
  getLogDirectory(): string {
    return this.logDir;
  }
}

// Global singleton instance
let globalFileLogWriter: FileLogWriter | null = null;

/**
 * Get or create the global file log writer instance
 */
export function getFileLogWriter(): FileLogWriter {
  globalFileLogWriter ??= new FileLogWriter();
  return globalFileLogWriter;
}

/**
 * Initialize the file log writer with settings
 */
export function initializeFileLogWriter(
  baseDir: string = process.cwd(),
  enabled: boolean = false,
  jobId?: string,
): FileLogWriter {
  globalFileLogWriter = new FileLogWriter(baseDir, enabled, jobId);
  return globalFileLogWriter;
}
