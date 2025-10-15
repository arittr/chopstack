import { describe, expect, it } from 'vitest';

import type { TuiAppProps } from '../TuiApp';

import { TuiApp } from '../TuiApp';

describe('TuiApp', () => {
  it('should accept both v1 Plan and v2 PlanV2 types', () => {
    // This test verifies type compatibility without actually rendering
    // Full rendering tests would require mocking Ink's environment

    // Type assertion tests
    const v1Plan = {
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description',
          touches: [],
          produces: [],
          requires: [],
          estimatedLines: 100,
          agentPrompt: 'Prompt',
        },
      ],
    };

    const v2Plan = {
      name: 'Test Plan',
      strategy: 'parallel' as const,
      tasks: [
        {
          id: 'task-1',
          name: 'Task 1',
          complexity: 'M' as const,
          description: 'Description',
          files: ['file.ts'],
          dependencies: [],
          acceptanceCriteria: [],
        },
      ],
    };

    // Both types should be compatible with TuiAppProps.plan
    const propsWithV1: Partial<TuiAppProps> = {
      plan: v1Plan,
    };

    const propsWithV2: Partial<TuiAppProps> = {
      plan: v2Plan,
    };

    expect(propsWithV1.plan).toBeDefined();
    expect(propsWithV2.plan).toBeDefined();
  });

  it('should have TuiApp component defined', () => {
    expect(TuiApp).toBeDefined();
  });

  it('should accept union type of Plan and PlanV2', () => {
    // This is a compile-time check that TuiAppProps.plan accepts both types
    type PlanType = TuiAppProps['plan'];

    // If this compiles, the union type is working correctly
    const testPlan: PlanType = {
      tasks: [],
    };

    expect(testPlan).toBeDefined();
  });
});
