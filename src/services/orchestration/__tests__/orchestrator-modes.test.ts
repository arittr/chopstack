import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ExecutionMode } from '@/core/execution/types';

import {
  ClaudeCliTaskExecutionAdapter,
  type StreamingUpdate,
  type TaskExecutionAdapter,
  type TaskExecutionRequest,
  TaskOrchestrator,
} from '@/services/orchestration';

describe('ClaudeCliTaskExecutionAdapter', () => {
  let adapter: ClaudeCliTaskExecutionAdapter;

  beforeEach(() => {
    adapter = new ClaudeCliTaskExecutionAdapter();
  });

  describe('_buildClaudeArgs', () => {
    test('builds plan mode arguments correctly', () => {
      const args = (adapter as any)._buildClaudeArgs('plan', 'Test prompt');
      expect(args).toEqual([
        '-p',
        '--permission-mode',
        'plan',
        '--output-format',
        'json',
        'Test prompt',
      ]);
    });

    test('builds dry-run mode arguments correctly', () => {
      const args = (adapter as any)._buildClaudeArgs('dry-run', 'Test prompt');
      expect(args).toEqual([
        '-p',
        '--permission-mode',
        'plan',
        '--output-format',
        'json',
        'Test prompt',
      ]);
    });

    test('builds execute mode arguments correctly', () => {
      const args = (adapter as any)._buildClaudeArgs('execute', 'Test prompt');
      expect(args).toEqual(['-p', '--permission-mode', 'bypassPermissions', 'Test prompt']);
    });

    test('builds validate mode arguments correctly', () => {
      const args = (adapter as any)._buildClaudeArgs('validate', 'Test prompt');
      expect(args).toEqual([
        '-p',
        '--permission-mode',
        'plan',
        '--output-format',
        'json',
        'Test prompt',
      ]);
    });

    test('throws error for unsupported mode', () => {
      expect(() => {
        (adapter as any)._buildClaudeArgs('invalid-mode' as ExecutionMode, 'Test prompt');
      }).toThrow('Unsupported execution mode: invalid-mode');
    });
  });

  describe('_processModeSpecificResults', () => {
    test('processes plan mode results with JSON output', () => {
      const output = '{"files_changed": ["src/test.ts", "src/utils.ts"]}';
      const results = (adapter as any)._processModeSpecificResults('plan', output, true);

      expect(results.filesChanged).toEqual(['src/test.ts', 'src/utils.ts']);
    });

    test('handles plan mode with invalid JSON gracefully', () => {
      const output = 'invalid json output';
      const results = (adapter as any)._processModeSpecificResults('plan', output, true);

      expect(results.filesChanged).toBeUndefined();
    });

    test('processes dry-run mode file operations', () => {
      const output = `
        would create: src/components/Button.tsx
        would modify: src/app/page.tsx
        would update: package.json
      `;
      const results = (adapter as any)._processModeSpecificResults('dry-run', output, true);

      expect(results.filesChanged).toEqual([
        'src/components/Button.tsx',
        'src/app/page.tsx',
        'package.json',
      ]);
    });

    test('processes validate mode with errors and warnings', () => {
      const output = `
        error: Missing dependency @types/react
        warning: TypeScript version mismatch
        error: Invalid configuration
      `;
      const results = (adapter as any)._processModeSpecificResults('validate', output, false);

      expect(results.validationResults).toEqual({
        canProceed: false,
        errors: ['Missing dependency @types/react', 'Invalid configuration'],
        warnings: ['TypeScript version mismatch'],
      });
    });

    test('processes validate mode with success', () => {
      const output = 'All validations passed successfully';
      const results = (adapter as any)._processModeSpecificResults('validate', output, true);

      expect(results.validationResults).toEqual({
        canProceed: true,
        errors: [],
        warnings: [],
      });
    });

    test('processes execute mode file operations', () => {
      const output = `
        created: src/components/Button.tsx
        modified: src/app/page.tsx
        updated: package.json
      `;
      const results = (adapter as any)._processModeSpecificResults('execute', output, true);

      expect(results.filesChanged).toEqual([
        'src/components/Button.tsx',
        'src/app/page.tsx',
        'package.json',
      ]);
    });
  });
});

describe('TaskOrchestrator', () => {
  test('executeTask defaults to execute mode', async () => {
    const executeSpy = vi.fn(
      async (request: TaskExecutionRequest, emitUpdate: (update: StreamingUpdate) => void) => {
        emitUpdate({
          taskId: request.taskId,
          type: 'status',
          data: 'completed',
          timestamp: new Date(),
        });

        await Promise.resolve();

        return {
          taskId: request.taskId,
          mode: request.mode,
          status: 'completed' as const,
        };
      },
    );

    const adapter: TaskExecutionAdapter = {
      executeTask: executeSpy,
      stopTask: vi.fn().mockReturnValue(true),
    };

    const orchestrator = new TaskOrchestrator(adapter);

    await orchestrator.executeTask('task-1', 'Task 1', 'Prompt', []);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'execute' }),
      expect.any(Function),
    );
  });
});
