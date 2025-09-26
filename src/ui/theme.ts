/**
 * Consistent color scheme for the TUI
 * Using standard ANSI colors for maximum compatibility
 */
export const theme = {
  // Status colors
  success: 'green' as const,
  error: 'red' as const,
  warning: 'yellow' as const,
  info: 'cyan' as const,
  pending: 'gray' as const,

  // UI element colors
  primary: 'cyan' as const,
  secondary: 'blue' as const,
  border: 'dim' as const,
  borderActive: 'cyan' as const,

  // Text colors
  text: undefined, // Default white
  textDim: 'dim' as const,
  textHighlight: 'cyan' as const,

  // Task status colors
  taskRunning: 'yellow' as const,
  taskSuccess: 'green' as const,
  taskFailure: 'red' as const,
  taskSkipped: 'gray' as const,
  taskPending: 'dim' as const,

  // Log type colors
  logStdout: undefined, // Default white
  logStderr: 'red' as const,
  logError: 'red' as const,
  logSuccess: 'green' as const,
  logInfo: 'cyan' as const,
  logStatus: 'cyan' as const,
} as const;

export type Theme = typeof theme;
