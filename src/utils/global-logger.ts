/**
 * Global logger service that can be swapped for TUI mode
 * This module provides the singleton logger used throughout the application
 */

import type { EventEmitter } from 'node:events';

import type { FileLogWriter } from '@/services/logging/file-log-writer';

import { EventLogger } from './event-logger';
import { Logger } from './logger';

class GlobalLogger {
  private static _instance: Logger = new Logger();
  private static readonly defaultLogger: Logger = new Logger();
  private static _fileLogWriter: FileLogWriter | null = null;

  /**
   * Get the current global logger instance
   */
  static get(): Logger {
    return GlobalLogger._instance;
  }

  /**
   * Enable TUI mode with event emission and optional file logging
   */
  static enableTuiMode(emitter: EventEmitter, fileLogWriter?: FileLogWriter): void {
    const eventLogger = new EventLogger();
    eventLogger.setEmitter(emitter);
    eventLogger.setSuppressConsole(true);
    // Copy current configuration
    eventLogger.configure(GlobalLogger._instance.getOptions());

    // Store file log writer if provided
    if (fileLogWriter !== undefined) {
      GlobalLogger._fileLogWriter = fileLogWriter;
      eventLogger.setFileLogWriter(fileLogWriter);
    }

    GlobalLogger._instance = eventLogger;
  }

  /**
   * Disable TUI mode and restore default logger
   */
  static disableTuiMode(): void {
    GlobalLogger._instance = GlobalLogger.defaultLogger;
    GlobalLogger._fileLogWriter = null;
  }

  /**
   * Enable file logging without TUI mode
   */
  static enableFileLogging(fileLogWriter: FileLogWriter): void {
    // Create an event logger but keep console output enabled
    const eventLogger = new EventLogger();
    eventLogger.setSuppressConsole(false);
    eventLogger.setFileLogWriter(fileLogWriter);
    eventLogger.configure(GlobalLogger._instance.getOptions());

    GlobalLogger._fileLogWriter = fileLogWriter;
    GlobalLogger._instance = eventLogger;
  }

  /**
   * Disable file logging and restore default logger
   */
  static disableFileLogging(): void {
    GlobalLogger._instance = GlobalLogger.defaultLogger;
    GlobalLogger._fileLogWriter = null;
  }

  /**
   * Configure the logger
   */
  static configure(options: Parameters<Logger['configure']>[0]): void {
    GlobalLogger._instance.configure(options);
  }
}

// Create a proxy that always delegates to the current logger
const loggerProxy = new Proxy({} as Logger, {
  get(_target, property) {
    const logger = GlobalLogger.get();
    const value = logger[property as keyof Logger];
    if (typeof value === 'function') {
      return value.bind(logger);
    }
    return value;
  },
});

// Export the proxy as the global logger
export const logger = loggerProxy;

// Export the GlobalLogger class for TUI mode management
export { GlobalLogger };
