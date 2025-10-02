import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '@/types/decomposer';

import { FileModificationValidator } from '../file-modification-validator';

describe('FileModificationValidator', () => {
  let validator: FileModificationValidator;

  const createTask = (
    id: string,
    touches: string[],
    produces: string[] = [],
    requires: string[] = [],
  ): Task => ({
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    touches,
    produces,
    requires,
    estimatedLines: 10,
    agentPrompt: `Do ${id}`,
  });

  beforeEach(() => {
    validator = new FileModificationValidator({ mode: 'strict' });
  });

  describe('validatePreCommit', () => {
    it('should pass validation when files match task specification', () => {
      const task = createTask('task-1', ['src/app/page.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePreCommit(task, ['src/app/page.tsx']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect violation when modifying files not in spec', () => {
      const task = createTask('task-1', ['src/app/page.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePreCommit(task, ['src/app/page.tsx', 'src/app/globals.css']);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.file).toBe('src/app/globals.css');
      expect(result.violations[0]?.reason).toBe('not_in_spec');
    });

    it('should detect violation when modifying files belonging to other tasks', () => {
      const task1 = createTask('task-1', ['src/app/page.tsx']);
      const task2 = createTask('task-2', ['src/app/globals.css']);
      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      validator.initialize(allTasks, taskOrder);

      // task-1 tries to modify task-2's file
      const result = validator.validatePreCommit(task1, [
        'src/app/page.tsx',
        'src/app/globals.css',
      ]);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.file).toBe('src/app/globals.css');
      expect(result.violations[0]?.reason).toBe('belongs_to_other_task');
      expect(result.violations[0]?.conflictingTask).toBe('task-2');
    });

    it('should allow modifying produces files', () => {
      const task = createTask('task-1', ['src/app/page.tsx'], ['src/components/Button.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePreCommit(task, [
        'src/app/page.tsx',
        'src/components/Button.tsx',
      ]);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow new files when configured', () => {
      const validatorWithNewFiles = new FileModificationValidator({
        mode: 'strict',
        allowNewFiles: true,
      });

      const task = createTask('task-1', ['src/app/page.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validatorWithNewFiles.initialize(allTasks, taskOrder);

      const result = validatorWithNewFiles.validatePreCommit(task, [
        'src/app/page.tsx',
        'src/app/new-file.tsx',
      ]);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "New file 'src/app/new-file.tsx' created but not in task specification",
      );
    });

    it('should pass validation for multiple files in spec', () => {
      const task = createTask('task-1', ['file1.ts', 'file2.ts'], ['file3.ts']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePreCommit(task, ['file1.ts', 'file2.ts', 'file3.ts']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('validatePostCommit', () => {
    it('should detect hallucination when no files committed', () => {
      const task = createTask('task-1', ['src/app/page.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePostCommit(task, []);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.reason).toBe('no_changes');
      expect(result.warnings).toContain(
        'Task reported success but made no changes (possible hallucination)',
      );
    });

    it('should run pre-commit validation on committed files', () => {
      const task1 = createTask('task-1', ['src/app/page.tsx']);
      const task2 = createTask('task-2', ['src/app/globals.css']);
      const allTasks = [task1, task2];
      const taskOrder = ['task-1', 'task-2'];

      validator.initialize(allTasks, taskOrder);

      // Post-commit validation should also catch file violations
      const result = validator.validatePostCommit(task1, [
        'src/app/page.tsx',
        'src/app/globals.css',
      ]);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.file === 'src/app/globals.css')).toBe(true);
    });

    it('should pass when correct files are committed', () => {
      const task = createTask('task-1', ['src/app/page.tsx']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const result = validator.validatePostCommit(task, ['src/app/page.tsx']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('getForbiddenFiles', () => {
    it('should return files from later tasks', () => {
      const task1 = createTask('task-1', ['file1.ts']);
      const task2 = createTask('task-2', ['file2.ts']);
      const task3 = createTask('task-3', ['file3.ts']);
      const allTasks = [task1, task2, task3];
      const taskOrder = ['task-1', 'task-2', 'task-3'];

      validator.initialize(allTasks, taskOrder);

      const forbidden = validator.getForbiddenFiles(task1);

      expect(forbidden).toContain('file2.ts');
      expect(forbidden).toContain('file3.ts');
      expect(forbidden).not.toContain('file1.ts');
    });
  });

  describe('getAllowedFiles', () => {
    it('should return touches and produces', () => {
      const task = createTask('task-1', ['file1.ts', 'file2.ts'], ['file3.ts']);
      const allTasks = [task];
      const taskOrder = ['task-1'];

      validator.initialize(allTasks, taskOrder);

      const allowed = validator.getAllowedFiles(task);

      expect(allowed).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });
  });

  describe('complex scenarios', () => {
    it('should handle the original bug scenario (update-css-variables / update-page-module-styles)', () => {
      // Recreate the original bug scenario
      const updateCssVariables = createTask('update-css-variables', ['src/app/globals.css']);
      const updatePageModuleStyles = createTask('update-page-module-styles', [
        'src/app/page.module.css',
      ]);

      const allTasks = [updateCssVariables, updatePageModuleStyles];
      const taskOrder = ['update-css-variables', 'update-page-module-styles'];

      validator.initialize(allTasks, taskOrder);

      // update-page-module-styles modified BOTH files (the bug)
      const result = validator.validatePreCommit(updatePageModuleStyles, [
        'src/app/page.module.css',
        'src/app/globals.css', // Should be forbidden
      ]);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.file).toBe('src/app/globals.css');
      expect(result.violations[0]?.reason).toBe('belongs_to_other_task');
      expect(result.violations[0]?.conflictingTask).toBe('update-css-variables');
    });

    it('should detect hallucination scenario (update-css-variables made no changes)', () => {
      const updateCssVariables = createTask('update-css-variables', ['src/app/globals.css']);
      const allTasks = [updateCssVariables];
      const taskOrder = ['update-css-variables'];

      validator.initialize(allTasks, taskOrder);

      // update-css-variables reported success but made no changes (the bug)
      const result = validator.validatePostCommit(updateCssVariables, []);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.reason).toBe('no_changes');
    });
  });
});
