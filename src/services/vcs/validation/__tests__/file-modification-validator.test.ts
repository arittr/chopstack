import { beforeEach, describe, expect, it } from 'bun:test';

import type { TaskV2 } from '@/types/schemas-v2';

import { FileModificationValidator } from '../file-modification-validator';

describe('FileModificationValidator', () => {
  let validator: FileModificationValidator;

  const createTask = (id: string, files: string[], dependencies: string[] = []): TaskV2 => ({
    id,
    name: `Task ${id}`,
    description: `Description for ${id}`,
    files,
    dependencies,
    complexity: 'S',
    acceptanceCriteria: [`Complete ${id}`],
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

    it('should allow modifying files in spec', () => {
      const task = createTask('task-1', ['src/app/page.tsx', 'src/components/Button.tsx']);
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
      const task = createTask('task-1', ['file1.ts', 'file2.ts', 'file3.ts']);
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
    it('should return all files in spec', () => {
      const task = createTask('task-1', ['file1.ts', 'file2.ts', 'file3.ts']);
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

  describe('transitive dependency chains', () => {
    it('should allow modifying files from direct dependencies', () => {
      // task-a touches layout.tsx
      // task-b requires task-a and also touches layout.tsx (refinement)
      const taskA = createTask('task-a', ['src/app/layout.tsx'], []);
      const taskB = createTask('task-b', ['src/app/layout.tsx'], ['task-a']);
      const allTasks = [taskA, taskB];
      const taskOrder = ['task-a', 'task-b'];

      validator.initialize(allTasks, taskOrder);

      // task-b should be allowed to modify layout.tsx since it depends on task-a
      const result = validator.validatePreCommit(taskB, ['src/app/layout.tsx']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow modifying files from transitive dependencies', () => {
      // task-a touches layout.tsx
      // task-b requires task-a, touches layout.tsx
      // task-c requires task-b, touches layout.tsx (transitive refinement)
      const taskA = createTask('task-a', ['src/app/layout.tsx'], []);
      const taskB = createTask('task-b', ['src/app/layout.tsx'], ['task-a']);
      const taskC = createTask('task-c', ['src/app/layout.tsx'], ['task-b']);
      const allTasks = [taskA, taskB, taskC];
      const taskOrder = ['task-a', 'task-b', 'task-c'];

      validator.initialize(allTasks, taskOrder);

      // task-c should be allowed to modify layout.tsx even though task-a is a transitive dependency
      const result = validator.validatePreCommit(taskC, ['src/app/layout.tsx']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should forbid modifying files from parallel tasks (no dependency relationship)', () => {
      // task-a touches layout.tsx
      // task-b touches layout.tsx (but no dependency relationship)
      const taskA = createTask('task-a', ['src/app/layout.tsx'], []);
      const taskB = createTask('task-b', ['src/app/layout.tsx'], []);
      const allTasks = [taskA, taskB];
      const taskOrder = ['task-a', 'task-b'];

      validator.initialize(allTasks, taskOrder);

      // task-b should NOT be allowed to modify layout.tsx since it doesn't depend on task-a
      const result = validator.validatePreCommit(taskB, ['src/app/layout.tsx']);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.file).toBe('src/app/layout.tsx');
      expect(result.violations[0]?.reason).toBe('belongs_to_other_task');
      expect(result.violations[0]?.conflictingTask).toBe('task-a');
    });

    it('should handle complex dependency chain with multiple files', () => {
      // task-a touches file1.ts and file2.ts
      // task-b requires task-a, touches file2.ts and file3.ts
      // task-c requires task-b, touches file2.ts, file3.ts, and file4.ts (can touch files from dependency chain)
      const taskA = createTask('task-a', ['file1.ts', 'file2.ts'], []);
      const taskB = createTask('task-b', ['file2.ts', 'file3.ts'], ['task-a']);
      const taskC = createTask('task-c', ['file2.ts', 'file3.ts', 'file4.ts'], ['task-b']);
      const allTasks = [taskA, taskB, taskC];
      const taskOrder = ['task-a', 'task-b', 'task-c'];

      validator.initialize(allTasks, taskOrder);

      // task-c should be allowed to modify file2.ts (from transitive dep), file3.ts (from direct dep), and file4.ts (own)
      const result = validator.validatePreCommit(taskC, ['file2.ts', 'file3.ts', 'file4.ts']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle the dark-mode scenario (integrate-theme-provider and add-theme-script)', () => {
      // Simplified version of the failing dark-mode spec
      // integrate-theme-provider touches layout.tsx
      // add-theme-script requires integrate-theme-provider and also touches layout.tsx
      const integrateProvider = createTask('integrate-theme-provider', ['src/app/layout.tsx'], []);
      const addThemeScript = createTask(
        'add-theme-script',
        ['src/app/layout.tsx'],
        ['integrate-theme-provider'],
      );
      const allTasks = [integrateProvider, addThemeScript];
      const taskOrder = ['integrate-theme-provider', 'add-theme-script'];

      validator.initialize(allTasks, taskOrder);

      // add-theme-script should be allowed to modify layout.tsx since it depends on integrate-theme-provider
      const result = validator.validatePreCommit(addThemeScript, ['src/app/layout.tsx']);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
