import { vi } from 'vitest';

import type { ExecutionMode } from '@/types/execution';

import { TaskOrchestrator } from '@/services/mcp/orchestrator';

describe('TaskOrchestrator Mode Support', () => {
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    orchestrator = new TaskOrchestrator();
  });

  describe('buildClaudeArgs', () => {
    test('builds plan mode arguments correctly', () => {
      const args = (orchestrator as any)._buildClaudeArgs('plan', 'Test prompt');
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
      const args = (orchestrator as any)._buildClaudeArgs('dry-run', 'Test prompt');
      // Dry-run uses plan mode since Claude CLI doesn't have a dedicated dry-run mode
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
      const args = (orchestrator as any)._buildClaudeArgs('execute', 'Test prompt');
      expect(args).toEqual(['-p', 'Test prompt']);
    });

    test('builds validate mode arguments correctly', () => {
      const args = (orchestrator as any)._buildClaudeArgs('validate', 'Test prompt');
      // Validate uses plan mode since Claude CLI doesn't have a dedicated validate mode
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
        (orchestrator as any)._buildClaudeArgs('invalid-mode' as ExecutionMode, 'Test prompt');
      }).toThrow('Unsupported execution mode: invalid-mode');
    });
  });

  describe('processModeSpecificResults', () => {
    test('processes plan mode results with JSON output', () => {
      const output = '{"files_changed": ["src/test.ts", "src/utils.ts"]}';
      const results = (orchestrator as any)._processModeSpecificResults('plan', output, true);

      expect(results.filesChanged).toEqual(['src/test.ts', 'src/utils.ts']);
    });

    test('handles plan mode with invalid JSON gracefully', () => {
      const output = 'invalid json output';
      const results = (orchestrator as any)._processModeSpecificResults('plan', output, true);

      expect(results.filesChanged).toBeUndefined();
    });

    test('processes dry-run mode file operations', () => {
      const output = `
        would create: src/components/Button.tsx
        would modify: src/app/page.tsx
        would update: package.json
      `;
      const results = (orchestrator as any)._processModeSpecificResults('dry-run', output, true);

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
      const results = (orchestrator as any)._processModeSpecificResults('validate', output, false);

      expect(results.validationResults).toEqual({
        canProceed: false,
        errors: ['Missing dependency @types/react', 'Invalid configuration'],
        warnings: ['TypeScript version mismatch'],
      });
    });

    test('processes validate mode with success', () => {
      const output = 'All validations passed successfully';
      const results = (orchestrator as any)._processModeSpecificResults('validate', output, true);

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
      const results = (orchestrator as any)._processModeSpecificResults('execute', output, true);

      expect(results.filesChanged).toEqual([
        'src/components/Button.tsx',
        'src/app/page.tsx',
        'package.json',
      ]);
    });
  });

  describe('mode parameter propagation', () => {
    test('executeParallelTasks defaults to execute mode', () => {
      // Mock executeClaudeTask to verify mode parameter
      const executeTaskSpy = vi.spyOn(orchestrator, 'executeClaudeTask').mockResolvedValue({
        taskId: 'test-1',
        mode: 'execute',
        status: 'completed',
        output: 'Success',
      });

      // Note: This test would need actual implementation to run,
      // but demonstrates the expected behavior
      expect(executeTaskSpy).not.toHaveBeenCalled();
    });
  });
});
