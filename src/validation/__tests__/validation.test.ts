import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
  safeValidate,
  strictValidate,
  validateExecutionPlan,
  validateTaskDependencies,
  validateTaskFilePaths,
} from '../validation';

describe('Validation utilities', () => {
  describe('safeValidate', () => {
    const stringSchema = z.string();

    it('should return success result for valid data', () => {
      const result = safeValidate(stringSchema, 'hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
      expect(result.errors).toBeUndefined();
    });

    it('should return error result for invalid data', () => {
      const result = safeValidate(stringSchema, 123);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('expected string');
    });

    it('should format multiple validation errors', () => {
      const complexSchema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const result = safeValidate(complexSchema, {
        name: 123, // Wrong type
        age: -1, // Below minimum
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors![0]).toContain('name:');
      expect(result.errors![1]).toContain('age:');
    });

    it('should handle nested object validation errors', () => {
      const nestedSchema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      const result = safeValidate(nestedSchema, {
        user: { email: 'not-an-email' },
      });

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('user.email:');
    });

    it('should handle non-Zod errors gracefully', () => {
      const throwingSchema = z.string().refine(() => {
        throw new Error('Custom error');
      });

      const result = safeValidate(throwingSchema, 'test');

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('Validation error:');
    });
  });

  describe('strictValidate', () => {
    const stringSchema = z.string();

    it('should return data for valid input', () => {
      const result = strictValidate(stringSchema, 'hello');
      expect(result).toBe('hello');
    });

    it('should throw for invalid input', () => {
      expect(() => strictValidate(stringSchema, 123)).toThrow();
    });
  });

  describe('validateTaskDependencies', () => {
    it('should validate tasks with no dependencies', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['file1.ts'],
          produces: ['output1.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Second task',
          touches: ['file2.ts'],
          produces: ['output2.js'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Do task 2',
        },
      ];

      const result = validateTaskDependencies(tasks);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['task1', 'task2']);
      expect(result.errors).toBeUndefined();
    });

    it('should validate tasks with valid dependencies', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['file1.ts'],
          produces: ['lib.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create library',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Second task',
          touches: ['file2.ts'],
          produces: ['app.js'],
          requires: ['task1'],
          estimatedLines: 15,
          agentPrompt: 'Use library',
        },
      ];

      const result = validateTaskDependencies(tasks);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['task1', 'task2']);
    });

    it('should detect duplicate task IDs', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['file1.ts'],
          produces: ['output1.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
        {
          id: 'task1', // Duplicate ID
          title: 'Task 1 Again',
          description: 'Duplicate task',
          touches: ['file2.ts'],
          produces: ['output2.js'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Do duplicate task',
        },
      ];

      const result = validateTaskDependencies(tasks);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Duplicate task ID: task1');
    });

    it('should detect unknown dependencies', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['file1.ts'],
          produces: ['output1.js'],
          requires: ['nonexistent-task'], // Unknown dependency
          estimatedLines: 10,
          agentPrompt: 'Do task 1',
        },
      ];

      const result = validateTaskDependencies(tasks);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("Unknown dependency 'nonexistent-task'");
    });

    it('should handle invalid task structure', () => {
      const tasks = [
        { id: 'task1' }, // Missing required fields
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Valid task',
          touches: ['file2.ts'],
          produces: ['output2.js'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Do task 2',
        },
      ];

      const result = validateTaskDependencies(tasks);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('Task 0:');
    });
  });

  describe('validateTaskFilePaths', () => {
    it('should validate tasks with no file conflicts', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['src/file1.ts'],
          produces: ['dist/output1.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Process file1',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Second task',
          touches: ['src/file2.ts'],
          produces: ['dist/output2.js'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Process file2',
        },
      ];

      const result = validateTaskFilePaths(tasks);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        'src/file1.ts',
        'dist/output1.js',
        'src/file2.ts',
        'dist/output2.js',
      ]);
    });

    it('should detect file conflicts between tasks', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'First task',
          touches: ['shared.ts'],
          produces: ['output1.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Modify shared file',
        },
        {
          id: 'task2',
          title: 'Task 2',
          description: 'Second task',
          touches: ['shared.ts'], // Conflict!
          produces: ['output2.js'],
          requires: [],
          estimatedLines: 15,
          agentPrompt: 'Also modify shared file',
        },
      ];

      const result = validateTaskFilePaths(tasks);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain("File conflict: 'shared.ts'");
    });

    it('should detect invalid file paths with ".."', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'Malicious task',
          touches: ['../../../etc/passwd'], // Path traversal
          produces: ['output.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do bad things',
        },
      ];

      const result = validateTaskFilePaths(tasks);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain("contains '..'");
    });

    it('should validate absolute paths outside project', () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Task 1',
          description: 'External task',
          touches: ['/etc/hosts'], // Absolute path outside project
          produces: ['output.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Access system files',
        },
      ];

      const result = validateTaskFilePaths(tasks);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('outside project');
    });

    it('should skip invalid tasks gracefully', () => {
      const tasks = [
        { id: 'invalid-task' }, // Invalid task structure
        {
          id: 'task2',
          title: 'Valid Task',
          description: 'Valid task',
          touches: ['valid.ts'],
          produces: ['valid.js'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Do valid work',
        },
      ];

      const result = validateTaskFilePaths(tasks);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['valid.ts', 'valid.js']);
    });
  });

  describe('validateExecutionPlan', () => {
    it('should validate a complete valid plan', () => {
      const validPlan = {
        tasks: [
          {
            id: 'task1',
            title: 'Setup',
            description: 'Setup task',
            touches: ['setup.ts'],
            produces: ['config.json'],
            requires: [],
            estimatedLines: 20,
            agentPrompt: 'Setup the project',
          },
          {
            id: 'task2',
            title: 'Build',
            description: 'Build task',
            touches: ['build.ts'],
            produces: ['dist/app.js'],
            requires: ['task1'],
            estimatedLines: 30,
            agentPrompt: 'Build the application',
          },
        ],
      };

      const result = validateExecutionPlan(validPlan);

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect plan schema violations', () => {
      const invalidPlan = {
        // Missing tasks array
        notTasks: [],
      };

      const result = validateExecutionPlan(invalidPlan);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should aggregate validation errors from dependencies and files', () => {
      const problematicPlan = {
        tasks: [
          {
            id: 'task1',
            title: 'Task 1',
            description: 'First task',
            touches: ['shared.ts'],
            produces: ['output.js'],
            requires: ['nonexistent'], // Bad dependency
            estimatedLines: 10,
            agentPrompt: 'Do work',
          },
          {
            id: 'task2',
            title: 'Task 2',
            description: 'Second task',
            touches: ['shared.ts'], // File conflict
            produces: ['output2.js'],
            requires: [],
            estimatedLines: 15,
            agentPrompt: 'Do more work',
          },
        ],
      };

      const result = validateExecutionPlan(problematicPlan);

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(1);
      expect(result.errors!.some((e) => e.includes('Unknown dependency'))).toBe(true);
      expect(result.errors!.some((e) => e.includes('File conflict'))).toBe(true);
    });

    it('should handle null/undefined plan', () => {
      expect(validateExecutionPlan(null).success).toBe(false);
      expect(validateExecutionPlan(undefined).success).toBe(false);
    });
  });
});
