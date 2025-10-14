import { describe, expect, it } from 'vitest';

import type {
  Agent,
  AgentMetadata,
  CriterionResult,
  DecomposeOptions,
  TaskResult,
  ValidationResult,
} from '../agent';
import type { PlanV2, TaskV2 } from '../schemas-v2';

import {
  agentMetadataSchema,
  criterionResultSchema,
  decomposeOptionsSchema,
  taskResultSchema,
  validationResultSchema,
} from '../agent';

describe('Agent Interface Types', () => {
  describe('DecomposeOptions', () => {
    it('should validate valid decompose options', () => {
      const options: DecomposeOptions = {
        specFile: 'dark-mode.md',
        agent: 'claude',
        maxRetries: 3,
        verbose: true,
        cwd: '/path/to/project',
      };

      const result = decomposeOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should use default values when optional fields are missing', () => {
      const minimalOptions = {
        specFile: 'spec.md',
      };

      const result = decomposeOptionsSchema.parse(minimalOptions);
      expect(result.agent).toBe('claude');
      expect(result.maxRetries).toBe(3);
      expect(result.verbose).toBe(false);
    });

    it('should reject empty specFile', () => {
      const invalidOptions = {
        specFile: '',
      };

      const result = decomposeOptionsSchema.safeParse(invalidOptions);
      expect(result.success).toBe(false);
    });

    it('should reject invalid agent type', () => {
      const invalidOptions = {
        specFile: 'spec.md',
        agent: 'invalid-agent',
      };

      const result = decomposeOptionsSchema.safeParse(invalidOptions);
      expect(result.success).toBe(false);
    });

    it('should reject negative maxRetries', () => {
      const invalidOptions = {
        specFile: 'spec.md',
        maxRetries: -1,
      };

      const result = decomposeOptionsSchema.safeParse(invalidOptions);
      expect(result.success).toBe(false);
    });

    it('should allow all valid agent types', () => {
      const agents = ['claude', 'codex', 'mock'] as const;

      for (const agent of agents) {
        const options = {
          specFile: 'spec.md',
          agent,
        };

        const result = decomposeOptionsSchema.safeParse(options);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('TaskResult', () => {
    it('should validate successful task result', () => {
      const result: TaskResult = {
        success: true,
        filesModified: ['src/types/theme.ts', 'src/types/__tests__/theme.test.ts'],
        output: 'Created theme types successfully',
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should validate failed task result with error', () => {
      const result: TaskResult = {
        success: false,
        filesModified: [],
        error: 'TypeScript compilation error',
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should validate task result with metadata', () => {
      const result: TaskResult = {
        success: true,
        filesModified: ['src/component.tsx'],
        metadata: {
          duration: 5000,
          linesAdded: 120,
          linesRemoved: 30,
        },
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should require success field', () => {
      const invalidResult = {
        filesModified: ['src/file.ts'],
      };

      const validation = taskResultSchema.safeParse(invalidResult);
      expect(validation.success).toBe(false);
    });

    it('should require filesModified field', () => {
      const invalidResult = {
        success: true,
      };

      const validation = taskResultSchema.safeParse(invalidResult);
      expect(validation.success).toBe(false);
    });
  });

  describe('CriterionResult', () => {
    it('should validate passed criterion with evidence', () => {
      const criterionResult: CriterionResult = {
        criterion: 'Types exported for light/dark/system modes',
        passed: true,
        evidence: 'Found exports: ThemeMode, LightTheme, DarkTheme in theme.ts',
      };

      const validation = criterionResultSchema.safeParse(criterionResult);
      expect(validation.success).toBe(true);
    });

    it('should validate failed criterion without evidence', () => {
      const criterionResult: CriterionResult = {
        criterion: 'All functions have JSDoc comments',
        passed: false,
      };

      const validation = criterionResultSchema.safeParse(criterionResult);
      expect(validation.success).toBe(true);
    });

    it('should require criterion and passed fields', () => {
      const invalidResult = {
        evidence: 'Some evidence',
      };

      const validation = criterionResultSchema.safeParse(invalidResult);
      expect(validation.success).toBe(false);
    });
  });

  describe('ValidationResult', () => {
    it('should validate successful validation with all criteria passed', () => {
      const validationResult: ValidationResult = {
        passed: true,
        criteriaResults: [
          {
            criterion: 'Types exported correctly',
            passed: true,
            evidence: 'All types found in exports',
          },
          {
            criterion: 'No any types used',
            passed: true,
            evidence: 'No any types detected',
          },
        ],
        summary: 'All 2 criteria passed',
      };

      const validation = validationResultSchema.safeParse(validationResult);
      expect(validation.success).toBe(true);
    });

    it('should validate failed validation with some criteria failed', () => {
      const validationResult: ValidationResult = {
        passed: false,
        criteriaResults: [
          {
            criterion: 'Types exported correctly',
            passed: true,
            evidence: 'Types found',
          },
          {
            criterion: 'JSDoc comments present',
            passed: false,
            evidence: '3 functions missing JSDoc comments',
          },
        ],
      };

      const validation = validationResultSchema.safeParse(validationResult);
      expect(validation.success).toBe(true);
    });

    it('should require passed and criteriaResults fields', () => {
      const invalidResult = {
        summary: 'Some summary',
      };

      const validation = validationResultSchema.safeParse(invalidResult);
      expect(validation.success).toBe(false);
    });
  });

  describe('AgentMetadata', () => {
    it('should validate complete agent metadata', () => {
      const metadata: AgentMetadata = {
        type: 'claude',
        version: '1.0.0',
        capabilities: {
          supportsDecompose: true,
          supportsExecute: true,
          supportsValidate: true,
          maxContextTokens: 200_000,
        },
      };

      const validation = agentMetadataSchema.safeParse(metadata);
      expect(validation.success).toBe(true);
    });

    it('should validate minimal agent metadata', () => {
      const metadata: AgentMetadata = {
        type: 'mock',
        capabilities: {
          supportsDecompose: true,
          supportsExecute: true,
          supportsValidate: false,
        },
      };

      const validation = agentMetadataSchema.safeParse(metadata);
      expect(validation.success).toBe(true);
    });

    it('should validate all agent types', () => {
      const types: Array<'claude' | 'codex' | 'mock'> = ['claude', 'codex', 'mock'];

      for (const type of types) {
        const metadata = {
          type,
          capabilities: {
            supportsDecompose: true,
            supportsExecute: true,
            supportsValidate: true,
          },
        };

        const validation = agentMetadataSchema.safeParse(metadata);
        expect(validation.success).toBe(true);
      }
    });

    it('should reject invalid agent type', () => {
      const invalidMetadata = {
        type: 'invalid-type',
        capabilities: {
          supportsDecompose: true,
          supportsExecute: true,
          supportsValidate: true,
        },
      };

      const validation = agentMetadataSchema.safeParse(invalidMetadata);
      expect(validation.success).toBe(false);
    });
  });

  describe('Agent Interface Contract', () => {
    // Mock implementation for testing interface contract
    class MockAgent implements Agent {
      async decompose(_prompt: string, _cwd: string, _options: DecomposeOptions): Promise<PlanV2> {
        // Simulate async operation
        await Promise.resolve();
        return {
          name: 'Test Plan',
          strategy: 'phased-parallel',
          tasks: [
            {
              id: 'task-1',
              name: 'Test Task',
              complexity: 'M',
              description: 'A test task with sufficient description length for validation',
              files: ['src/test.ts'],
              acceptanceCriteria: ['Criterion 1'],
              dependencies: [],
            },
          ],
        };
      }

      async execute(_prompt: string, files: string[], _cwd: string): Promise<TaskResult> {
        // Simulate async operation
        await Promise.resolve();
        return {
          success: true,
          filesModified: files,
          output: 'Task executed successfully',
        };
      }

      async validate(_prompt: string, criteria: string[], _cwd: string): Promise<ValidationResult> {
        // Simulate async operation
        await Promise.resolve();
        return {
          passed: true,
          criteriaResults: criteria.map((criterion) => ({
            criterion,
            passed: true,
            evidence: 'Mock validation evidence',
          })),
        };
      }
    }

    it('should implement decompose method', async () => {
      const agent = new MockAgent();
      const options: DecomposeOptions = {
        specFile: 'test.md',
        agent: 'mock',
        maxRetries: 3,
        verbose: false,
      };

      const plan = await agent.decompose('test prompt', '/test/cwd', options);

      expect(plan).toBeDefined();
      expect(plan.name).toBe('Test Plan');
      expect(plan.tasks).toHaveLength(1);
      expect(plan.strategy).toBe('phased-parallel');
    });

    it('should implement execute method', async () => {
      const agent = new MockAgent();
      const files = ['src/test.ts', 'src/test2.ts'];

      const result = await agent.execute('test prompt', files, '/test/cwd');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.filesModified).toEqual(files);
    });

    it('should implement validate method', async () => {
      const agent = new MockAgent();
      const criteria = ['Criterion 1', 'Criterion 2', 'Criterion 3'];

      const result = await agent.validate('test prompt', criteria, '/test/cwd');

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.criteriaResults).toHaveLength(3);
      expect(result.criteriaResults[0]?.criterion).toBe('Criterion 1');
    });

    it('should handle decompose with various option combinations', async () => {
      const agent = new MockAgent();

      // Minimal options (using defaults from schema)
      const minimalOptions = decomposeOptionsSchema.parse({
        specFile: 'spec.md',
      });
      const minimalResult = await agent.decompose('prompt', '/cwd', minimalOptions);
      expect(minimalResult.tasks.length).toBeGreaterThan(0);

      // Full options
      const fullResult = await agent.decompose('prompt', '/cwd', {
        specFile: 'spec.md',
        agent: 'mock',
        maxRetries: 5,
        verbose: true,
        cwd: '/custom/path',
      });
      expect(fullResult.tasks.length).toBeGreaterThan(0);
    });

    it('should handle execute with empty files array', async () => {
      const agent = new MockAgent();

      const result = await agent.execute('prompt', [], '/cwd');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.filesModified).toEqual([]);
    });

    it('should handle validate with empty criteria array', async () => {
      const agent = new MockAgent();

      const result = await agent.validate('prompt', [], '/cwd');

      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.criteriaResults).toEqual([]);
    });

    it('should return PlanV2 structure from decompose', async () => {
      const agent = new MockAgent();

      const options = decomposeOptionsSchema.parse({ specFile: 'spec.md' });
      const plan = await agent.decompose('prompt', '/cwd', options);

      // Verify it matches PlanV2 structure
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('strategy');
      expect(plan).toHaveProperty('tasks');
      expect(Array.isArray(plan.tasks)).toBe(true);

      const task = plan.tasks[0] as TaskV2;
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('complexity');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('files');
      expect(task).toHaveProperty('acceptanceCriteria');
      expect(task).toHaveProperty('dependencies');
    });

    it('should return TaskResult structure from execute', async () => {
      const agent = new MockAgent();

      const result = await agent.execute('prompt', ['file.ts'], '/cwd');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('filesModified');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.filesModified)).toBe(true);
    });

    it('should return ValidationResult structure from validate', async () => {
      const agent = new MockAgent();

      const result = await agent.validate('prompt', ['criterion'], '/cwd');

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('criteriaResults');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.criteriaResults)).toBe(true);

      if (result.criteriaResults.length > 0) {
        const firstResult = result.criteriaResults[0];
        if (firstResult !== undefined) {
          expect(firstResult).toHaveProperty('criterion');
          expect(firstResult).toHaveProperty('passed');
        }
      }
    });
  });

  describe('Agent Type Safety', () => {
    it('should enforce agent type constraints at compile time', () => {
      // This test verifies TypeScript type checking
      const validAgentType: 'claude' | 'codex' | 'mock' = 'claude';
      expect(['claude', 'codex', 'mock']).toContain(validAgentType);
    });

    it('should allow type-safe options construction', () => {
      const options: DecomposeOptions = {
        specFile: 'spec.md',
        agent: 'claude', // Type-safe: only 'claude' | 'codex' | 'mock' allowed
        maxRetries: 3,
        verbose: true,
      };

      // Verify all fields are used
      expect(options.specFile).toBe('spec.md');
      expect(options.agent).toBe('claude');
      expect(options.maxRetries).toBe(3);
      expect(options.verbose).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle task result with both output and error', () => {
      const result: TaskResult = {
        success: false,
        filesModified: ['src/file.ts'],
        output: 'Partial execution output',
        error: 'Failed at step 3',
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should handle validation result with mixed pass/fail criteria', () => {
      const result: ValidationResult = {
        passed: false, // Overall failed
        criteriaResults: [
          { criterion: 'Test 1', passed: true, evidence: 'Passed' },
          { criterion: 'Test 2', passed: false, evidence: 'Failed due to...' },
          { criterion: 'Test 3', passed: true },
        ],
        summary: '2 of 3 criteria passed',
      };

      const validation = validationResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should handle long file paths in task results', () => {
      const longPath = 'src/very/deep/directory/structure/with/many/levels/file.ts';
      const result: TaskResult = {
        success: true,
        filesModified: [longPath],
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should handle unicode characters in criteria', () => {
      const criterionResult: CriterionResult = {
        criterion: 'Support internationalization (i18n) with 中文, العربية, עברית',
        passed: true,
        evidence: 'Unicode support verified ✓',
      };

      const validation = criterionResultSchema.safeParse(criterionResult);
      expect(validation.success).toBe(true);
    });

    it('should handle empty strings in optional fields', () => {
      const result: TaskResult = {
        success: true,
        filesModified: [],
        output: '', // Empty string is valid
      };

      const validation = taskResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });
  });
});
