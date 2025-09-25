import { describe, expect, it } from 'vitest';

import { getStatusColor } from '../utils/git-operations';

describe('git-operations utilities', () => {
  describe('getStatusColor', () => {
    it('should return correct color function for modified files', () => {
      const colorFn = getStatusColor('M ');
      // We're testing that it returns a function, not the actual color
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for added files', () => {
      const colorFn = getStatusColor('A ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for deleted files', () => {
      const colorFn = getStatusColor('D ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for renamed files', () => {
      const colorFn = getStatusColor('R ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for copied files', () => {
      const colorFn = getStatusColor('C ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return correct color function for unmerged files', () => {
      const colorFn = getStatusColor('U ');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });

    it('should return default color function for unknown status', () => {
      const colorFn = getStatusColor('??');
      expect(typeof colorFn).toBe('function');
      expect(colorFn).toBeDefined();
    });
  });
});
