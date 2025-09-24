import chalk from 'chalk';
import { match } from 'ts-pattern';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type LoggerOptions = {
  format?: 'json' | 'text';
  level?: LogLevel;
  metadata?: Record<string, unknown>;
  silent?: boolean;
  timestamp?: boolean;
  verbose?: boolean;
};

export type LogEntry = {
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
};

class Logger {
  private _options: Required<LoggerOptions>;
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 999,
  };

  constructor(options: LoggerOptions = {}) {
    this._options = {
      level: this._getLogLevelFromEnv(options.level),
      format: this._getFormatFromEnv(options.format),
      verbose: options.verbose ?? this._getVerboseFromEnv(),
      silent: options.silent ?? this._getSilentFromEnv(),
      timestamp: options.timestamp ?? false,
      metadata: options.metadata ?? {},
    };

    // Silent mode overrides everything
    if (this._options.silent) {
      this._options.level = 'silent';
    } else if (this._options.verbose) {
      this._options.level = 'debug';
    }
  }

  private _getLogLevelFromEnv(defaultLevel?: LogLevel): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    return envLevel ?? defaultLevel ?? 'info';
  }

  private _getFormatFromEnv(defaultFormat?: 'json' | 'text'): 'json' | 'text' {
    const envFormat = process.env.LOG_FORMAT?.toLowerCase();
    if (envFormat === 'json' || envFormat === 'text') {
      return envFormat;
    }
    return defaultFormat ?? 'text';
  }

  private _getVerboseFromEnv(): boolean {
    return process.env.VERBOSE === 'true' || process.env.VERBOSE === '1';
  }

  private _getSilentFromEnv(): boolean {
    return process.env.SILENT === 'true' || process.env.SILENT === '1';
  }

  private _shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this._options.level];
  }

  private _formatMessage(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): string {
    if (this._options.format === 'json') {
      const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        metadata: { ...this._options.metadata, ...metadata },
      };
      return JSON.stringify(entry);
    }

    // Text format with colors
    const timestamp = this._options.timestamp ? `[${new Date().toISOString()}] ` : '';
    const levelPrefix = match(level)
      .with('debug', () => chalk.gray('[DEBUG]'))
      .with('info', () => chalk.blue('[INFO]'))
      .with('warn', () => chalk.yellow('[WARN]'))
      .with('error', () => chalk.red('[ERROR]'))
      .otherwise(() => '');

    const metadataString =
      metadata != null && Object.keys(metadata).length > 0
        ? chalk.gray(` ${JSON.stringify(metadata)}`)
        : '';

    return `${timestamp}${levelPrefix} ${message}${metadataString}`;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (this._shouldLog('debug')) {
      console.log(this._formatMessage('debug', message, metadata));
    }
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (this._shouldLog('info')) {
      console.log(this._formatMessage('info', message, metadata));
    }
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (this._shouldLog('warn')) {
      console.warn(this._formatMessage('warn', message, metadata));
    }
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    if (this._shouldLog('error')) {
      console.error(this._formatMessage('error', message, metadata));
    }
  }

  // Convenience method for raw output (e.g., for displaying results)
  raw(message: string): void {
    if (this._options.level !== 'silent') {
      console.log(message);
    }
  }

  // Update logger configuration at runtime
  configure(options: Partial<LoggerOptions>): void {
    this._options = {
      ...this._options,
      ...options,
    };

    // Reapply silent/verbose logic
    if (this._options.silent) {
      this._options.level = 'silent';
    } else if (this._options.verbose) {
      this._options.level = 'debug';
    }
  }

  // Create a child logger with additional metadata
  child(metadata: Record<string, unknown>): Logger {
    return new Logger({
      ...this._options,
      metadata: { ...this._options.metadata, ...metadata },
    });
  }

  // Get current configuration (useful for testing)
  getOptions(): Readonly<Required<LoggerOptions>> {
    return { ...this._options };
  }
}

// Create a singleton instance for the application
export const logger = new Logger();

// Export the class for testing and custom instances
export { Logger };
