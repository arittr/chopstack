import { describe, expect, it } from 'vitest';

import type { TaskV2 } from '@/types/schemas-v2';

import { TaskTransitionManager } from '../task-transitions';

describe('TaskTransitionManager', () => {
  let manager: TaskTransitionManager;

  const createTestTasks = (): TaskV2[] => [
    {
      id: 'task-1',
      name: 'Task 1',
      description: 'First task',
      dependencies: [],
      files: ['file1.ts'],
      complexity: 'XS',
      acceptanceCriteria: ['Task 1 completed'],
    },
    {
      id: 'task-2',
      name: 'Task 2',
      description: 'Second task',
      dependencies: ['task-1'],
      files: ['file2.ts'],
      complexity: 'XS',
      acceptanceCriteria: ['Task 2 completed'],
    },
    {
      id: 'task-3',
      name: 'Task 3',
      description: 'Third task',
      dependencies: ['task-1', 'task-2'],
      files: ['file3.ts'],
      complexity: 'XS',
      acceptanceCriteria: ['Task 3 completed'],
    },
  ];

  beforeEach(() => {
    manager = new TaskTransitionManager();
  });

  describe('initialize', () => {
    it('should initialize tasks with correct states', () => {
      const tasks = createTestTasks();
      manager.initialize(tasks);

      // Task 1 has no dependencies, should be ready
      expect(manager.getTaskState('task-1')).toBe('ready');

      // Task 2 and 3 have dependencies, should be pending
      expect(manager.getTaskState('task-2')).toBe('pending');
      expect(manager.getTaskState('task-3')).toBe('pending');
    });

    it('should reset state on re-initialization', () => {
      const tasks = createTestTasks();
      manager.initialize(tasks);

      // Complete task-1 properly by transitioning through states
      manager.startTask('task-1'); // ready -> queued
      manager.startTask('task-1'); // queued -> running
      manager.completeTask('task-1'); // running -> completed
      expect(manager.getTaskState('task-1')).toBe('completed');

      // Re-initialize
      manager.initialize(tasks);
      expect(manager.getTaskState('task-1')).toBe('ready');
    });
  });

  describe('getTaskState', () => {
    it('should return undefined for unknown task', () => {
      expect(manager.getTaskState('unknown')).toBeUndefined();
    });

    it('should return correct state after initialization', () => {
      manager.initialize(createTestTasks());
      expect(manager.getTaskState('task-1')).toBe('ready');
    });
  });

  describe('getTasksInState', () => {
    it('should return tasks in specific state', () => {
      manager.initialize(createTestTasks());

      expect(manager.getTasksInState('ready')).toEqual(['task-1']);
      expect(manager.getTasksInState('pending')).toEqual(['task-2', 'task-3']);
      expect(manager.getTasksInState('completed')).toEqual([]);
    });
  });

  describe('transitionTask', () => {
    it('should transition valid state changes', () => {
      manager.initialize(createTestTasks());

      expect(manager.transitionTask('task-1', 'queued', 'Starting task')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('queued');
    });

    it('should reject invalid state transitions', () => {
      manager.initialize(createTestTasks());

      expect(manager.transitionTask('task-1', 'completed')).toBe(false);
      expect(manager.getTaskState('task-1')).toBe('ready');
    });

    it('should reject transitions for unknown tasks', () => {
      manager.initialize(createTestTasks());

      expect(manager.transitionTask('unknown', 'running')).toBe(false);
    });
  });

  describe('startTask', () => {
    it('should transition ready task to queued', () => {
      manager.initialize(createTestTasks());

      expect(manager.startTask('task-1')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('queued');
    });

    it('should transition queued task to running', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1'); // ready -> queued

      expect(manager.startTask('task-1')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('running');
    });

    it('should fail for non-startable tasks', () => {
      manager.initialize(createTestTasks());

      expect(manager.startTask('task-2')).toBe(false); // pending task
      expect(manager.getTaskState('task-2')).toBe('pending');
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1'); // ready -> queued -> running

      expect(manager.completeTask('task-1')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('completed');
    });

    it('should update dependent tasks when completed', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');

      manager.completeTask('task-1');

      // Task 2 should now be ready since task-1 is completed
      expect(manager.getTaskState('task-2')).toBe('ready');
      // Task 3 still pending since it needs both task-1 and task-2
      expect(manager.getTaskState('task-3')).toBe('pending');
    });
  });

  describe('failTask', () => {
    it('should mark task as failed', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');

      expect(manager.failTask('task-1', 'Error occurred')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('failed');
    });

    it('should skip dependent tasks when failed', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');

      manager.failTask('task-1', 'Error occurred');

      // Dependent tasks should be skipped
      expect(manager.getTaskState('task-2')).toBe('skipped');
      expect(manager.getTaskState('task-3')).toBe('skipped');
    });
  });

  describe('skipTask', () => {
    it('should mark task as skipped', () => {
      manager.initialize(createTestTasks());

      expect(manager.skipTask('task-1', 'Manual skip')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('skipped');
    });

    it('should skip dependent tasks', () => {
      manager.initialize(createTestTasks());
      manager.skipTask('task-1', 'Manual skip');

      expect(manager.getTaskState('task-2')).toBe('skipped');
      expect(manager.getTaskState('task-3')).toBe('skipped');
    });
  });

  describe('retryTask', () => {
    it('should retry failed task', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');
      manager.failTask('task-1', 'Error');

      expect(manager.retryTask('task-1')).toBe(true);
      expect(manager.getTaskState('task-1')).toBe('queued');
    });

    it('should not retry non-failed tasks', () => {
      manager.initialize(createTestTasks());

      expect(manager.retryTask('task-1')).toBe(false);
      expect(manager.getTaskState('task-1')).toBe('ready');
    });
  });

  describe('getExecutableTasks', () => {
    it('should return tasks that can be executed', () => {
      manager.initialize(createTestTasks());

      expect(manager.getExecutableTasks()).toEqual(['task-1']);
    });

    it('should update after state changes', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');
      manager.completeTask('task-1');

      expect(manager.getExecutableTasks()).toEqual(['task-2']);
    });
  });

  describe('allTasksComplete', () => {
    it('should return false when tasks are not complete', () => {
      manager.initialize(createTestTasks());
      expect(manager.allTasksComplete()).toBe(false);
    });

    it('should return true when all tasks are in terminal state', () => {
      manager.initialize(createTestTasks());

      // Complete all tasks
      manager.startTask('task-1');
      manager.startTask('task-1');
      manager.completeTask('task-1');

      manager.startTask('task-2');
      manager.startTask('task-2');
      manager.completeTask('task-2');

      manager.startTask('task-3');
      manager.startTask('task-3');
      manager.completeTask('task-3');

      expect(manager.allTasksComplete()).toBe(true);
    });

    it('should return true with mixed terminal states', () => {
      manager.initialize(createTestTasks());

      manager.skipTask('task-1', 'Skip first');
      // This should skip all dependent tasks too

      expect(manager.allTasksComplete()).toBe(true);
    });
  });

  describe('getTaskTransitions', () => {
    it('should return transition history', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');

      const transitions = manager.getTaskTransitions('task-1');
      expect(transitions).toHaveLength(3); // pending->ready, ready->queued, queued->running
      expect(transitions[1]).toMatchObject({
        from: 'ready',
        to: 'queued',
        reason: 'Task started',
      });
      expect(transitions[2]).toMatchObject({
        from: 'queued',
        to: 'running',
        reason: 'Task execution begun',
      });
    });

    it('should return empty array for unknown task', () => {
      manager.initialize(createTestTasks());
      expect(manager.getTaskTransitions('unknown')).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');
      manager.startTask('task-1');

      const stats = manager.getStatistics();
      expect(stats).toEqual({
        pending: 2,
        ready: 0,
        queued: 0,
        running: 1,
        completed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
        total: 3,
      });
    });
  });

  describe('exportState', () => {
    it('should export current state', () => {
      manager.initialize(createTestTasks());
      manager.startTask('task-1');

      const state = manager.exportState();

      expect(state.states).toEqual({
        'task-1': 'queued',

        'task-2': 'pending',

        'task-3': 'pending',
      });

      expect(state.dependencies).toEqual({
        'task-1': [],
        'task-2': ['task-1'],
        'task-3': ['task-1', 'task-2'],
      });

      expect(state.transitions['task-1']).toHaveLength(2); // pending->ready, ready->queued
      expect(state.transitions['task-2']).toEqual([]);
      expect(state.transitions['task-3']).toEqual([]);
    });
  });

  describe('complex dependency scenarios', () => {
    it('should handle diamond dependency pattern', () => {
      const diamondTasks: TaskV2[] = [
        {
          id: 'a',
          name: 'A',
          description: 'Base task',
          dependencies: [],
          files: [],
          complexity: 'XS',
          acceptanceCriteria: [],
        },
        {
          id: 'b',
          name: 'B',
          description: 'Depends on A',
          dependencies: ['a'],
          files: [],
          complexity: 'XS',
          acceptanceCriteria: [],
        },
        {
          id: 'c',
          name: 'C',
          description: 'Depends on A',
          dependencies: ['a'],
          files: [],
          complexity: 'XS',
          acceptanceCriteria: [],
        },
        {
          id: 'd',
          name: 'D',
          description: 'Depends on B and C',
          dependencies: ['b', 'c'],
          files: [],
          complexity: 'XS',
          acceptanceCriteria: [],
        },
      ];

      manager.initialize(diamondTasks);

      // Initially only A should be ready
      expect(manager.getTasksInState('ready')).toEqual(['a']);
      expect(manager.getTasksInState('pending')).toEqual(['b', 'c', 'd']);

      // Complete A
      manager.startTask('a');
      manager.startTask('a');
      manager.completeTask('a');

      // B and C should now be ready, D still pending
      expect(manager.getTasksInState('ready')).toEqual(['b', 'c']);
      expect(manager.getTasksInState('pending')).toEqual(['d']);

      // Complete B
      manager.startTask('b');
      manager.startTask('b');
      manager.completeTask('b');

      // D still pending (needs C too)
      expect(manager.getTasksInState('pending')).toEqual(['d']);

      // Complete C
      manager.startTask('c');
      manager.startTask('c');
      manager.completeTask('c');

      // Now D should be ready
      expect(manager.getTasksInState('ready')).toEqual(['d']);
    });
  });
});
