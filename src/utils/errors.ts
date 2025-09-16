/**
 * Custom error classes for better error handling and type safety
 */

export class DecomposerError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'DecomposerError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class AgentNotFoundError extends DecomposerError {
  constructor(agentType: string, cause?: Error) {
    super(`Agent '${agentType}' not found or not available`, cause);
    this.name = 'AgentNotFoundError';
  }
}

export class PlanParsingError extends DecomposerError {
  constructor(message: string, content?: string, cause?: Error) {
    const fullMessage =
      content !== undefined
        ? `${message}\nContent: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`
        : message;
    super(fullMessage, cause);
    this.name = 'PlanParsingError';
  }
}

export class PlanValidationError extends DecomposerError {
  constructor(message: string, cause?: Error) {
    super(`Plan validation failed: ${message}`, cause);
    this.name = 'PlanValidationError';
  }
}

/**
 * Normalize unknown error-like values to a human-readable message.
 */
export function toErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value !== null && typeof value === 'object' && 'error' in value) {
    const candidate = (value as { error?: unknown }).error;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  try {
    return String(value);
  } catch {
    return 'Unknown error';
  }
}
