import { describe, expect, it } from 'bun:test';

import {
  AgentNotFoundError,
  DecomposerError,
  PlanParsingError,
  PlanValidationError,
  toErrorMessage,
} from '../errors';

describe('Custom Error Classes', () => {
  describe('DecomposerError', () => {
    it('should create error with message', () => {
      const error = new DecomposerError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DecomposerError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('DecomposerError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with message and cause', () => {
      const cause = new Error('Original error');
      const error = new DecomposerError('Test error', cause);

      expect(error.message).toBe('Test error');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('DecomposerError');
    });

    it('should not set cause when undefined is passed', () => {
      const error = new DecomposerError('Test error', undefined);

      expect(error.cause).toBeUndefined();
    });
  });

  describe('AgentNotFoundError', () => {
    it('should create error with agent type', () => {
      const error = new AgentNotFoundError('claude');

      expect(error).toBeInstanceOf(DecomposerError);
      expect(error).toBeInstanceOf(AgentNotFoundError);
      expect(error.message).toBe("Agent 'claude' not found or not available");
      expect(error.name).toBe('AgentNotFoundError');
    });

    it('should create error with agent type and cause', () => {
      const cause = new Error('Network error');
      const error = new AgentNotFoundError('codex', cause);

      expect(error.message).toBe("Agent 'codex' not found or not available");
      expect(error.cause).toBe(cause);
    });
  });

  describe('PlanParsingError', () => {
    it('should create error with message only', () => {
      const error = new PlanParsingError('Invalid JSON');

      expect(error).toBeInstanceOf(DecomposerError);
      expect(error).toBeInstanceOf(PlanParsingError);
      expect(error.message).toBe('Invalid JSON');
      expect(error.name).toBe('PlanParsingError');
    });

    it('should create error with message and short content', () => {
      const content = '{"invalid": json}';
      const error = new PlanParsingError('Parse failed', content);

      expect(error.message).toBe('Parse failed\nContent: {"invalid": json}');
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(250); // More than 200 chars
      const error = new PlanParsingError('Parse failed', longContent);

      expect(error.message).toBe(`Parse failed\nContent: ${'x'.repeat(200)}...`);
      expect(error.message.length).toBeLessThan(longContent.length + 50);
    });

    it('should create error with message, content, and cause', () => {
      const cause = new SyntaxError('Unexpected token');
      const error = new PlanParsingError('Parse failed', '{"bad"}', cause);

      expect(error.message).toBe('Parse failed\nContent: {"bad"}');
      expect(error.cause).toBe(cause);
    });

    it('should handle undefined content gracefully', () => {
      const error = new PlanParsingError('Parse failed', undefined);

      expect(error.message).toBe('Parse failed');
    });
  });

  describe('PlanValidationError', () => {
    it('should create error with validation message', () => {
      const error = new PlanValidationError('Missing required field: tasks');

      expect(error).toBeInstanceOf(DecomposerError);
      expect(error).toBeInstanceOf(PlanValidationError);
      expect(error.message).toBe('Plan validation failed: Missing required field: tasks');
      expect(error.name).toBe('PlanValidationError');
    });

    it('should create error with validation message and cause', () => {
      const cause = new Error('Schema error');
      const error = new PlanValidationError('Invalid schema', cause);

      expect(error.message).toBe('Plan validation failed: Invalid schema');
      expect(error.cause).toBe(cause);
    });
  });
});

describe('toErrorMessage utility', () => {
  it('should return string as-is', () => {
    expect(toErrorMessage('Simple error message')).toBe('Simple error message');
    expect(toErrorMessage('')).toBe('');
  });

  it('should extract message from Error objects', () => {
    const error = new Error('Something went wrong');
    expect(toErrorMessage(error)).toBe('Something went wrong');
  });

  it('should extract message from custom Error subclasses', () => {
    const error = new DecomposerError('Custom error');
    expect(toErrorMessage(error)).toBe('Custom error');
  });

  it('should extract error property from objects', () => {
    const errorObj = { error: 'API request failed' };
    expect(toErrorMessage(errorObj)).toBe('API request failed');
  });

  it('should ignore non-string error properties', () => {
    const errorObj = { error: 123 };
    expect(toErrorMessage(errorObj)).toBe('[object Object]');
  });

  it('should handle nested error objects', () => {
    const errorObj = { error: 'Nested error message' };
    expect(toErrorMessage(errorObj)).toBe('Nested error message');
  });

  it('should convert numbers to string', () => {
    expect(toErrorMessage(404)).toBe('404');
    expect(toErrorMessage(0)).toBe('0');
  });

  it('should convert booleans to string', () => {
    expect(toErrorMessage(true)).toBe('true');
    expect(toErrorMessage(false)).toBe('false');
  });

  it('should handle null and undefined', () => {
    expect(toErrorMessage(null)).toBe('null');
    expect(toErrorMessage(undefined)).toBe('undefined');
  });

  it('should handle objects without error property', () => {
    const obj = { message: 'Not an error', code: 500 };
    expect(toErrorMessage(obj)).toBe('[object Object]');
  });

  it('should handle arrays', () => {
    expect(toErrorMessage(['error', 'array'])).toBe('error,array');
  });

  it('should handle objects that throw when stringified', () => {
    const problematicObj = {
      toString() {
        throw new Error('Cannot stringify');
      },
    };

    expect(toErrorMessage(problematicObj)).toBe('Unknown error');
  });

  it('should handle circular references safely', () => {
    const circular: any = {};
    circular.self = circular;

    // This should not throw, but might return different values depending on JS engine
    const result = toErrorMessage(circular);
    expect(typeof result).toBe('string');
  });
});
