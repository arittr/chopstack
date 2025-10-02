/**
 * File Modification Validator
 *
 * Validates that tasks only modify files within their declared scope.
 * Prevents task bleeding and detects hallucinations.
 */

import type { Task } from '@/types/decomposer';
import type { FileValidationResult, FileViolation, ValidationConfig } from '@/types/validation';

import { isNonEmptyString } from '@/validation/guards';

import { FileAccessControl } from './file-access-control';

export class FileModificationValidator {
  private readonly accessControl: FileAccessControl;
  private readonly config: ValidationConfig;
  private _allTasks: Task[] = [];
  private _taskOrder: string[] = [];

  constructor(config?: Partial<ValidationConfig>) {
    this.accessControl = new FileAccessControl();
    this.config = {
      mode: config?.mode ?? 'strict',
      allowNewFiles: config?.allowNewFiles ?? false,
      allowDependencyFiles: config?.allowDependencyFiles ?? false,
    };
  }

  /**
   * Initialize validator with all tasks and execution order
   * Must be called before validation
   */
  initialize(tasks: Task[], taskOrder: string[]): void {
    this._allTasks = tasks;
    this._taskOrder = taskOrder;
  }

  /**
   * Validate files before commit
   * Checks that modified files match task specification
   */
  validatePreCommit(task: Task, modifiedFiles: string[]): FileValidationResult {
    const violations: FileViolation[] = [];
    const warnings: string[] = [];

    // Get forbidden files for this task
    const forbiddenFiles = this.accessControl.getForbiddenFiles(
      task,
      this._allTasks,
      this._taskOrder,
    );

    // Check each modified file
    for (const file of modifiedFiles) {
      // Check if file is explicitly forbidden (belongs to another task)
      if (forbiddenFiles.includes(file)) {
        const conflictingTask = this._findTaskOwningFile(file, task.id);
        const violation: FileViolation = {
          file,
          reason: 'belongs_to_other_task',
        };
        if (conflictingTask !== undefined) {
          violation.conflictingTask = conflictingTask;
        }
        violations.push(violation);
        continue;
      }

      // Check if file is in task specification
      const isAllowed = this.accessControl.isFileAllowed(file, task);

      if (!isAllowed) {
        // Check if it's a new file and we allow those
        const isNewFile = !task.touches.includes(file);
        if (isNewFile && this.config.allowNewFiles) {
          warnings.push(`New file '${file}' created but not in task specification`);
          continue;
        }

        // File not in spec and not explicitly allowed
        violations.push({
          file,
          reason: 'not_in_spec',
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Validate after commit
   * Detects hallucinations (task reported success but made no changes)
   */
  validatePostCommit(task: Task, committedFiles: string[]): FileValidationResult {
    const violations: FileViolation[] = [];
    const warnings: string[] = [];

    // Check for hallucination: no files committed
    if (committedFiles.length === 0) {
      violations.push({
        file: '',
        reason: 'no_changes',
      });
      warnings.push('Task reported success but made no changes (possible hallucination)');
    }

    // Also run pre-commit validation on committed files
    const preCommitResult = this.validatePreCommit(task, committedFiles);
    violations.push(...preCommitResult.violations);
    warnings.push(...preCommitResult.warnings);

    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Get list of files this task is forbidden from modifying
   */
  getForbiddenFiles(task: Task): string[] {
    return this.accessControl.getForbiddenFiles(task, this._allTasks, this._taskOrder);
  }

  /**
   * Get list of files this task is allowed to modify
   */
  getAllowedFiles(task: Task): string[] {
    return this.accessControl.getAllowedFiles(task);
  }

  /**
   * Find which task owns a specific file
   */
  private _findTaskOwningFile(file: string, excludeTaskId?: string): string | undefined {
    for (const task of this._allTasks) {
      if (isNonEmptyString(excludeTaskId) && task.id === excludeTaskId) {
        continue;
      }

      const taskFiles = [...task.touches, ...task.produces];
      if (taskFiles.includes(file)) {
        return task.id;
      }
    }

    return undefined;
  }
}
