import {
  assertNonEmptyString,
  hasContent,
  isNonEmptyObject,
  isNonEmptyString,
  isNonNullish,
  isValidArray,
  stringEquals,
} from '../guards';

describe('guards', () => {
  describe('isNonEmptyString', () => {
    it('returns true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
    });

    it('returns false for empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('isNonNullish', () => {
    it('returns true for non-null values', () => {
      expect(isNonNullish('hello')).toBe(true);
      expect(isNonNullish(0)).toBe(true);
      expect(isNonNullish(false)).toBe(true);
      expect(isNonNullish([])).toBe(true);
      expect(isNonNullish({})).toBe(true);
    });

    it('returns false for null/undefined', () => {
      expect(isNonNullish(null)).toBe(false);
      expect(isNonNullish(undefined)).toBe(false);
    });
  });

  describe('hasContent', () => {
    it('returns true for strings with non-whitespace content', () => {
      expect(hasContent('hello')).toBe(true);
      expect(hasContent('a')).toBe(true);
      expect(hasContent(' a ')).toBe(true);
    });

    it('returns false for strings with only whitespace', () => {
      expect(hasContent('')).toBe(false);
      expect(hasContent(' ')).toBe(false);
      expect(hasContent('\t\n')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(hasContent(null)).toBe(false);
      expect(hasContent(undefined)).toBe(false);
    });
  });

  describe('isValidArray', () => {
    it('returns true for non-empty arrays', () => {
      expect(isValidArray([1])).toBe(true);
      expect(isValidArray(['a', 'b'])).toBe(true);
      expect(isValidArray([null])).toBe(true);
    });

    it('returns false for empty arrays', () => {
      expect(isValidArray([])).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidArray(null)).toBe(false);
      expect(isValidArray(undefined)).toBe(false);
    });
  });

  describe('isNonEmptyObject', () => {
    it('returns true for objects with properties', () => {
      expect(isNonEmptyObject({ a: 1 })).toBe(true);
      expect(isNonEmptyObject({ a: 1, b: 2 })).toBe(true);
    });

    it('returns false for empty objects', () => {
      expect(isNonEmptyObject({})).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isNonEmptyObject(null)).toBe(false);
      expect(isNonEmptyObject(undefined)).toBe(false);
    });
  });

  describe('stringEquals', () => {
    it('returns true for equal strings', () => {
      expect(stringEquals('hello', 'hello')).toBe(true);
      expect(stringEquals('', '')).toBe(true);
    });

    it('returns true for both null/undefined', () => {
      expect(stringEquals(null, null)).toBe(true);
      expect(stringEquals(undefined, undefined)).toBe(true);
      expect(stringEquals(null, undefined)).toBe(true);
      expect(stringEquals(undefined, null)).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(stringEquals('hello', 'world')).toBe(false);
      expect(stringEquals('hello', '')).toBe(false);
    });

    it('handles null/undefined with strings', () => {
      expect(stringEquals(null, '')).toBe(true);
      expect(stringEquals(undefined, '')).toBe(true);
      expect(stringEquals('hello', null)).toBe(false);
      expect(stringEquals('hello', undefined)).toBe(false);
    });
  });

  describe('assertNonEmptyString', () => {
    it('does not throw for non-empty strings', () => {
      expect(() => {
        assertNonEmptyString('hello');
      }).not.toThrow();
      expect(() => {
        assertNonEmptyString('a');
      }).not.toThrow();
    });

    it('throws for empty strings', () => {
      expect(() => {
        assertNonEmptyString('');
      }).toThrow('Expected non-empty string');
    });

    it('throws for null/undefined', () => {
      expect(() => {
        assertNonEmptyString(null);
      }).toThrow('Expected non-empty string');
      expect(() => {
        assertNonEmptyString(undefined);
      }).toThrow('Expected non-empty string');
    });

    it('uses custom error message', () => {
      expect(() => {
        assertNonEmptyString('', 'Custom message');
      }).toThrow('Custom message');
    });
  });
});
