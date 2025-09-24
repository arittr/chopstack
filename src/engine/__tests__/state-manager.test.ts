import { beforeEach, describe, expect, it } from 'vitest';

import type { ExecutionTask, TaskState } from '@/types/execution';

import { StateManager } from '@/engine/state-manager';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('isValidTransition', () => {
    it('should allow valid state transitions', () => {
      // Valid transitions
      expect(stateManager.isValidTransition('pending', 'ready')).toBe(true);
      expect(stateManager.isValidTransition('pending', 'blocked')).toBe(true);
      expect(stateManager.isValidTransition('ready', 'queued')).toBe(true);
      expect(stateManager.isValidTransition('queued', 'running')).toBe(true);
      expect(stateManager.isValidTransition('running', 'completed')).toBe(true);
      expect(stateManager.isValidTransition('running', 'failed')).toBe(true);
      expect(stateManager.isValidTransition('failed', 'queued')).toBe(true); // Retry
      expect(stateManager.isValidTransition('blocked', 'ready')).toBe(true);
      expect(stateManager.isValidTransition('blocked', 'skipped')).toBe(true);
      expect(stateManager.isValidTransition('ready', 'skipped')).toBe(true);
      expect(stateManager.isValidTransition('queued', 'skipped')).toBe(true);
    });

    it('should reject invalid state transitions', () => {
      // Invalid transitions
      expect(stateManager.isValidTransition('pending', 'completed')).toBe(false);
      expect(stateManager.isValidTransition('completed', 'pending')).toBe(false);
      expect(stateManager.isValidTransition('failed', 'completed')).toBe(false);
      expect(stateManager.isValidTransition('skipped', 'running')).toBe(false);
      expect(stateManager.isValidTransition('ready', 'pending')).toBe(false);
    });
  });

  describe('transitionTask', () => {
    it('should transition task to new state with history', () => {
      const task = createTask('task-1', 'pending');

      stateManager.transitionTask(task, 'ready', 'Dependencies met');

      expect(task.state).toBe('ready');
      expect(task.stateHistory).toHaveLength(1);
      expect(task.stateHistory[0]).toMatchObject({
        from: 'pending',
        to: 'ready',
        reason: 'Dependencies met',
      });
    });

    it('should throw error on invalid transition', () => {
      const task = createTask('task-1', 'pending');

      expect(() => stateManager.transitionTask(task, 'completed')).toThrow(
        'Invalid state transition from pending to completed',
      );
    });

    it('should set startTime when transitioning to running', () => {
      const task = createTask('task-1', 'queued');

      stateManager.transitionTask(task, 'running');

      expect(task.startTime).toBeDefined();
      expect(task.startTime).toBeInstanceOf(Date);
    });

    it('should calculate duration when completing task', () => {
      const task = createTask('task-1', 'queued');

      // Transition to running (sets startTime)
      stateManager.transitionTask(task, 'running');
      const { startTime } = task;

      // Wait a tiny bit to ensure duration > 0
      const delay = 10; // milliseconds
      const startWait = Date.now();
      while (Date.now() - startWait < delay) {
        // Busy wait
      }

      // Transition to completed (sets endTime and duration)
      stateManager.transitionTask(task, 'completed');

      const { endTime, duration } = task;
      expect(endTime).toBeDefined();
      expect(duration).toBeDefined();
      expect(duration!).toBeGreaterThanOrEqual(delay);
      expect(endTime!.getTime() - startTime!.getTime()).toBe(duration);
    });

    it('should increment retry count when failing', () => {
      const task = createTask('task-1', 'running');
      expect(task.retryCount).toBe(0);

      stateManager.transitionTask(task, 'failed');

      expect(task.retryCount).toBe(1);
      expect(task.endTime).toBeDefined();
    });

    it('should handle multiple transitions correctly', () => {
      const task = createTask('task-1', 'pending');

      stateManager.transitionTask(task, 'ready');
      stateManager.transitionTask(task, 'queued');
      stateManager.transitionTask(task, 'running');
      stateManager.transitionTask(task, 'completed');

      expect(task.state).toBe('completed');
      expect(task.stateHistory).toHaveLength(4);
      expect(task.startTime).toBeDefined();
      expect(task.endTime).toBeDefined();
      expect(task.duration).toBeDefined();
    });
  });

  describe('canRetry', () => {
    it('should allow retry when failed and under retry limit', () => {
      const task = createTask('task-1', 'failed');
      task.retryCount = 1;
      task.maxRetries = 3;

      expect(stateManager.canRetry(task)).toBe(true);
    });

    it('should not allow retry when at retry limit', () => {
      const task = createTask('task-1', 'failed');
      task.retryCount = 3;
      task.maxRetries = 3;

      expect(stateManager.canRetry(task)).toBe(false);
    });

    it('should not allow retry when not in failed state', () => {
      const task = createTask('task-1', 'completed');
      task.retryCount = 0;
      task.maxRetries = 3;

      expect(stateManager.canRetry(task)).toBe(false);
    });
  });

  describe('shouldSkip', () => {
    it('should skip task when dependency failed', () => {
      const task = createTask('task-2', 'pending', ['task-1']);
      const dependencies = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'failed')],
      ]);

      expect(stateManager.shouldSkip(task, dependencies)).toBe(true);
    });

    it('should skip task when dependency was skipped', () => {
      const task = createTask('task-2', 'pending', ['task-1']);
      const dependencies = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'skipped')],
      ]);

      expect(stateManager.shouldSkip(task, dependencies)).toBe(true);
    });

    it('should not skip task when all dependencies completed', () => {
      const task = createTask('task-2', 'pending', ['task-1']);
      const dependencies = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'completed')],
      ]);

      expect(stateManager.shouldSkip(task, dependencies)).toBe(false);
    });
  });

  describe('getTasksByState', () => {
    it('should return tasks in specified state', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'pending')],
        ['task-2', createTask('task-2', 'ready')],
        ['task-3', createTask('task-3', 'pending')],
        ['task-4', createTask('task-4', 'completed')],
      ]);

      const pendingTasks = stateManager.getTasksByState(tasks, 'pending');
      expect(pendingTasks).toHaveLength(2);
      expect(pendingTasks.map((t) => t.id)).toEqual(['task-1', 'task-3']);

      const readyTasks = stateManager.getTasksByState(tasks, 'ready');
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0]!.id).toBe('task-2');
    });

    it('should return empty array when no tasks in state', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'pending')],
        ['task-2', createTask('task-2', 'ready')],
      ]);

      const runningTasks = stateManager.getTasksByState(tasks, 'running');
      expect(runningTasks).toHaveLength(0);
    });
  });

  describe('updateDependentTasks', () => {
    it('should mark dependent tasks ready when dependency completes', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'completed')],
        ['task-2', createTask('task-2', 'pending', ['task-1'])],
        ['task-3', createTask('task-3', 'pending', ['task-1'])],
      ]);

      const updatedTasks = stateManager.updateDependentTasks('task-1', tasks);

      expect(updatedTasks).toHaveLength(2);
      expect(tasks.get('task-2')?.state).toBe('ready');
      expect(tasks.get('task-3')?.state).toBe('ready');
    });

    it('should skip dependent tasks when dependency fails', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'failed')],
        ['task-2', createTask('task-2', 'blocked', ['task-1'])], // blocked state can transition to skipped
        ['task-3', createTask('task-3', 'ready', ['task-1'])], // ready state can transition to skipped
      ]);

      const updatedTasks = stateManager.updateDependentTasks('task-1', tasks);

      expect(updatedTasks).toHaveLength(2);
      expect(tasks.get('task-2')?.state).toBe('skipped');
      expect(tasks.get('task-3')?.state).toBe('skipped');
    });

    it('should block tasks when dependencies are running', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'running')],
        ['task-2', createTask('task-2', 'pending', ['task-1'])],
      ]);

      const updatedTasks = stateManager.updateDependentTasks('task-1', tasks);

      expect(updatedTasks).toHaveLength(1);
      expect(tasks.get('task-2')?.state).toBe('blocked');
    });

    it('should only update tasks when all dependencies are met', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'completed')],
        ['task-2', createTask('task-2', 'pending')], // Not dependent
        ['task-3', createTask('task-3', 'pending', ['task-1', 'task-2'])], // Multiple deps
      ]);

      const updatedTasks = stateManager.updateDependentTasks('task-1', tasks);

      // task-3 should not be ready yet because task-2 is still pending
      expect(updatedTasks).toHaveLength(0);
      expect(tasks.get('task-3')?.state).toBe('pending');

      // Now complete task-2
      tasks.get('task-2')!.state = 'completed';
      const updatedTasks2 = stateManager.updateDependentTasks('task-2', tasks);

      // Now task-3 should be ready
      expect(updatedTasks2).toHaveLength(1);
      expect(tasks.get('task-3')?.state).toBe('ready');
    });
  });

  describe('getExecutionStats', () => {
    it('should count tasks by state', () => {
      const tasks = new Map<string, ExecutionTask>([
        ['task-1', createTask('task-1', 'pending')],
        ['task-2', createTask('task-2', 'pending')],
        ['task-3', createTask('task-3', 'ready')],
        ['task-4', createTask('task-4', 'running')],
        ['task-5', createTask('task-5', 'completed')],
        ['task-6', createTask('task-6', 'completed')],
        ['task-7', createTask('task-7', 'failed')],
      ]);

      const stats = stateManager.getExecutionStats(tasks);

      expect(stats).toEqual({
        pending: 2,
        ready: 1,
        queued: 0,
        running: 1,
        completed: 2,
        failed: 1,
        blocked: 0,
        skipped: 0,
      });
    });

    it('should return zeros for empty task map', () => {
      const tasks = new Map<string, ExecutionTask>();

      const stats = stateManager.getExecutionStats(tasks);

      expect(stats).toEqual({
        pending: 0,
        ready: 0,
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
      });
    });
  });

  describe('isTerminalState', () => {
    it('should identify terminal states', () => {
      expect(stateManager.isTerminalState('completed')).toBe(true);
      expect(stateManager.isTerminalState('failed')).toBe(true);
      expect(stateManager.isTerminalState('skipped')).toBe(true);
    });

    it('should identify non-terminal states', () => {
      expect(stateManager.isTerminalState('pending')).toBe(false);
      expect(stateManager.isTerminalState('ready')).toBe(false);
      expect(stateManager.isTerminalState('queued')).toBe(false);
      expect(stateManager.isTerminalState('running')).toBe(false);
      expect(stateManager.isTerminalState('blocked')).toBe(false);
    });
  });

  describe('isExecutableState', () => {
    it('should identify executable states', () => {
      expect(stateManager.isExecutableState('ready')).toBe(true);
      expect(stateManager.isExecutableState('queued')).toBe(true);
    });

    it('should identify non-executable states', () => {
      expect(stateManager.isExecutableState('pending')).toBe(false);
      expect(stateManager.isExecutableState('running')).toBe(false);
      expect(stateManager.isExecutableState('completed')).toBe(false);
      expect(stateManager.isExecutableState('failed')).toBe(false);
      expect(stateManager.isExecutableState('blocked')).toBe(false);
      expect(stateManager.isExecutableState('skipped')).toBe(false);
    });
  });
});

// Helper function to create test tasks
function createTask(id: string, state: TaskState, requires: string[] = []): ExecutionTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    state,
    requires,
    produces: [],
    touches: [],
    estimatedLines: 50,
    agentPrompt: `Execute ${id}`,
    retryCount: 0,
    maxRetries: 3,
    stateHistory: [],
  };
}
