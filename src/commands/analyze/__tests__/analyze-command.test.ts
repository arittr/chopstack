/**
 * Unit tests for AnalyzeCommand
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisReport, ProjectPrinciples } from '@/types/schemas-v2';

import { AnalyzeCommand } from '../analyze-command';

// Mock file system operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock services
vi.mock('@/services/analysis/gap-analysis-service', () => ({
  GapAnalysisService: vi.fn().mockImplementation(() => ({
    analyze: vi.fn(),
  })),
}));

vi.mock('@/services/analysis/project-principles-service', () => ({
  ProjectPrinciplesService: vi.fn().mockImplementation(() => ({
    extract: vi.fn(),
  })),
}));

describe('AnalyzeCommand', () => {
  let command: AnalyzeCommand;
  let mockLogger: {
    debug?: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
  };
  let mockGapAnalysisService: { analyze: ReturnType<typeof vi.fn> };
  let mockPrinciplesService: { extract: ReturnType<typeof vi.fn> };

  const mockSpecContent = `
# Overview
This is a test specification.

## Background
Some background information here.

## Requirements
FR1: Feature requirement 1
FR2: Feature requirement 2

## Architecture
Architecture details go here.

## Acceptance Criteria
- Criterion 1
- Criterion 2
`;

  const mockPrinciples: ProjectPrinciples = {
    source: 'CLAUDE.md',
    principles: [
      {
        category: 'Code Style',
        rule: 'Use ts-pattern for complex conditional logic',
        examples: ['const result = match(value).with(...).exhaustive()'],
      },
    ],
  };

  const mockCompleteReport: AnalysisReport = {
    completeness: 100,
    gaps: [],
    remediation: [],
    summary: 'Completeness: 100% (COMPLETE) - no gaps',
  };

  const mockIncompleteReport: AnalysisReport = {
    completeness: 75,
    gaps: [
      {
        id: 'gap-missing-architecture',
        severity: 'CRITICAL',
        category: 'gap',
        message: 'Missing required section: architecture',
        artifacts: ['specification'],
        remediation: 'Add architecture section with diagrams',
      },
      {
        id: 'gap-shallow-requirements',
        severity: 'HIGH',
        category: 'gap',
        message: 'Requirements section is too brief',
        artifacts: ['specification'],
        remediation: 'Expand requirements section',
      },
    ],
    remediation: [
      {
        priority: 'CRITICAL',
        order: 1,
        action: 'Add architecture section with diagrams',
        reasoning: 'CRITICAL gap: Missing required section: architecture',
        artifacts: ['specification'],
      },
      {
        priority: 'HIGH',
        order: 2,
        action: 'Expand requirements section',
        reasoning: 'HIGH gap: Requirements section is too brief',
        artifacts: ['specification'],
      },
    ],
    summary: 'Completeness: 75% (INCOMPLETE) - 1 CRITICAL gap, 1 HIGH priority gap',
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    command = new AnalyzeCommand({
      context: {
        cwd: '/test/dir',
        logger: mockLogger,
      },
    });

    // Access private services via type cast for testing
    type CommandWithServices = {
      gapAnalysisService: { analyze: ReturnType<typeof vi.fn> };
      principlesService: { extract: ReturnType<typeof vi.fn> };
    };
    mockGapAnalysisService = (command as unknown as CommandWithServices).gapAnalysisService;
    mockPrinciplesService = (command as unknown as CommandWithServices).principlesService;

    // Setup default mocks
    vi.mocked(readFile).mockResolvedValue(mockSpecContent);
    mockPrinciplesService.extract.mockReturnValue(mockPrinciples);
    mockGapAnalysisService.analyze.mockReturnValue(mockCompleteReport);
  });

  describe('execute', () => {
    it('should read spec file and analyze completeness', async () => {
      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      const exitCode = await command.execute(options);

      expect(readFile).toHaveBeenCalledWith(resolve('test-spec.md'), 'utf8');
      expect(mockPrinciplesService.extract).toHaveBeenCalledWith('/test/dir');
      expect(mockGapAnalysisService.analyze).toHaveBeenCalledWith(mockSpecContent, mockPrinciples);
      expect(exitCode).toBe(0);
    });

    it('should return exit code 0 if completeness is 100%', async () => {
      mockGapAnalysisService.analyze.mockReturnValue(mockCompleteReport);

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      const exitCode = await command.execute(options);

      expect(exitCode).toBe(0);
    });

    it('should return exit code 1 if completeness is less than 100%', async () => {
      mockGapAnalysisService.analyze.mockReturnValue(mockIncompleteReport);

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      const exitCode = await command.execute(options);

      expect(exitCode).toBe(1);
    });

    it('should read optional codebase file if provided', async () => {
      const codebaseContent = '# Codebase Analysis\nDetails here...';
      vi.mocked(readFile).mockImplementation(async (path: Parameters<typeof readFile>[0]) => {
        // Handle FileHandle or string path
        const pathStr = typeof path === 'object' && 'fd' in path ? 'spec.md' : String(path);
        await Promise.resolve(); // Ensure async
        if (pathStr.includes('codebase')) {
          return codebaseContent;
        }
        return mockSpecContent;
      });

      const options = {
        spec: 'test-spec.md',
        codebase: 'codebase.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      expect(readFile).toHaveBeenCalledWith(resolve('test-spec.md'), 'utf8');
      expect(readFile).toHaveBeenCalledWith(resolve('codebase.md'), 'utf8');
    });

    it('should write JSON report to file if output specified', async () => {
      const options = {
        spec: 'test-spec.md',
        output: 'report.json',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      expect(writeFile).toHaveBeenCalledWith(
        resolve('report.json'),
        JSON.stringify(mockCompleteReport, null, 2),
        'utf8',
      );
    });

    it('should use custom targetDir if provided', async () => {
      const options = {
        spec: 'test-spec.md',
        targetDir: '/custom/dir',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      expect(mockPrinciplesService.extract).toHaveBeenCalledWith('/custom/dir');
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const options = {
        spec: 'nonexistent.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      const exitCode = await command.execute(options);

      expect(exitCode).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Analyze command failed: File not found'),
      );
    });

    it('should handle analysis errors gracefully', async () => {
      mockGapAnalysisService.analyze.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      const exitCode = await command.execute(options);

      expect(exitCode).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Analyze command failed: Analysis failed'),
      );
    });

    it('should support JSON format output to stdout', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'json' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockCompleteReport, null, 2));
      consoleLogSpy.mockRestore();
    });

    it('should display terminal report for text format', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockGapAnalysisService.analyze.mockReturnValue(mockIncompleteReport);

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      // Should have logged report sections
      // Note: Chalk may apply formatting, so we check that console.log was called multiple times
      expect(consoleLogSpy).toHaveBeenCalled();

      // Get all log calls and join them to check for content
      const allLogs = consoleLogSpy.mock.calls.map((call) => String(call[0] ?? '')).join(' ');
      expect(allLogs).toContain('Specification Analysis Report');
      expect(allLogs).toContain('Completeness');
      expect(allLogs).toContain('CRITICAL');

      consoleLogSpy.mockRestore();
    });

    it('should display success message for 100% complete specs', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockGapAnalysisService.analyze.mockReturnValue(mockCompleteReport);

      const options = {
        spec: 'test-spec.md',
        verbose: false,
        format: 'text' as const,
        agent: 'mock' as const,
      };

      await command.execute(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No gaps found'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ready for decomposition'),
      );

      consoleLogSpy.mockRestore();
    });
  });
});
