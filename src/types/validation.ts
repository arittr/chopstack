/**
 * File modification validation types
 *
 * Types for validating that tasks only modify files within their declared scope
 */

export type FileViolationReason =
  | 'not_in_spec'
  | 'belongs_to_other_task'
  | 'forbidden'
  | 'no_changes';

export type FileViolation = {
  conflictingTask?: string;
  file: string;
  reason: FileViolationReason;
};

export type FileValidationResult = {
  valid: boolean;
  violations: FileViolation[];
  warnings: string[];
};

export type ValidationMode = 'strict' | 'permissive';

export type ValidationConfig = {
  allowDependencyFiles: boolean;
  allowNewFiles: boolean;
  mode: ValidationMode;
};
