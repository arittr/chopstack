import { describe, expect, it, vi } from 'vitest';

import type { VcsStrategy, VcsStrategyContext } from '@/core/vcs/vcs-strategy';
import type { TaskOrchestrator } from '@/services/orchestration';
import type { VcsStrategyFactory } from '@/services/vcs/strategies/vcs-strategy-factory';

import { TaskTransitionManager } from '@/core/execution/task-transitions';

import { ExecuteModeHandlerImpl } from '../execute-mode-handler';

describe('ExecuteModeHandlerImpl base ref selection', () => {
  it('defaults to configured parent ref when none is provided', async () => {
    const mockOrchestrator: TaskOrchestrator = {
      executeTask: vi.fn(),
    } as unknown as TaskOrchestrator;

    let capturedContext: VcsStrategyContext | null = null;

    const mockStrategy: VcsStrategy = {
      initialize: vi.fn(async (_tasks, context) => {
        capturedContext = context;
        await Promise.resolve();
      }),
      prepareTaskExecutionContexts: vi.fn(async () => {
        await Promise.resolve();
        return new Map();
      }),
      prepareTaskExecution: vi.fn(async () => {
        await Promise.resolve();
        return null;
      }),
      handleTaskCompletion: vi.fn(async () => {
        await Promise.resolve();
        return { taskId: 'task' };
      }),
      finalize: vi.fn(async () => {
        await Promise.resolve();
        return { branches: [], commits: [] };
      }),
      cleanup: vi.fn(async () => {
        await Promise.resolve();
      }),
    };

    const mockFactory = {
      create: vi.fn(() => mockStrategy),
      getDefaultParentRef: vi.fn(() => 'main'),
    } as unknown as VcsStrategyFactory;

    const handler = new ExecuteModeHandlerImpl(
      mockOrchestrator,
      mockFactory,
      new TaskTransitionManager(),
    );

    await handler.handle([], {
      agentType: 'mock',
      continueOnError: false,
      cwd: '/repo',
      dryRun: false,
      maxRetries: 0,
      verbose: false,
      vcsMode: 'stacked',
    });

    expect(mockFactory.getDefaultParentRef).toHaveBeenCalled();
    expect(capturedContext).not.toBeNull();
    const { baseRef } = capturedContext as unknown as VcsStrategyContext;
    expect(baseRef).toBe('main');
  });
});
