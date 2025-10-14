import type { TaskState, TaskStateTransition } from '@/core/execution/types';
import type { TaskV2 } from '@/types/schemas-v2';

import {
  createStateTransition,
  determineNextState,
  isTerminalState,
  isValidTransition,
} from './task-state-machine';

/**
 * Manages task state transitions and dependency resolution
 */
export class TaskTransitionManager {
  private readonly taskStates: Map<string, TaskState> = new Map();
  private readonly transitions: Map<string, TaskStateTransition[]> = new Map();
  private readonly dependencies: Map<string, Set<string>> = new Map();

  /**
   * Initialize the manager with tasks and their dependencies
   */
  initialize(tasks: TaskV2[]): void {
    // Reset state
    this.taskStates.clear();
    this.transitions.clear();
    this.dependencies.clear();

    // Initialize all tasks as pending
    for (const task of tasks) {
      this.taskStates.set(task.id, 'pending');
      this.transitions.set(task.id, []);
      this.dependencies.set(task.id, new Set(task.dependencies));
    }

    // Check for tasks with no dependencies and mark them as ready
    for (const task of tasks) {
      if (task.dependencies.length === 0) {
        this._performTransition(task.id, 'ready', 'No dependencies');
      }
    }
  }

  /**
   * Get the current state of a task
   */
  getTaskState(taskId: string): TaskState | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * Get all tasks in a specific state
   */
  getTasksInState(state: TaskState): string[] {
    const tasks: string[] = [];
    for (const [taskId, taskState] of this.taskStates) {
      if (taskState === state) {
        tasks.push(taskId);
      }
    }
    return tasks;
  }

  /**
   * Transition a task to a new state
   */
  transitionTask(taskId: string, newState: TaskState, reason?: string): boolean {
    const currentState = this.taskStates.get(taskId);
    if (currentState === undefined) {
      return false;
    }

    if (!isValidTransition(currentState, newState)) {
      return false;
    }

    return this._performTransition(taskId, newState, reason);
  }

  /**
   * Mark a task as started
   */
  startTask(taskId: string): boolean {
    const currentState = this.taskStates.get(taskId);

    if (currentState === 'ready') {
      return this.transitionTask(taskId, 'queued', 'Task started');
    } else if (currentState === 'queued') {
      return this.transitionTask(taskId, 'running', 'Task execution begun');
    }

    return false;
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskId: string): boolean {
    const success = this.transitionTask(taskId, 'completed', 'Task completed successfully');
    if (success) {
      this._updateDependentTasks(taskId);
    }
    return success;
  }

  /**
   * Mark a task as failed
   */
  failTask(taskId: string, error: string): boolean {
    const success = this.transitionTask(taskId, 'failed', `Task failed: ${error}`);
    if (success) {
      this._updateDependentTasks(taskId);
    }
    return success;
  }

  /**
   * Skip a task
   */
  skipTask(taskId: string, reason: string): boolean {
    const success = this.transitionTask(taskId, 'skipped', reason);
    if (success) {
      this._updateDependentTasks(taskId);
    }
    return success;
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): boolean {
    const currentState = this.taskStates.get(taskId);
    if (currentState === 'failed') {
      return this.transitionTask(taskId, 'queued', 'Task retry initiated');
    }
    return false;
  }

  /**
   * Get tasks that are ready to execute
   */
  getExecutableTasks(): string[] {
    return this.getTasksInState('ready');
  }

  /**
   * Check if all tasks are in terminal state
   */
  allTasksComplete(): boolean {
    for (const state of this.taskStates.values()) {
      if (!isTerminalState(state)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get transition history for a task
   */
  getTaskTransitions(taskId: string): TaskStateTransition[] {
    return this.transitions.get(taskId) ?? [];
  }

  /**
   * Get current execution statistics
   */
  getStatistics(): {
    blocked: number;
    completed: number;
    failed: number;
    pending: number;
    queued: number;
    ready: number;
    running: number;
    skipped: number;
    total: number;
  } {
    const stats = {
      pending: 0,
      ready: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      total: this.taskStates.size,
    };

    for (const state of this.taskStates.values()) {
      stats[state]++;
    }

    return stats;
  }

  /**
   * Internal method to perform state transition
   */
  private _performTransition(taskId: string, newState: TaskState, reason?: string): boolean {
    const currentState = this.taskStates.get(taskId);
    if (currentState === undefined) {
      return false;
    }

    // Update state
    this.taskStates.set(taskId, newState);

    // Record transition
    const transition = createStateTransition(currentState, newState, reason);
    const transitions = this.transitions.get(taskId) ?? [];
    transitions.push(transition);
    this.transitions.set(taskId, transitions);

    return true;
  }

  /**
   * Update dependent tasks when a dependency changes state
   */
  private _updateDependentTasks(completedTaskId: string): void {
    for (const [taskId, dependencies] of this.dependencies) {
      if (!dependencies.has(completedTaskId)) {
        continue;
      }

      const currentState = this.taskStates.get(taskId);
      if (currentState === undefined || isTerminalState(currentState)) {
        continue;
      }

      // Build dependency state map
      const depStates = new Map<string, TaskState>();
      for (const depId of dependencies) {
        const depState = this.taskStates.get(depId);
        if (depState !== undefined) {
          depStates.set(depId, depState);
        }
      }

      // Determine next state based on dependencies
      const nextState = determineNextState(currentState, depStates);
      if (nextState !== null) {
        this._performTransition(taskId, nextState, 'Dependency state change');
      }
    }
  }

  /**
   * Export current state for persistence or debugging
   */
  exportState(): {
    dependencies: Record<string, string[]>;
    states: Record<string, TaskState>;
    transitions: Record<string, TaskStateTransition[]>;
  } {
    const states: Record<string, TaskState> = {};
    const transitions: Record<string, TaskStateTransition[]> = {};
    const dependencies: Record<string, string[]> = {};

    for (const [taskId, state] of this.taskStates) {
      states[taskId] = state;
    }

    for (const [taskId, trans] of this.transitions) {
      transitions[taskId] = trans;
    }

    for (const [taskId, deps] of this.dependencies) {
      dependencies[taskId] = [...deps];
    }

    return { states, transitions, dependencies };
  }
}
