import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecomposerAgent } from '@/core/agents/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { CodebaseAnalysisService } from '../codebase-analysis-service';

// Mock dependencies
vi.mock('@/adapters/vcs/git-wrapper');
vi.mock('@/utils/global-logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('node:fs');
vi.mock('node:crypto');

describe('CodebaseAnalysisService', () => {
  let service: CodebaseAnalysisService;
  let mockAgent: DecomposerAgent;

  beforeEach(() => {
    // Create mock agent
    mockAgent = {
      decompose: vi.fn(),
    } as unknown as DecomposerAgent;

    // Create service instance
    service = new CodebaseAnalysisService(mockAgent);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('analyze', () => {
    it('should return cached analysis if cache is valid', async () => {
      // Setup
      const cwd = '/test/project';

      // Mock file system to return consistent values
      const { readFileSync, statSync } = await import('node:fs');
      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: { zod: '^3.0.0' },
          });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      // Mock agent to return plan with analysis
      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      // First call should hit agent
      const result1 = await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(1);
      expect(result1).toBeDefined();

      // Second call with same cwd should use cache
      const result2 = await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(1); // Still 1, no new call
      expect(result2).toEqual(result1);
    });

    it('should invalidate cache when git commit changes', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');
      let commitHash = 'abc123';

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return commitHash;
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      // First call
      await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(1);

      // Change commit hash
      commitHash = 'def456';

      // Second call should not use cache
      await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache when package.json mtime changes', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');
      let mtime = 1_234_567_890;

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockImplementation(
        () =>
          ({
            mtimeMs: mtime,
          }) as ReturnType<typeof statSync>,
      );

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      // First call
      await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(1);

      // Change mtime
      mtime = 9_999_999_999;

      // Second call should not use cache
      await service.analyze(cwd);
      expect(mockAgent.decompose).toHaveBeenCalledTimes(2);
    });

    it('should handle git operations failure gracefully', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      // Mock git read to fail
      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          throw new Error('Git read failed');
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      // Should not throw
      const result = await service.analyze(cwd);
      expect(result).toBeDefined();
    });

    it('should handle missing package.json gracefully', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          throw new Error('File not found');
        }
        return '';
      });

      // Make statSync also fail for package.json
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      // Should not throw
      const result = await service.analyze(cwd);
      expect(result).toBeDefined();
    });

    it('should retry analysis on agent failure', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      // Fail first 2 attempts, succeed on 3rd
      vi.mocked(mockAgent.decompose)
        .mockRejectedValueOnce(new Error('Agent error 1'))
        .mockRejectedValueOnce(new Error('Agent error 2'))
        .mockResolvedValueOnce({
          name: 'Test Plan',
          strategy: 'sequential',
          tasks: [],
        } as PlanV2);

      // Should eventually succeed
      const result = await service.analyze(cwd);
      expect(result).toBeDefined();
      expect(mockAgent.decompose).toHaveBeenCalledTimes(3);
    });

    it('should throw after 3 failed retry attempts', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      // Fail all attempts
      vi.mocked(mockAgent.decompose).mockRejectedValue(new Error('Agent failure'));

      // Should throw after 3 attempts
      await expect(service.analyze(cwd)).rejects.toThrow(
        'Failed to analyze codebase after 3 attempts',
      );
      expect(mockAgent.decompose).toHaveBeenCalledTimes(3);
    });

    it('should detect all major frameworks from package.json', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            dependencies: {
              react: '^18.0.0',
              zod: '^3.0.0',
            },
            devDependencies: {
              vitest: '^1.0.0',
              tsup: '^8.0.0',
            },
          });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      const result = await service.analyze(cwd);

      // Check that frameworks are detected
      expect(result.findings.techStack.frameworks).toContain('react');
      expect(result.findings.techStack.frameworks).toContain('vitest');
      expect(result.findings.techStack.buildTools).toContain('tsup');
    });

    it('should identify architecture patterns', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      const result = await service.analyze(cwd);

      // Check that at least 3 patterns are identified
      expect(result.findings.architecture.patterns).toHaveLength(3);
      expect(result.findings.architecture.patterns).toContain('Service Layer');
      expect(result.findings.architecture.patterns).toContain('Dependency Injection');
      expect(result.findings.architecture.patterns).toContain('Adapter Pattern');
    });

    it('should generate 500+ character summary', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            description: 'A test project for unit testing',
          });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      const result = await service.analyze(cwd);

      // Verify summary is 500+ characters
      expect(result.summary.length).toBeGreaterThanOrEqual(500);
    });

    it('should validate analysis has all required fields', async () => {
      const cwd = '/test/project';

      const { readFileSync, statSync } = await import('node:fs');

      vi.mocked(readFileSync).mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
        if (String(path).endsWith('.git/HEAD')) {
          return 'abc123';
        }
        if (String(path).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });

      vi.mocked(statSync).mockReturnValue({
        mtimeMs: 1_234_567_890,
      } as ReturnType<typeof statSync>);

      vi.mocked(mockAgent.decompose).mockResolvedValue({
        name: 'Test Plan',
        strategy: 'sequential',
        tasks: [],
      } as PlanV2);

      const result = await service.analyze(cwd);

      // Verify all required fields are present
      expect(result.summary).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.observations).toBeDefined();
      expect(result.examples).toBeDefined();
      expect(result.relatedFeatures).toBeDefined();
    });
  });
});
