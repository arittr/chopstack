import { describe, expect, it } from 'bun:test';

import type { TaskV2 } from '@/types/schemas-v2';

import { FileAccessControl } from '../file-access-control';

describe('FileAccessControl', () => {
  const accessControl = new FileAccessControl();

  describe('getAllowedFiles', () => {
    it('should return all files', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      const allowed = accessControl.getAllowedFiles(task);

      expect(allowed).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });

    it('should return empty array for task with no files', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: [],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      const allowed = accessControl.getAllowedFiles(task);

      expect(allowed).toEqual([]);
    });
  });

  describe('getForbiddenFiles', () => {
    it('should forbid files from later tasks', () => {
      const task1: TaskV2 = {
        id: 'task-1',
        name: 'Task 1',
        description: 'First task',
        files: ['file1.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Task 1 completed'],
      };

      const task2: TaskV2 = {
        id: 'task-2',
        name: 'Task 2',
        description: 'Second task',
        files: ['file2.ts', 'file3.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Task 2 completed'],
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task1, allTasks, taskOrder);

      // task-1 should be forbidden from modifying task-2's files
      expect(forbidden).toContain('file2.ts');
      expect(forbidden).toContain('file3.ts');
    });

    it('should not forbid files from dependency tasks', () => {
      const task1: TaskV2 = {
        id: 'task-1',
        name: 'Task 1',
        description: 'First task',
        files: ['file1.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Task 1 completed'],
      };

      const task2: TaskV2 = {
        id: 'task-2',
        name: 'Task 2',
        description: 'Second task',
        files: ['file2.ts'],
        dependencies: ['task-1'], // Depends on task-1
        complexity: 'XS',
        acceptanceCriteria: ['Task 2 completed'],
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task2, allTasks, taskOrder);

      // task-2 depends on task-1, so task-1's files should NOT be forbidden
      expect(forbidden).not.toContain('file1.ts');
    });

    it('should forbid files from sibling tasks (parallel execution)', () => {
      const task1: TaskV2 = {
        id: 'task-1',
        name: 'Task 1',
        description: 'First task',
        files: ['file1.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Task 1 completed'],
      };

      const task2: TaskV2 = {
        id: 'task-2',
        name: 'Task 2',
        description: 'Second task',
        files: ['file2.ts'],
        dependencies: [], // No dependency - sibling task
        complexity: 'XS',
        acceptanceCriteria: ['Task 2 completed'],
      };

      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task1, allTasks, taskOrder);

      // task-1 and task-2 are siblings (no dependency), so should be forbidden
      expect(forbidden).toContain('file2.ts');
    });

    it('should return empty array for task not in order', () => {
      const task: TaskV2 = {
        id: 'task-999',
        name: 'Unknown Task',
        description: 'Not in order',
        files: ['file.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Task completed'],
      };

      const allTasks = [task];
      const taskOrder = ['task-1', 'task-2'];

      const forbidden = accessControl.getForbiddenFiles(task, allTasks, taskOrder);

      expect(forbidden).toEqual([]);
    });
  });

  describe('isFileAllowed', () => {
    it('should allow exact file matches', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['src/app/page.tsx'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      expect(accessControl.isFileAllowed('src/app/page.tsx', task)).toBe(true);
    });

    it('should allow files under directory specifications', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['src/components/'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      expect(accessControl.isFileAllowed('src/components/Button.tsx', task)).toBe(true);
      expect(accessControl.isFileAllowed('src/components/ui/Dialog.tsx', task)).toBe(true);
    });

    it('should not allow files outside directory specifications', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['src/components/'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      expect(accessControl.isFileAllowed('src/utils/helper.ts', task)).toBe(false);
    });

    it('should not allow files with partial matches', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['src/app/page.tsx'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      expect(accessControl.isFileAllowed('src/app/page.module.css', task)).toBe(false);
    });

    it('should check all files', () => {
      const task: TaskV2 = {
        id: 'task-1',
        name: 'Test Task',
        description: 'Test',
        files: ['file1.ts', 'file2.ts'],
        dependencies: [],
        complexity: 'XS',
        acceptanceCriteria: ['Test criterion'],
      };

      expect(accessControl.isFileAllowed('file1.ts', task)).toBe(true);
      expect(accessControl.isFileAllowed('file2.ts', task)).toBe(true);
      expect(accessControl.isFileAllowed('file3.ts', task)).toBe(false);
    });
  });
});
