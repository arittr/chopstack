import type { TaskState, TaskStateTransition } from '@/core/execution/types';

/**
 * Core domain logic for task state transitions
 */
export type StateTransitionRule = {
  condition?: (context: StateTransitionContext) => boolean;
  from: TaskState;
  to: TaskState;
};

/**
 * Context for evaluating state transitions
 */
export type StateTransitionContext = {
  currentState: TaskState;
  dependencies?: Map<string, TaskState>;
  maxRetries?: number;
  retryCount?: number;
};

/**
 * Valid state transitions for task execution
 */
export const VALID_STATE_TRANSITIONS: StateTransitionRule[] = [
  { from: 'pending', to: 'ready' },
  { from: 'pending', to: 'blocked' },
  { from: 'pending', to: 'skipped' },
  { from: 'ready', to: 'queued' },
  { from: 'queued', to: 'running' },
  { from: 'running', to: 'completed' },
  { from: 'running', to: 'failed' },
  { from: 'failed', to: 'queued' }, // Retry
  { from: 'blocked', to: 'ready' },
  { from: 'blocked', to: 'skipped' },
  { from: 'ready', to: 'skipped' },
  { from: 'queued', to: 'skipped' },
];

/**
 * Terminal states that indicate task completion
 */
export const TERMINAL_STATES: TaskState[] = ['completed', 'failed', 'skipped'];

/**
 * States from which a task can be executed
 */
export const EXECUTABLE_STATES: TaskState[] = ['ready', 'queued'];

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_STATE_TRANSITIONS.some((rule) => rule.from === from && rule.to === to);
}

/**
 * Check if a state is terminal (no further transitions possible)
 */
export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Check if a state allows task execution
 */
export function isExecutableState(state: TaskState): boolean {
  return EXECUTABLE_STATES.includes(state);
}

/**
 * Determine the next state based on dependencies
 */
export function determineNextState(
  currentState: TaskState,
  dependencies: Map<string, TaskState>,
): TaskState | null {
  // Check if any dependency failed or was skipped
  const hasFailedDependency = [...dependencies.values()].some(
    (state) => state === 'failed' || state === 'skipped',
  );

  if (hasFailedDependency) {
    return isValidTransition(currentState, 'skipped') ? 'skipped' : null;
  }

  // Check if all dependencies are completed
  const allDependenciesCompleted = [...dependencies.values()].every(
    (state) => state === 'completed',
  );

  if (allDependenciesCompleted && (currentState === 'pending' || currentState === 'blocked')) {
    return 'ready';
  }

  // Check if any dependency is still running
  const hasRunningDependency = [...dependencies.values()].some(
    (state) => state === 'running' || state === 'queued',
  );

  if (hasRunningDependency && currentState === 'pending') {
    return 'blocked';
  }

  return null;
}

/**
 * Create a state transition record
 */
export function createStateTransition(
  from: TaskState,
  to: TaskState,
  reason?: string,
): TaskStateTransition {
  return {
    from,
    to,
    timestamp: new Date(),
    reason,
  };
}

/**
 * Calculate task execution statistics
 */
export function calculateTaskStats(taskStates: TaskState[]): Record<TaskState, number> {
  const stats: Record<TaskState, number> = {
    pending: 0,
    ready: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  };

  for (const state of taskStates) {
    stats[state]++;
  }

  return stats;
}

/**
 * Calculate execution progress
 */
export function calculateProgress(taskStates: TaskState[]): {
  completed: number;
  percentage: number;
  total: number;
} {
  const total = taskStates.length;
  const completed = taskStates.filter((state) => isTerminalState(state)).length;

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
