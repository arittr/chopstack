import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { vi } from 'vitest';

import type { SpecifyCommandOptions } from '@/types/cli';

import { createDecomposerAgent } from '@/adapters/agents';
import { createDefaultDependencies } from '@/commands';
import { SpecifyCommand } from '@/commands/specify/specify-command';

// Mock external dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('@/adapters/agents');

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockCreateDecomposerAgent = vi.mocked(createDecomposerAgent);

describe('SpecifyCommand unit tests', () => {
  const mockSpecification = `# Feature Specification

## Overview

This is a comprehensive specification for a new feature.

## Background

Current state and problems to solve.

## Requirements

### Functional Requirements

**FR1: Core Functionality**

The system must implement the requested feature.

**FR2: Integration**

The feature must integrate with existing systems.

### Non-Functional Requirements

**NFR1: Performance**

Response time must be under 100ms.

**NFR2: Testing**

Test coverage must be at least 90%.

## Design

### Architecture

\`\`\`
┌─────────────┐
│   Feature   │
│  Component  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Existing  │
│   System    │
└─────────────┘
\`\`\`

### File Structure

- New feature files
- Tests
- Type definitions

## Success Metrics

### Quantitative

- Test coverage: 90%+
- Performance: <100ms

### Qualitative

- Clear code
- Maintainable

## Risks & Mitigations

**Risk 1: Complexity**
- Likelihood: Medium
- Impact: Medium
- Mitigation: Thorough testing

## Acceptance Criteria

- [ ] Feature implemented
- [ ] Tests passing
- [ ] Documentation updated
`;

  const mockAgent = {
    decompose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent that returns a plan with description (used as spec)
    mockAgent.decompose = vi.fn().mockImplementation(() => ({
      name: 'Specification Plan',
      description: mockSpecification,
      strategy: 'sequential',
      tasks: [],
    }));

    mockCreateDecomposerAgent.mockResolvedValue(mockAgent);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful execution', () => {
    it('should generate spec from prompt option', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add dark mode toggle to settings',
        output: 'dark-mode.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      expect(mockAgent.decompose).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('dark-mode.md'),
        mockSpecification,
        'utf8',
      );
    });

    it('should generate spec from input file', async () => {
      const inputContent = 'Add dark mode toggle to application settings';
      mockReadFile.mockResolvedValue(inputContent);

      const options: SpecifyCommandOptions = {
        input: 'brief.txt',
        output: 'feature.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('brief.txt'), 'utf8');
      expect(mockAgent.decompose).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should use custom cwd when provided', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        cwd: '/custom/path',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      // The agent should be called with the custom cwd
      expect(mockAgent.decompose).toHaveBeenCalledWith(
        expect.any(String),
        '/custom/path',
        expect.any(Object),
      );
    });

    it('should create output directory if it does not exist', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'output/nested/spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('output/nested'), {
        recursive: true,
      });
    });

    it('should complete all three steps successfully', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      // Should complete successfully
      expect(result).toBe(0);
      // Verify all services were called
      expect(mockAgent.decompose).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return exit code 1 on agent failure', async () => {
      mockAgent.decompose.mockRejectedValue(new Error('Agent failed'));

      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should return exit code 1 on file write failure', async () => {
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should return exit code 1 when input file is empty', async () => {
      mockReadFile.mockResolvedValue('   \n  \n  '); // Only whitespace

      const options: SpecifyCommandOptions = {
        input: 'empty.txt',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should return exit code 1 when input file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const options: SpecifyCommandOptions = {
        input: 'missing.txt',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(1);
    });

    it('should handle errors in verbose mode', async () => {
      const testError = new Error('Test error');
      testError.stack = 'Error: Test error\n  at test.ts:1:1';
      mockAgent.decompose.mockRejectedValue(testError);

      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        verbose: true,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      // Should return error code
      expect(result).toBe(1);
    });
  });

  describe('integration with services', () => {
    it('should call CodebaseAnalysisService with correct cwd', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        cwd: '/project/path',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // Agent should be called twice: once for codebase analysis, once for spec generation
      // Both should use the same cwd
      expect(mockAgent.decompose).toHaveBeenCalled();

      // Check that at least one call used the correct cwd
      const { calls } = mockAgent.decompose.mock;
      const cwdUsed = calls.some((call) => call[1] === '/project/path');
      expect(cwdUsed).toBe(true);
    });

    it('should call SpecificationService with prompt and cwd', async () => {
      const testPrompt = 'Build authentication system';

      const options: SpecifyCommandOptions = {
        prompt: testPrompt,
        output: 'auth-spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // The agent will be called twice: once for codebase analysis, once for spec generation
      // The second call (spec generation) should have the prompt in its spec content
      expect(mockAgent.decompose).toHaveBeenCalledTimes(2);

      // The second call is for spec generation and should include the prompt
      const secondCall = mockAgent.decompose.mock.calls[1];
      expect(secondCall?.[0]).toContain(testPrompt);
    });
  });

  describe('output formatting', () => {
    it('should write specification with correct content', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // Verify spec was written with correct content
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('spec.md'),
        mockSpecification,
        'utf8',
      );
    });

    it('should write to correct output path', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        output: 'my-spec.md',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('my-spec.md'),
        expect.any(String),
        'utf8',
      );
    });
  });
});
