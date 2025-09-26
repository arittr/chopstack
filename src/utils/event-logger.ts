import type { EventEmitter } from 'node:events';

import { isNonNullish } from '@/validation/guards';

import { Logger } from './logger';

/**
 * Logger that emits events to an EventEmitter (for TUI integration)
 * while also optionally logging to console
 */
export class EventLogger extends Logger {
  private _emitter?: EventEmitter;
  private _suppressConsole = false;

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
    if (this._emitter === undefined) {
      return;
    }

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

    // Remove ANSI color codes for cleaner display in TUI
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

    // Map log levels to TUI log types
    const logType = level === 'error' ? 'error' : level === 'warn' ? 'stderr' : 'info';

    this._emitter.emit('log', {
      level: logType,
      message: cleanMessage.trim(),
      ...(taskId !== undefined && { taskId }),
      ...(metadata !== undefined && { metadata }),
    });
  }
}
