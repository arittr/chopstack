import { describe, expect, it } from 'vitest';

import type { PlanV2, TaskV2 } from '@/types/schemas-v2';

import { ProcessGateService } from '../process-gate-service';

/**
 * Helper to create test task
 */
function createTestTask(overrides: Partial<TaskV2> = {}): TaskV2 {
  return {
    id: 'test-task',
    name: 'Test Task',
    complexity: 'M',
    description:
      'This is a test task description that is long enough to pass the minimum length requirement.',
    files: ['src/test.ts'],
    acceptanceCriteria: ['Criterion 1'],
    dependencies: [],
    ...overrides,
  };
}

/**
 * Helper to create test plan
 */
function createTestPlan(tasks: TaskV2[]): PlanV2 {
  return {
    name: 'Test Plan',
    strategy: 'sequential',
    tasks,
  };
}

describe('ProcessGateService', () => {
  describe('Pre-generation gate', () => {
    describe('Section detection', () => {
      it('should detect "## Open Tasks/Questions" section', async () => {
        const service = new ProcessGateService();
        const specContent = `
# Specification

## Overview
Some content here.

## Open Tasks/Questions
- [ ] How many components need updates?
- [ ] Which state management library?

## Architecture
More content.
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
        expect(result.issues[0]).toContain('How many components');
      });

      it('should detect "## Open Questions" section', async () => {
        const service = new ProcessGateService();
        const specContent = `
# Specification

## Open Questions
- [ ] What is the database schema?

## Requirements
Content here.
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should detect "## Unresolved Questions" section', async () => {
        const service = new ProcessGateService();
        const specContent = `
# Specification

## Unresolved Questions
- [ ] Performance requirements?

## Design
Content here.
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should return no issues if section does not exist', async () => {
        const service = new ProcessGateService();
        const specContent = `
# Specification

## Overview
Complete specification without open questions.

## Requirements
All requirements are defined.
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('Unchecked checkbox detection', () => {
      it('should detect "- [ ]" pattern', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
- [ ] Question one
- [ ] Question two
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
      });

      it('should detect "[ ]" pattern without dash', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
[ ] Question without dash
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should not flag checked checkboxes "- [x]"', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
- [x] Completed question one
- [x] Completed question two
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should handle mixed checked and unchecked', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
- [x] Completed question
- [ ] Unresolved question
- [x] Another completed question
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toContain('Unresolved question');
      });
    });

    describe('Question marker detection', () => {
      it('should detect question marks', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
What is the performance requirement?
How many users will access this?
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
      });

      it('should detect "TODO:" marker', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
TODO: Complete codebase audit
TODO: Decide on state management approach
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
      });

      it('should detect "TBD:" marker', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
TBD: Database schema design
TBD: API endpoint structure
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
      });

      it('should detect mixed markers', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
What is the database schema?
TODO: Complete audit
TBD: Performance targets
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(3);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty section', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions

## Next Section
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should handle section at end of file', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Requirements
Content here.

## Open Questions
- [ ] Unresolved question
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should skip empty lines and headers', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions

### Subsection

- [ ] Actual question

`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should handle empty spec content', async () => {
        const service = new ProcessGateService();
        const specContent = '';

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('Gate bypass', () => {
      it('should bypass gate when skipGates=true', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
- [ ] Unresolved question
`;

        const result = await service.checkPreGeneration(specContent, { skipGates: true });

        expect(result.blocking).toBe(false);
        expect(result.message).toContain('skipped');
        expect(result.issues).toHaveLength(0);
      });

      it('should enforce gate when skipGates=false', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
- [ ] Unresolved question
`;

        const result = await service.checkPreGeneration(specContent, { skipGates: false });

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should enforce gate when skipGates is undefined', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
- [ ] Unresolved question
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });
    });

    describe('Error message formatting', () => {
      it('should include all unresolved questions in message', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Tasks/Questions
- [ ] Question one
- [ ] Question two
- [ ] Question three
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.message).toContain('3 unresolved');
        expect(result.message).toContain('Question one');
        expect(result.message).toContain('Question two');
        expect(result.message).toContain('Question three');
      });

      it('should include actionable guidance', async () => {
        const service = new ProcessGateService();
        const specContent = `
## Open Questions
- [ ] Unresolved
`;

        const result = await service.checkPreGeneration(specContent);

        expect(result.message).toContain('Action Required');
        expect(result.message).toContain('Complete all audits');
        expect(result.message).toContain('chopstack analyze');
        expect(result.message).toContain('Why this matters');
      });
    });
  });

  describe('Post-generation gate', () => {
    describe('CRITICAL issue detection', () => {
      it('should block on XL complexity task', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({
          id: 'xl-task',
          name: 'Huge Task',
          complexity: 'XL',
        });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toContain('XL complexity');
      });

      it('should pass with no XL tasks', () => {
        const service = new ProcessGateService();
        const tasks = [
          createTestTask({ id: 'task-1', complexity: 'S', dependencies: ['task-0'] }),
          createTestTask({ id: 'task-2', complexity: 'M', dependencies: ['task-1'] }),
          createTestTask({ id: 'task-3', complexity: 'L', dependencies: ['task-2'] }),
        ];
        const plan = createTestPlan(tasks);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should detect multiple XL tasks', () => {
        const service = new ProcessGateService();
        const tasks = [
          createTestTask({ id: 'xl-1', complexity: 'XL' }),
          createTestTask({ id: 'xl-2', complexity: 'XL' }),
        ];
        const plan = createTestPlan(tasks);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(2);
      });
    });

    describe('Non-CRITICAL issue handling', () => {
      it('should not block on HIGH severity issues', () => {
        const service = new ProcessGateService();
        const manyFilesTask = createTestTask({
          id: 'many-files',
          files: Array.from({ length: 15 }, (_, i) => `src/file-${i}.ts`),
          dependencies: ['task-0'],
        });
        const plan = createTestPlan([manyFilesTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should not block on MEDIUM severity issues', () => {
        const service = new ProcessGateService();
        const shortDescTask = createTestTask({
          description: 'Too brief',
          dependencies: ['task-0'],
        });
        const plan = createTestPlan([shortDescTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should not block on LOW severity issues', () => {
        const service = new ProcessGateService();
        const isolatedTask = createTestTask({
          complexity: 'M',
          dependencies: [],
        });
        const plan = createTestPlan([isolatedTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('Gate bypass', () => {
      it('should bypass gate when skipGates=true', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({ complexity: 'XL' });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan, { skipGates: true });

        expect(result.blocking).toBe(false);
        expect(result.message).toContain('skipped');
        expect(result.issues).toHaveLength(0);
      });

      it('should enforce gate when skipGates=false', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({ complexity: 'XL' });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan, { skipGates: false });

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });

      it('should enforce gate when skipGates is undefined', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({ complexity: 'XL' });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(true);
        expect(result.issues).toHaveLength(1);
      });
    });

    describe('Error message formatting', () => {
      it('should format error with CRITICAL issues', () => {
        const service = new ProcessGateService();
        const tasks = [
          createTestTask({ id: 'xl-1', complexity: 'XL' }),
          createTestTask({ id: 'xl-2', complexity: 'XL' }),
        ];
        const plan = createTestPlan(tasks);

        const result = service.checkPostGeneration(plan);

        expect(result.message).toContain('NOT ready for execution');
        expect(result.message).toContain('2 CRITICAL');
        expect(result.message).toContain('🔴 CRITICAL Issues');
        expect(result.message).toContain('Recommended Actions');
      });

      it('should include remediation suggestions', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({ complexity: 'XL' });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.message).toContain('💡');
        expect(result.message).toContain('Split');
      });

      it('should include next steps', () => {
        const service = new ProcessGateService();
        const xlTask = createTestTask({ complexity: 'XL' });
        const plan = createTestPlan([xlTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.message).toContain('After fixing issues');
        expect(result.message).toContain('chopstack run');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty plan', () => {
        const service = new ProcessGateService();
        // This will actually fail Zod validation since plans need at least 1 task,
        // but let's test the service behavior with a minimal valid plan
        const minimalPlan = createTestPlan([createTestTask({ complexity: 'S', dependencies: [] })]);

        const result = service.checkPostGeneration(minimalPlan);

        // S complexity with no deps does not trigger CRITICAL, only LOW
        expect(result.blocking).toBe(false);
      });

      it('should handle plan with perfect tasks', () => {
        const service = new ProcessGateService();
        const perfectTask = createTestTask({
          complexity: 'M',
          files: ['src/test.ts'],
          description: 'A well-written description that explains what and why in detail',
          dependencies: ['task-0'],
        });
        const plan = createTestPlan([perfectTask]);

        const result = service.checkPostGeneration(plan);

        expect(result.blocking).toBe(false);
        expect(result.issues).toHaveLength(0);
      });
    });
  });

  describe('Integration scenarios', () => {
    describe('Both gates pass', () => {
      it('should pass pre-generation with complete spec', async () => {
        const service = new ProcessGateService();
        const completeSpec = `
# Specification

## Overview
Complete specification.

## Requirements
All requirements defined.

## Architecture
Architecture is documented.
`;

        const preResult = await service.checkPreGeneration(completeSpec);

        expect(preResult.blocking).toBe(false);
      });

      it('should pass post-generation with quality plan', () => {
        const service = new ProcessGateService();
        const qualityPlan = createTestPlan([
          createTestTask({
            id: 'task-1',
            complexity: 'M',
            dependencies: ['task-0'],
          }),
          createTestTask({
            id: 'task-2',
            complexity: 'S',
            dependencies: ['task-1'],
          }),
        ]);

        const postResult = service.checkPostGeneration(qualityPlan);

        expect(postResult.blocking).toBe(false);
      });
    });

    describe('Both gates fail', () => {
      it('should fail pre-generation with open questions', async () => {
        const service = new ProcessGateService();
        const incompleteSpec = `
## Open Questions
- [ ] Unresolved question
`;

        const preResult = await service.checkPreGeneration(incompleteSpec);

        expect(preResult.blocking).toBe(true);
      });

      it('should fail post-generation with XL tasks', () => {
        const service = new ProcessGateService();
        const poorPlan = createTestPlan([createTestTask({ complexity: 'XL' })]);

        const postResult = service.checkPostGeneration(poorPlan);

        expect(postResult.blocking).toBe(true);
      });
    });

    describe('Both gates bypass', () => {
      it('should bypass both gates with skipGates=true', async () => {
        const service = new ProcessGateService();
        const incompleteSpec = `
## Open Questions
- [ ] Unresolved question
`;
        const poorPlan = createTestPlan([createTestTask({ complexity: 'XL' })]);

        const preResult = await service.checkPreGeneration(incompleteSpec, { skipGates: true });
        const postResult = service.checkPostGeneration(poorPlan, { skipGates: true });

        expect(preResult.blocking).toBe(false);
        expect(postResult.blocking).toBe(false);
      });
    });
  });
});
