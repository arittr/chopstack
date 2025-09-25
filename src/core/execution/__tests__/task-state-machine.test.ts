import { describe, expect, it } from 'vitest';

import type { TaskState } from '@/core/execution/types';

import {
  calculateProgress,
  calculateTaskStats,
  createStateTransition,
  determineNextState,
  EXECUTABLE_STATES,
  isExecutableState,
  isTerminalState,
  isValidTransition,
  TERMINAL_STATES,
  VALID_STATE_TRANSITIONS,
} from '../task-state-machine';

describe('task-state-machine', () => {
  describe('VALID_STATE_TRANSITIONS', () => {
    it('should define all expected transitions', () => {
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'pending', to: 'ready' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'pending', to: 'blocked' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'pending', to: 'skipped' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'ready', to: 'queued' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'queued', to: 'running' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'running', to: 'completed' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'running', to: 'failed' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'failed', to: 'queued' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'blocked', to: 'ready' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'blocked', to: 'skipped' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'ready', to: 'skipped' });
      expect(VALID_STATE_TRANSITIONS).toContainEqual({ from: 'queued', to: 'skipped' });
    });
  });

  describe('TERMINAL_STATES', () => {
    it('should contain all terminal states', () => {
      expect(TERMINAL_STATES).toEqual(['completed', 'failed', 'skipped']);
    });
  });

  describe('EXECUTABLE_STATES', () => {
    it('should contain all executable states', () => {
      expect(EXECUTABLE_STATES).toEqual(['ready', 'queued']);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidTransition('pending', 'ready')).toBe(true);
      expect(isValidTransition('running', 'completed')).toBe(true);
      expect(isValidTransition('failed', 'queued')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(isValidTransition('pending', 'completed')).toBe(false);
      expect(isValidTransition('completed', 'running')).toBe(false);
      expect(isValidTransition('skipped', 'ready')).toBe(false);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for terminal states', () => {
      expect(isTerminalState('completed')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('skipped')).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalState('pending')).toBe(false);
      expect(isTerminalState('ready')).toBe(false);
      expect(isTerminalState('running')).toBe(false);
    });
  });

  describe('isExecutableState', () => {
    it('should return true for executable states', () => {
      expect(isExecutableState('ready')).toBe(true);
      expect(isExecutableState('queued')).toBe(true);
    });

    it('should return false for non-executable states', () => {
      expect(isExecutableState('pending')).toBe(false);
      expect(isExecutableState('running')).toBe(false);
      expect(isExecutableState('completed')).toBe(false);
    });
  });

  describe('determineNextState', () => {
    it('should return skipped when dependencies failed', () => {
      const dependencies = new Map<string, TaskState>([
        ['dep1', 'completed'],
        ['dep2', 'failed'],
      ]);

      expect(determineNextState('pending', dependencies)).toBe('skipped');
      expect(determineNextState('blocked', dependencies)).toBe('skipped');
    });

    it('should return skipped when dependencies were skipped', () => {
      const dependencies = new Map<string, TaskState>([
        ['dep1', 'completed'],
        ['dep2', 'skipped'],
      ]);

      expect(determineNextState('pending', dependencies)).toBe('skipped');
    });

    it('should return ready when all dependencies completed', () => {
      const dependencies = new Map<string, TaskState>([
        ['dep1', 'completed'],
        ['dep2', 'completed'],
      ]);

      expect(determineNextState('pending', dependencies)).toBe('ready');
      expect(determineNextState('blocked', dependencies)).toBe('ready');
    });

    it('should return blocked when dependencies are still running', () => {
      const dependencies = new Map<string, TaskState>([
        ['dep1', 'completed'],
        ['dep2', 'running'],
      ]);

      expect(determineNextState('pending', dependencies)).toBe('blocked');
    });

    it('should return blocked when dependencies are queued', () => {
      const dependencies = new Map<string, TaskState>([
        ['dep1', 'completed'],
        ['dep2', 'queued'],
      ]);

      expect(determineNextState('pending', dependencies)).toBe('blocked');
    });

    it('should return null when no transition is needed', () => {
      const dependencies = new Map<string, TaskState>([['dep1', 'pending']]);

      expect(determineNextState('ready', dependencies)).toBe(null);
      expect(determineNextState('running', dependencies)).toBe(null);
    });

    it('should handle empty dependencies', () => {
      const dependencies = new Map<string, TaskState>();
      expect(determineNextState('pending', dependencies)).toBe('ready');
    });
  });

  describe('createStateTransition', () => {
    it('should create a valid state transition', () => {
      const transition = createStateTransition('pending', 'ready', 'All dependencies met');

      expect(transition.from).toBe('pending');
      expect(transition.to).toBe('ready');
      expect(transition.reason).toBe('All dependencies met');
      expect(transition.timestamp).toBeInstanceOf(Date);
    });

    it('should create transition without reason', () => {
      const transition = createStateTransition('running', 'completed');

      expect(transition.from).toBe('running');
      expect(transition.to).toBe('completed');
      expect(transition.reason).toBeUndefined();
      expect(transition.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('calculateTaskStats', () => {
    it('should calculate correct statistics', () => {
      const taskStates: TaskState[] = [
        'pending',
        'ready',
        'running',
        'completed',
        'completed',
        'failed',
        'skipped',
      ];

      const stats = calculateTaskStats(taskStates);

      expect(stats).toEqual({
        pending: 1,
        ready: 1,
        queued: 0,
        running: 1,
        completed: 2,
        failed: 1,
        blocked: 0,
        skipped: 1,
      });
    });

    it('should handle empty array', () => {
      const stats = calculateTaskStats([]);

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

  describe('calculateProgress', () => {
    it('should calculate progress correctly', () => {
      const taskStates: TaskState[] = [
        'pending',
        'running',
        'completed',
        'completed',
        'failed',
        'skipped',
      ];

      const progress = calculateProgress(taskStates);

      expect(progress).toEqual({
        completed: 4, // completed + failed + skipped (all terminal states)
        total: 6,
        percentage: 67,
      });
    });

    it('should handle all completed tasks', () => {
      const taskStates: TaskState[] = ['completed', 'completed', 'completed'];
      const progress = calculateProgress(taskStates);

      expect(progress).toEqual({
        completed: 3,
        total: 3,
        percentage: 100,
      });
    });

    it('should handle no completed tasks', () => {
      const taskStates: TaskState[] = ['pending', 'ready', 'running'];
      const progress = calculateProgress(taskStates);

      expect(progress).toEqual({
        completed: 0,
        total: 3,
        percentage: 0,
      });
    });

    it('should handle empty array', () => {
      const progress = calculateProgress([]);

      expect(progress).toEqual({
        completed: 0,
        total: 0,
        percentage: 0,
      });
    });
  });
});
