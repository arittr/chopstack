import type { EventEmitter } from 'node:events';

import type { FileLogWriter } from '@/services/logging/file-log-writer';

import { isNonNullish } from '@/validation/guards';

import { Logger } from './logger';

/**
 * Logger that emits events to an EventEmitter (for TUI integration)
 * while also optionally logging to console and file
 */
export class EventLogger extends Logger {
  private _emitter?: EventEmitter;
  private _suppressConsole = false;
  private _fileLogWriter?: FileLogWriter;

  /**
   * Set the event emitter for log events
   */
  setEmitter(emitter: EventEmitter): void {
    this._emitter = emitter;
  }

  /**
   * Set whether to suppress console output
   */
  setSuppressConsole(suppress: boolean): void {
    this._suppressConsole = suppress;
  }

  /**
   * Set the file log writer for file output
   */
  setFileLogWriter(writer: FileLogWriter): void {
    this._fileLogWriter = writer;
  }

  override debug(message: string, metadata?: Record<string, unknown>): void {
    this._emitLogEvent('debug', message, metadata);
    if (!this._suppressConsole) {
      super.debug(message, metadata);
    }
  }

  override info(message: string, metadata?: Record<string, unknown>): void {
    this._emitLogEvent('info', message, metadata);
    if (!this._suppressConsole) {
      super.info(message, metadata);
    }
  }

  override warn(message: string, metadata?: Record<string, unknown>): void {
    this._emitLogEvent('warn', message, metadata);
    if (!this._suppressConsole) {
      super.warn(message, metadata);
    }
  }

  override error(message: string, metadata?: Record<string, unknown>): void {
    this._emitLogEvent('error', message, metadata);
    if (!this._suppressConsole) {
      super.error(message, metadata);
    }
  }

  override raw(message: string): void {
    this._emitLogEvent('info', message);
    if (!this._suppressConsole) {
      super.raw(message);
    }
  }

  private _emitLogEvent(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    // Parse message for task ID
    let cleanMessage = message;
    let taskId: string | undefined;

    // Check for task ID patterns
    const patterns = [/task ([\da-z-]+):/i, /\[([\da-z-]+)]/, /for task ([\da-z-]+)/i];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (isNonNullish(match?.[1])) {
        taskId = match[1];
        break;
      }
    }

    // Remove ANSI color codes for cleaner display in TUI and logs
    cleanMessage = cleanMessage.replaceAll(
      // eslint-disable-next-line no-control-regex
      /\u001B\[[\d;]*m/g,
      '',
    );

    // Remove log level prefixes that are already in the message
    cleanMessage = cleanMessage
      .replace(/^\[ERROR]\s*/, '')
      .replace(/^\[WARN]\s*/, '')
      .replace(/^\[INFO]\s*/, '')
      .replace(/^\[DEBUG]\s*/, '');

    // Write to file log if writer is available
    if (this._fileLogWriter !== undefined) {
      const logMessage = `[${level.toUpperCase()}] ${cleanMessage.trim()}`;
      this._fileLogWriter.write(logMessage, taskId);
    }

    // Emit to TUI if emitter is available
    if (this._emitter !== undefined) {
      // Map log levels to TUI log types (for display styling)
      const logType = level === 'error' ? 'error' : level === 'warn' ? 'stderr' : 'info';

      this._emitter.emit('log', {
        level: logType,
        message: cleanMessage.trim(),
        originalLevel: level, // Preserve original level for filtering
        ...(taskId !== undefined && { taskId }),
        ...(metadata !== undefined && { metadata }),
      });
    }
  }
}
