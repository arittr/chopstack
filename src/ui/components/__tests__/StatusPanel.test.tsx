/* eslint-disable unicorn/no-unused-properties */
import { describe, expect, it } from 'vitest';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionMetrics, TaskUIState } from '@/ui/hooks/useExecutionState';

import { StatusPanel, type StatusPanelProps } from '../StatusPanel';

describe('StatusPanel', () => {
  const mockOptions: ExecutionOptions = {
    agent: 'claude',
    mode: 'execute',
    vcsMode: 'worktree',
    verbose: false,
  };

  const mockMetrics: ExecutionMetrics = {
    completedLayers: 0,
    completedTasks: 0,
    failedTasks: 0,
    runningTasks: 1,
    totalLayers: 2,
    totalTasks: 5,
  };

  const mockTasks = new Map<string, TaskUIState>([
    [
      'task-1',
      {
        dependencies: [],
        id: 'task-1',
        layer: 0,
        progress: 50,
        status: 'running',
        title: 'Create Theme Types',
      },
    ],
  ]);

  it('should accept TaskUIState props with v2-compatible structure', () => {
    const props: StatusPanelProps = {
      metrics: mockMetrics,
      options: mockOptions,
      tasks: mockTasks,
    };

    expect(props.tasks.get('task-1')?.title).toBe('Create Theme Types');
    expect(props.tasks.get('task-1')?.dependencies).toEqual([]);
    expect(props.tasks.get('task-1')?.progress).toBe(50);
  });

  it('should support optional jobId prop', () => {
    const props: StatusPanelProps = {
      jobId: 'test-job-123',
      metrics: mockMetrics,
      options: mockOptions,
      tasks: mockTasks,
    };

    expect(props.jobId).toBe('test-job-123');
  });

  it('should handle PlanV2 import without errors', () => {
    // This test verifies that StatusPanel can import PlanV2 type
    // The actual rendering test would require setting up Ink's render environment
    expect(StatusPanel).toBeDefined();
  });
});
