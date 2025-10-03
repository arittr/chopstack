/**
 * Types for Claude CLI stream-json output format
 * Based on Claude Code API streaming events
 */

export type ClaudeStreamEvent =
  | ThinkingEvent
  | ToolUseEvent
  | ToolResultEvent
  | ContentEvent
  | ErrorEvent
  | UnknownEvent;

export type ThinkingEvent = {
  content: string;
  timestamp?: string;
  type: 'thinking';
};

export type ToolUseEvent = {
  input: Record<string, unknown>;
  timestamp?: string;
  tool: string;
  toolUseId?: string;
  type: 'tool_use';
};

export type ToolResultEvent = {
  content: string;
  isError?: boolean;
  timestamp?: string;
  toolUseId: string;
  type: 'tool_result';
};

export type ContentEvent = {
  content: string;
  timestamp?: string;
  type: 'content';
};

export type ErrorEvent = {
  error: string;
  timestamp?: string;
  type: 'error';
};

export type UnknownEvent = {
  [key: string]: unknown;
  type: string;
};

/**
 * Statistics about Claude's execution
 */
export type ClaudeExecutionStats = {
  lastEventTime: Date | null;
  lastEventType: string | null;
  thinkingCount: number;
  toolsUsed: Set<string>;
  toolUseCount: number;
};
