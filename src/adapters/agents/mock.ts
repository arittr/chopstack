import type { Agent, DecomposeOptions, TaskResult, ValidationResult } from '@/types/agent';
import type { PlanV2 } from '@/types/schemas-v2';

/**
 * Mock agent implementation for testing
 *
 * @remarks
 * Provides a simple in-memory agent that returns predefined plans
 * without making any external API calls. Useful for testing and development.
 */
export class MockAgent implements Agent {
  // eslint-disable-next-line @typescript-eslint/require-await
  async decompose(_prompt: string, _cwd: string, _options: DecomposeOptions): Promise<PlanV2> {
    // Mock implementation for testing - returns a simple PlanV2
    const plan: PlanV2 = {
      name: 'Mock User Management Feature',
      description: 'Implement basic user management with types, CRUD, validation, and tests',
      strategy: 'phased-parallel',
      phases: [
        {
          id: 'phase-setup',
          name: 'Setup Phase',
          strategy: 'sequential',
          tasks: ['create-user-types'],
          requires: [],
        },
        {
          id: 'phase-implementation',
          name: 'Implementation Phase',
          strategy: 'sequential',
          tasks: ['create-user-crud', 'add-validation'],
          requires: ['phase-setup'],
        },
        {
          id: 'phase-testing',
          name: 'Testing Phase',
          strategy: 'sequential',
          tasks: ['write-tests'],
          requires: ['phase-implementation'],
        },
      ],
      tasks: [
        {
          id: 'create-user-types',
          name: 'Create User Types and Interfaces',
          complexity: 'S',
          description:
            'Define the User interface with id, name, email, and createdAt fields. This provides the type foundation for all user-related operations.',
          files: ['src/types/user.ts'],
          acceptanceCriteria: [
            'User interface exported with all required fields',
            'TypeScript types use strict typing with no any',
            'Fields include id (number), name (string), email (string), createdAt (Date)',
          ],
          dependencies: [],
        },
        {
          id: 'create-user-crud',
          name: 'Implement User CRUD Operations',
          complexity: 'M',
          description:
            'Create functions for creating, reading, updating, and deleting users. Implement full CRUD operations following repository pattern.',
          files: ['src/services/user-service.ts'],
          acceptanceCriteria: [
            'createUser function accepts User data and returns created User',
            'getUserById retrieves user by ID',
            'updateUser updates existing user',
            'deleteUser removes user by ID',
            'All functions properly typed with User interface',
          ],
          dependencies: ['create-user-types'],
        },
        {
          id: 'add-validation',
          name: 'Add Input Validation',
          complexity: 'S',
          description:
            'Add validation for email format and required fields. Implement validation utilities to ensure data integrity.',
          files: ['src/utils/validation.ts', 'src/services/user-service.ts'],
          acceptanceCriteria: [
            'Email validation using regex pattern',
            'Required field validation for all User fields',
            'Validation errors return clear error messages',
            'Validation integrated into user service',
          ],
          dependencies: ['create-user-crud'],
        },
        {
          id: 'write-tests',
          name: 'Write Unit Tests',
          complexity: 'M',
          description:
            'Create comprehensive unit tests for all CRUD operations and validation. Achieve 100% code coverage for critical paths.',
          files: [
            'src/services/__tests__/user-service.test.ts',
            'src/utils/__tests__/validation.test.ts',
          ],
          acceptanceCriteria: [
            'All CRUD operations have passing tests',
            'Validation logic fully tested',
            'Edge cases covered (null, undefined, invalid data)',
            'Test coverage >= 95% for user service and validation',
          ],
          dependencies: ['add-validation'],
        },
      ],
      successMetrics: {
        quantitative: [
          'Test coverage: >= 95%',
          'All type checks pass with strict mode',
          'Zero linting errors',
        ],
        qualitative: [
          'Clear separation of concerns',
          'Maintainable and readable code',
          'Follows project conventions',
        ],
      },
    };

    return plan;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(_prompt: string, files: string[], _cwd: string): Promise<TaskResult> {
    // Mock execution - simulate successful file modification
    return {
      success: true,
      filesModified: files,
      output: 'Mock task executed successfully',
      metadata: {
        executionTime: 100,
        agentType: 'mock',
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(_prompt: string, criteria: string[], _cwd: string): Promise<ValidationResult> {
    // Mock validation - all criteria pass
    return {
      passed: true,
      criteriaResults: criteria.map((criterion) => ({
        criterion,
        passed: true,
        evidence: 'Mock validation evidence - criterion automatically passed',
      })),
      summary: `All ${criteria.length} criteria passed (mock validation)`,
    };
  }
}
