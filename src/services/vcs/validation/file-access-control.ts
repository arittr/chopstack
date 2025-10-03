/**
 * File Access Control
 *
 * Determines which files a task is allowed to modify based on:
 * - Task specification (touches/produces)
 * - Execution order (can't modify files belonging to later tasks)
 * - Dependencies (can read but not write dependency files)
 */

import type { Task } from '@/types/decomposer';

import { isNonEmptyString } from '@/validation/guards';

export class FileAccessControl {
  /**
   * Get all files this task is allowed to modify
   */
  getAllowedFiles(task: Task): string[] {
    return [...task.touches, ...task.produces];
  }

  /**
   * Get files from other tasks that are forbidden for this task
   * Forbidden files are those belonging to:
   * 1. Tasks that come AFTER this task in execution order (prevent task bleeding)
   * 2. Tasks that are siblings (not dependencies) that execute in parallel
   */
  getForbiddenFiles(task: Task, allTasks: Task[], taskOrder: string[]): string[] {
    const currentTaskIndex = taskOrder.indexOf(task.id);
    if (currentTaskIndex === -1) {
      // Task not in order - shouldn't happen but be defensive
      return [];
    }

    const forbidden: string[] = [];

    // Get all tasks that come after this task in execution order
    const laterTaskIds = new Set(taskOrder.slice(currentTaskIndex + 1));

    // Get all tasks that come before this task in execution order
    const earlierTaskIds = new Set(taskOrder.slice(0, currentTaskIndex));

    // For each other task, determine if its files are forbidden
    for (const otherTask of allTasks) {
      // Skip if this is the current task
      if (otherTask.id === task.id) {
        continue;
      }

      // Check if this task comes later in execution order
      const isLaterTask = laterTaskIds.has(otherTask.id);

      // Check if this task comes earlier in execution order
      const isEarlierTask = earlierTaskIds.has(otherTask.id);

      // Check if this task is a dependency (allowed to read those files)
      const isDependency = task.requires.includes(otherTask.id);

      // Forbid files from:
      // 1. All later tasks (prevent task bleeding forward)
      // 2. Earlier tasks that are NOT dependencies (parallel siblings that happened to run first)
      if (isLaterTask || (isEarlierTask && !isDependency)) {
        forbidden.push(...otherTask.touches, ...otherTask.produces);
      }
    }

    return forbidden;
  }

  /**
   * Check if a file is allowed for this task
   * Handles both exact matches and directory specifications
   */
  isFileAllowed(file: string, task: Task): boolean {
    const allowedFiles = this.getAllowedFiles(task);

    for (const allowed of allowedFiles) {
      // Exact match
      if (file === allowed) {
        return true;
      }

      // Directory specification: if spec is 'src/app/', allow any file under it
      if (this._isDirectorySpec(allowed) && file.startsWith(allowed)) {
        return true;
      }

      // If the allowed spec is a file, also check if modified file is under the same directory
      // (handles cases where task specifies component.tsx but creates component.test.tsx)
      if (!this._isDirectorySpec(allowed)) {
        const allowedDir = this._getDirectory(allowed);
        const fileDir = this._getDirectory(file);
        if (isNonEmptyString(allowedDir) && allowedDir === fileDir) {
          // Same directory - might be acceptable for related files
          // But we'll still flag as a warning, not an error
          return false; // Be strict by default
        }
      }
    }

    return false;
  }

  /**
   * Check if a specification is for a directory (ends with /)
   */
  private _isDirectorySpec(spec: string): boolean {
    return spec.endsWith('/');
  }

  /**
   * Get directory path from a file path
   */
  private _getDirectory(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash > 0 ? filePath.slice(0, lastSlash + 1) : '';
  }
}
