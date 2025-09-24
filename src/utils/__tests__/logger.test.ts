import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '../logger';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear environment variables
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
    delete process.env.VERBOSE;
    delete process.env.SILENT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('log levels', () => {
    it('should log messages at info level by default', () => {
      const logger = new Logger();

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should respect debug level', () => {
      const logger = new Logger({ level: 'debug' });

      logger.debug('debug message');
      logger.info('info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug message'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
    });

    it('should respect error level', () => {
      const logger = new Logger({ level: 'error' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('error message'));
    });

    it('should respect silent mode', () => {
      const logger = new Logger({ silent: true });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should enable debug level in verbose mode', () => {
      const logger = new Logger({ verbose: true });

      logger.debug('debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });
  });

  describe('environment variables', () => {
    it('should read LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = new Logger();

      logger.info('info message');
      logger.warn('warn message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('should read LOG_FORMAT from environment', () => {
      process.env.LOG_FORMAT = 'json';
      const logger = new Logger();

      logger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^{.*"level":"info".*"message":"test message".*}$/),
      );
    });

    it('should read VERBOSE from environment', () => {
      process.env.VERBOSE = 'true';
      const logger = new Logger();

      logger.debug('debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });

    it('should read SILENT from environment', () => {
      process.env.SILENT = 'true';
      const logger = new Logger();

      logger.error('error message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('formatting', () => {
    it('should format text output with colors', () => {
      const logger = new Logger({ format: 'text' });

      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    });

    it('should format JSON output', () => {
      const logger = new Logger({ format: 'json' });

      logger.info('test message', { key: 'value' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(call);

      expect(parsed).toMatchObject({
        level: 'info',
        message: 'test message',
        metadata: { key: 'value' },
      });
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include metadata in text format', () => {
      const logger = new Logger({ format: 'text' });

      logger.info('test message', { userId: 123 });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('{"userId":123}'));
    });

    it('should include timestamp when enabled', () => {
      const logger = new Logger({ format: 'text', timestamp: true });

      logger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T.*] \[INFO]/),
      );
    });
  });

  describe('raw output', () => {
    it('should output raw messages', () => {
      const logger = new Logger();

      logger.raw('raw output');

      expect(consoleLogSpy).toHaveBeenCalledWith('raw output');
    });

    it('should respect silent mode for raw output', () => {
      const logger = new Logger({ silent: true });

      logger.raw('raw output');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should update configuration at runtime', () => {
      const logger = new Logger({ level: 'info' });

      logger.debug('debug 1');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.configure({ level: 'debug' });
      logger.debug('debug 2');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug 2'));
    });

    it('should apply silent override when configured', () => {
      const logger = new Logger({ level: 'debug' });

      logger.configure({ silent: true });
      logger.error('should not appear');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should apply verbose override when configured', () => {
      const logger = new Logger({ level: 'info' });

      logger.configure({ verbose: true });
      logger.debug('debug message');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional metadata', () => {
      const parent = new Logger({ format: 'json' });
      const child = parent.child({ requestId: 'abc123' });

      child.info('child message', { action: 'test' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const call = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(call);

      expect(parsed.metadata).toEqual({
        requestId: 'abc123',
        action: 'test',
      });
    });

    it('should inherit parent configuration', () => {
      const parent = new Logger({ level: 'error' });
      const child = parent.child({ context: 'child' });

      child.info('should not appear');
      child.error('should appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOptions', () => {
    it('should return current configuration', () => {
      const logger = new Logger({
        level: 'warn',
        format: 'json',
        verbose: false,
        silent: false,
      });

      const options = logger.getOptions();

      expect(options.level).toBe('warn');
      expect(options.format).toBe('json');
      expect(options.verbose).toBe(false);
      expect(options.silent).toBe(false);
    });
  });
});
