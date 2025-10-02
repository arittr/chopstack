import { describe, expect, it } from 'vitest';

import type { Task } from '@/types/decomposer';

import { FileAccessControl } from '../file-access-control';

describe('FileAccessControl', () => {
  const accessControl = new FileAccessControl();

  describe('getAllowedFiles', () => {
    it('should return all touches and produces files', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['file1.ts', 'file2.ts'],
        produces: ['file3.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      const allowed = accessControl.getAllowedFiles(task);

      expect(allowed).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });

    it('should return empty array for task with no files', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: [],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      const allowed = accessControl.getAllowedFiles(task);

      expect(allowed).toEqual([]);
    });
  });

  describe('getForbiddenFiles', () => {
    it('should forbid files from later tasks', () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      };

      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        description: 'Second task',
        touches: ['file2.ts'],
        produces: ['file3.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 2',
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task1, allTasks, taskOrder);

      // task-1 should be forbidden from modifying task-2's files
      expect(forbidden).toContain('file2.ts');
      expect(forbidden).toContain('file3.ts');
    });

    it('should not forbid files from dependency tasks', () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      };

      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        description: 'Second task',
        touches: ['file2.ts'],
        produces: [],
        requires: ['task-1'], // Depends on task-1
        estimatedLines: 10,
        agentPrompt: 'Do task 2',
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task2, allTasks, taskOrder);

      // task-2 depends on task-1, so task-1's files should NOT be forbidden
      expect(forbidden).not.toContain('file1.ts');
    });

    it('should forbid files from sibling tasks (parallel execution)', () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Task 1',
        description: 'First task',
        touches: ['file1.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do task 1',
      };

      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        description: 'Second task',
        touches: ['file2.ts'],
        produces: [],
        requires: [], // No dependency - sibling task
        estimatedLines: 10,
        agentPrompt: 'Do task 2',
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task1, allTasks, taskOrder);

      // task-1 and task-2 are siblings (no dependency), so should be forbidden
      expect(forbidden).toContain('file2.ts');
    });

    it('should return empty array for task not in order', () => {
      const task: Task = {
        id: 'task-999',
        title: 'Unknown Task',
        description: 'Not in order',
        touches: ['file.ts'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      const allTasks = [task];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task, allTasks, taskOrder);

      expect(forbidden).toEqual([]);
    });
  });

  describe('isFileAllowed', () => {
    it('should allow exact file matches', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['src/app/page.tsx'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      expect(accessControl.isFileAllowed('src/app/page.tsx', task)).toBe(true);
    });

    it('should allow files under directory specifications', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['src/components/'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      expect(accessControl.isFileAllowed('src/components/Button.tsx', task)).toBe(true);
      expect(accessControl.isFileAllowed('src/components/ui/Dialog.tsx', task)).toBe(true);
    });

    it('should not allow files outside directory specifications', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['src/components/'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      expect(accessControl.isFileAllowed('src/utils/helper.ts', task)).toBe(false);
    });

    it('should not allow files with partial matches', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['src/app/page.tsx'],
        produces: [],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      expect(accessControl.isFileAllowed('src/app/page.module.css', task)).toBe(false);
    });

    it('should check both touches and produces', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        touches: ['file1.ts'],
        produces: ['file2.ts'],
        requires: [],
        estimatedLines: 10,
        agentPrompt: 'Do something',
      };

      expect(accessControl.isFileAllowed('file1.ts', task)).toBe(true);
      expect(accessControl.isFileAllowed('file2.ts', task)).toBe(true);
      expect(accessControl.isFileAllowed('file3.ts', task)).toBe(false);
    });
  });
});
