/**
 * Type guard utilities for strict boolean expressions
 */

export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNonNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function hasContent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

export function isNonEmptyArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

export function isNonEmptyObject<T extends Record<string, unknown>>(
  value: T | null | undefined,
): value is T {
  return isNonNullish(value) && Object.keys(value).length > 0;
}

/**
 * Safe string comparison that handles nullish values
 */
export function stringEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '') === (b ?? '');
}

/**
 * Check if a value is a non-empty string or throw an error
 */
export function assertNonEmptyString(
  value: string | null | undefined,
  message = 'Expected non-empty string',
): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new Error(message);
  }
}
