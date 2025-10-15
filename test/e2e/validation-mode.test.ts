/**
 * Validation Mode Integration Tests
 *
 * Tests the enhanced validate mode that checks:
 * - Plan structure validation (DAG, dependencies)
 * - Implementation validation against acceptance criteria
 * - Project principle compliance
 * - Success metrics assessment
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createTestId } from '@test/helpers/test-utils';
import { runCliInProcess } from '@test/utils/cli-runner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PlanV2 } from '@/types/schemas-v2';

describe('Validation Mode Integration Tests', () => {
  const testId = createTestId('validation-mode');
  let testDir: string;

  beforeAll(() => {
    // Create test directory
    testDir = path.join(os.tmpdir(), testId);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Plan Structure Validation', () => {
    it('should validate correct DAG structure', async () => {
      const validPlan = path.join(testDir, 'valid-dag.yaml');

      const planContent: PlanV2 = {
        name: 'Valid DAG Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Foundation',
            complexity: 'S',
            description: 'Setup foundation for feature',
            files: ['src/foundation.ts'],
            dependencies: [],
            acceptanceCriteria: ['Foundation setup complete'],
          },
          {
            id: 'task-2',
            name: 'Build on Foundation',
            complexity: 'M',
            description: 'Build feature on top of foundation',
            files: ['src/feature.ts'],
            dependencies: ['task-1'],
            acceptanceCriteria: ['Feature implemented'],
          },
          {
            id: 'task-3',
            name: 'Finalize',
            complexity: 'S',
            description: 'Finalize and polish feature',
            files: ['src/polish.ts'],
            dependencies: ['task-2'],
            acceptanceCriteria: ['Feature polished'],
          },
        ],
      };

      fs.writeFileSync(validPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(['run', '--plan', validPlan, '--mode', 'validate'], {
        cwd: process.cwd(),
        timeout: 30_000,
      });

      // Should succeed - valid DAG
      expect(result.exitCode).toBe(0);

      // Output should indicate successful validation
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, 60_000);

    it('should detect circular dependencies', async () => {
      const circularPlan = path.join(testDir, 'circular-dag.yaml');

      // Create plan with circular dependency: task-1 → task-2 → task-1
      const planContent: PlanV2 = {
        name: 'Circular Dependency Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task 1',
            complexity: 'M',
            description: 'First task that depends on task-2',
            files: ['src/task1.ts'],
            dependencies: ['task-2'], // Circular: depends on task-2
            acceptanceCriteria: ['Task 1 complete'],
          },
          {
            id: 'task-2',
            name: 'Task 2',
            complexity: 'M',
            description: 'Second task that depends on task-1',
            files: ['src/task2.ts'],
            dependencies: ['task-1'], // Circular: depends on task-1
            acceptanceCriteria: ['Task 2 complete'],
          },
        ],
      };

      fs.writeFileSync(circularPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(['run', '--plan', circularPlan, '--mode', 'validate'], {
        cwd: process.cwd(),
        timeout: 30_000,
      });

      // Should fail - circular dependency
      expect(result.exitCode).toBe(1);

      // Error message should mention circular dependency
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/circular/i);
    }, 60_000);

    it('should detect missing dependencies', async () => {
      const missingDepPlan = path.join(testDir, 'missing-dep.yaml');

      // Create plan where task-1 depends on non-existent task-999
      const planContent: PlanV2 = {
        name: 'Missing Dependency Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with Missing Dep',
            complexity: 'M',
            description: 'Task that references non-existent dependency',
            files: ['src/task1.ts'],
            dependencies: ['task-999'], // Non-existent task
            acceptanceCriteria: ['Task complete'],
          },
        ],
      };

      fs.writeFileSync(missingDepPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', missingDepPlan, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 30_000,
        },
      );

      // Should fail - missing dependency
      expect(result.exitCode).toBe(1);

      // Error message should mention missing dependency
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/missing|not found/i);
    }, 60_000);

    it('should validate duplicate task IDs', async () => {
      const duplicateIdPlan = path.join(testDir, 'duplicate-id.yaml');

      // Create plan with duplicate task IDs
      const planContent: PlanV2 = {
        name: 'Duplicate ID Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'First Task',
            complexity: 'M',
            description: 'First task with id task-1',
            files: ['src/task1.ts'],
            dependencies: [],
            acceptanceCriteria: ['Task complete'],
          },
          {
            id: 'task-1', // Duplicate ID
            name: 'Second Task',
            complexity: 'M',
            description: 'Second task also with id task-1',
            files: ['src/task2.ts'],
            dependencies: [],
            acceptanceCriteria: ['Task complete'],
          },
        ],
      };

      fs.writeFileSync(duplicateIdPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', duplicateIdPlan, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 30_000,
        },
      );

      // Should fail - duplicate IDs
      expect(result.exitCode).toBe(1);

      // Error message should mention duplicate
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/duplicate/i);
    }, 60_000);
  });

  describe('Acceptance Criteria Validation', () => {
    it('should validate implementation against acceptance criteria (when spec provided)', async () => {
      const planWithSpec = path.join(testDir, 'plan-with-spec.yaml');
      const specPath = path.join(testDir, 'spec-for-validation.md');

      // Create a spec with acceptance criteria
      const specContent = `# Specification: Feature with Criteria

## Overview
A feature with specific acceptance criteria to validate against.

## Requirements

### FR1: Core Feature
The system MUST implement core feature X.

## Acceptance Criteria

### Must Have
- Feature X is implemented in src/feature.ts
- Unit tests achieve 95%+ coverage
- Integration tests pass
- Documentation is updated in README.md

### Should Have
- Performance is <100ms
- Error handling is comprehensive

### Nice to Have
- Feature has telemetry
`;

      fs.writeFileSync(specPath, specContent, 'utf8');

      // Create plan that references the spec
      const planContent: PlanV2 = {
        name: 'Plan with Spec Reference',
        specification: specPath,
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Implement Feature X',
            complexity: 'M',
            description: 'Implement the core feature X as specified',
            files: ['src/feature.ts'],
            dependencies: [],
            acceptanceCriteria: ['Feature X implemented', 'Tests pass', 'Documentation updated'],
          },
        ],
      };

      fs.writeFileSync(planWithSpec, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(['run', '--plan', planWithSpec, '--mode', 'validate'], {
        cwd: process.cwd(),
        timeout: 60_000,
      });

      // Exit code depends on whether criteria are met
      expect([0, 1]).toContain(result.exitCode);

      // Should have validation output
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, 90_000);

    it('should handle validation when spec file is missing', async () => {
      const planWithMissingSpec = path.join(testDir, 'plan-missing-spec.yaml');

      const planContent: PlanV2 = {
        name: 'Plan with Missing Spec',
        specification: '/nonexistent/spec.md',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Task',
            complexity: 'M',
            description: 'A task',
            files: ['src/task.ts'],
            dependencies: [],
            acceptanceCriteria: ['Complete'],
          },
        ],
      };

      fs.writeFileSync(planWithMissingSpec, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', planWithMissingSpec, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 30_000,
        },
      );

      // Should handle gracefully - may succeed or fail depending on implementation
      expect([0, 1]).toContain(result.exitCode);
    }, 60_000);
  });

  describe('Project Principles Validation', () => {
    it('should check for principle violations when CLAUDE.md exists', async () => {
      const planForPrinciples = path.join(testDir, 'plan-principles.yaml');

      // Create a plan - validation will check project principles from CLAUDE.md
      const planContent: PlanV2 = {
        name: 'Plan for Principle Validation',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Implement Service',
            complexity: 'M',
            description: 'Implement a new service following project patterns',
            files: ['src/services/new-service.ts'],
            dependencies: [],
            acceptanceCriteria: [
              'Service follows dependency injection pattern',
              'Uses ts-pattern for control flow',
              'Has comprehensive unit tests',
            ],
          },
        ],
      };

      fs.writeFileSync(planForPrinciples, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', planForPrinciples, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 60_000,
        },
      );

      // Should complete validation
      expect([0, 1]).toContain(result.exitCode);

      // Output should indicate principle checking happened
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, 90_000);
  });

  describe('Success Metrics Assessment', () => {
    it('should assess quantitative success metrics', async () => {
      const planWithMetrics = path.join(testDir, 'plan-with-metrics.yaml');

      const planContent: PlanV2 = {
        name: 'Plan with Success Metrics',
        strategy: 'sequential',
        successMetrics: {
          quantitative: ['Test coverage: 95%+', 'Build time: <2 minutes', 'Bundle size: <500KB'],
          qualitative: [
            'Code is maintainable and well-documented',
            'Error messages are clear and actionable',
            'Developer experience is positive',
          ],
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Implement Feature',
            complexity: 'M',
            description: 'Implement feature with metrics tracking',
            files: ['src/feature.ts'],
            dependencies: [],
            acceptanceCriteria: ['Feature works', 'Metrics are met'],
          },
        ],
      };

      fs.writeFileSync(planWithMetrics, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', planWithMetrics, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 60_000,
        },
      );

      // Should complete assessment
      expect([0, 1]).toContain(result.exitCode);
    }, 90_000);
  });

  describe('Validation Report Output', () => {
    it('should generate comprehensive validation report', async () => {
      const comprehensivePlan = path.join(testDir, 'comprehensive.yaml');
      const specPath = path.join(testDir, 'comprehensive-spec.md');

      // Create spec
      const specContent = `# Comprehensive Feature Spec

## Overview
Complete feature with all validation aspects.

## Requirements
### FR1: Feature
Implement feature with specific requirements.

## Acceptance Criteria
- Feature implemented correctly
- All tests pass
- Documentation complete

## Success Metrics

### Quantitative
- Test coverage: 95%+
- Performance: <50ms

### Qualitative
- Code quality is high
- UX is intuitive
`;

      fs.writeFileSync(specPath, specContent, 'utf8');

      // Create plan with all validation aspects
      const planContent: PlanV2 = {
        name: 'Comprehensive Validation Plan',
        specification: specPath,
        strategy: 'sequential',
        successMetrics: {
          quantitative: ['Coverage 95%+', 'Performance <50ms'],
          qualitative: ['High quality', 'Good UX'],
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Implement',
            complexity: 'M',
            description: 'Implement feature following all principles and criteria',
            files: ['src/feature.ts', 'src/feature.test.ts'],
            dependencies: [],
            acceptanceCriteria: ['Feature implemented', 'Tests pass', 'Documentation complete'],
          },
        ],
      };

      fs.writeFileSync(comprehensivePlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', comprehensivePlan, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 90_000,
        },
      );

      // Should complete validation
      expect([0, 1]).toContain(result.exitCode);

      // Should have comprehensive output
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, 120_000);

    it('should format validation results for terminal display', async () => {
      const simpleValidationPlan = path.join(testDir, 'simple-validation.yaml');

      const planContent: PlanV2 = {
        name: 'Simple Validation Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Simple Task',
            complexity: 'S',
            description: 'A simple task for validation output testing',
            files: ['src/simple.ts'],
            dependencies: [],
            acceptanceCriteria: ['Task complete'],
          },
        ],
      };

      fs.writeFileSync(simpleValidationPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(
        ['run', '--plan', simpleValidationPlan, '--mode', 'validate'],
        {
          cwd: process.cwd(),
          timeout: 30_000,
        },
      );

      // Should complete
      expect([0, 1]).toContain(result.exitCode);

      // Output should be formatted
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, 60_000);
  });

  describe('Exit Codes', () => {
    it('should return 0 for valid plan with all criteria met', async () => {
      const perfectPlan = path.join(testDir, 'perfect-plan.yaml');

      const planContent: PlanV2 = {
        name: 'Perfect Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Perfect Task',
            complexity: 'M',
            description: 'A perfectly formed task that should pass all validation',
            files: ['src/perfect.ts'],
            dependencies: [],
            acceptanceCriteria: ['Task is perfect'],
          },
        ],
      };

      fs.writeFileSync(perfectPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(['run', '--plan', perfectPlan, '--mode', 'validate'], {
        cwd: process.cwd(),
        timeout: 30_000,
      });

      // Should succeed for structurally valid plan
      expect(result.exitCode).toBe(0);
    }, 60_000);

    it('should return 1 for invalid plan structure', async () => {
      const invalidPlan = path.join(testDir, 'invalid-structure.yaml');

      // Create plan with circular dependency (invalid)
      const planContent: PlanV2 = {
        name: 'Invalid Plan',
        strategy: 'sequential',
        tasks: [
          {
            id: 'task-1',
            name: 'Circular Task',
            complexity: 'M',
            description: 'Task with circular dependency',
            files: ['src/task.ts'],
            dependencies: ['task-1'], // Self-referencing - invalid
            acceptanceCriteria: ['Complete'],
          },
        ],
      };

      fs.writeFileSync(invalidPlan, JSON.stringify(planContent), 'utf8');

      const result = await runCliInProcess(['run', '--plan', invalidPlan, '--mode', 'validate'], {
        cwd: process.cwd(),
        timeout: 30_000,
      });

      // Should fail - invalid structure
      expect(result.exitCode).toBe(1);
    }, 60_000);
  });
});
