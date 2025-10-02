/**
 * Violation Reporter
 *
 * Formats file modification violations into user-friendly error messages
 */

import type { Task } from '@/types/decomposer';
import type { FileValidationResult, FileViolation } from '@/types/validation';

export class ViolationReporter {
  /**
   * Format a single violation for display
   */
  formatViolation(violation: FileViolation, _task: Task): string {
    const { file, reason, conflictingTask } = violation;

    switch (reason) {
      case 'not_in_spec': {
        return `  - Modified file '${file}' which is not in task specification`;
      }

      case 'belongs_to_other_task': {
        return `  - Modified file '${file}' which belongs to task '${conflictingTask ?? 'unknown'}'`;
      }

      case 'forbidden': {
        return `  - Modified forbidden file '${file}'`;
      }

      case 'no_changes': {
        return `  - Task reported success but made no changes`;
      }

      default: {
        return `  - Modified file '${file}' (${String(reason)})`;
      }
    }
  }

  /**
   * Create comprehensive error message for validation failure
   */
  formatValidationError(result: FileValidationResult, task: Task): string {
    const { violations, warnings } = result;

    const parts: string[] = [`❌ Task '${task.id}' failed file modification validation:`];

    // Add violations
    if (violations.length > 0) {
      parts.push('', 'Violations:');
      for (const violation of violations) {
        parts.push(this.formatViolation(violation, task));
      }
    }

    // Add allowed files info
    const allowedFiles = [...task.touches, ...task.produces];
    if (allowedFiles.length > 0) {
      parts.push('', 'Only allowed to modify:');
      for (const file of allowedFiles) {
        parts.push(`  - ${file}`);
      }
    }

    // Add warnings if any
    if (warnings.length > 0) {
      parts.push('', 'Warnings:');
      for (const warning of warnings) {
        parts.push(`  - ${warning}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Create warning message for permissive mode
   */
  formatValidationWarning(result: FileValidationResult, task: Task): string {
    const { violations } = result;

    const parts: string[] = [
      `⚠️ Task '${task.id}' has file modification violations (permissive mode):`,
    ];

    for (const violation of violations) {
      parts.push(this.formatViolation(violation, task));
    }

    return parts.join('\n');
  }
}
