import { describe, expect, it } from 'vitest';

import type { TuiAppProps } from '../TuiApp';

import { TuiApp } from '../TuiApp';

describe('TuiApp', () => {
  it('should accept v2 PlanV2 type', () => {
    // This test verifies type compatibility without actually rendering
    // Full rendering tests would require mocking Ink's environment

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

    // v2 type should be compatible with TuiAppProps.plan
    const propsWithV2: Partial<TuiAppProps> = {
      plan: v2Plan,
    };

    expect(propsWithV2.plan).toBeDefined();
  });

  it('should have TuiApp component defined', () => {
    expect(TuiApp).toBeDefined();
  });

  it('should accept PlanV2 type', () => {
    // This is a compile-time check that TuiAppProps.plan accepts PlanV2
    type PlanType = TuiAppProps['plan'];

    // If this compiles, the type is working correctly
    const testPlan: PlanType = {
      name: 'Test',
      strategy: 'parallel' as const,
      tasks: [],
    };

    expect(testPlan).toBeDefined();
  });
});
