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
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockCreateDecomposerAgent).toHaveBeenCalledWith('claude');
      // Verify directory structure created
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.chopstack/specs/add-dark-mode-toggle-to'),
        { recursive: true },
      );
      // Verify spec.md written
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('spec.md'),
        expect.any(String),
        'utf8',
      );
      // Verify codebase.md written
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('codebase.md'),
        expect.any(String),
        'utf8',
      );
    });

    it('should generate spec from input file', async () => {
      const inputContent = 'Add dark mode toggle to application settings';
      mockReadFile.mockResolvedValue(inputContent);

      const options: SpecifyCommandOptions = {
        input: 'brief.txt',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('brief.txt'), 'utf8');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should use custom cwd when provided', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        cwd: '/custom/path',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      // Verify directory created in custom cwd
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/custom/path/.chopstack/specs/add-feature'),
        { recursive: true },
      );
    });

    it('should create output directory structure automatically', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      expect(result).toBe(0);
      // Verify .chopstack/specs/[project-name]/ created
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.chopstack/specs/add-feature'),
        { recursive: true },
      );
      // Verify notes/ subdirectory created
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.chopstack/specs/add-feature/notes'),
        { recursive: true },
      );
    });

    it('should complete all five steps successfully', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      const result = await command.execute(options);

      // Should complete successfully
      expect(result).toBe(0);
      // Verify all steps executed
      expect(mockMkdir).toHaveBeenCalled(); // Step 1: Create directories
      expect(mockCreateDecomposerAgent).toHaveBeenCalled(); // Step 2: Initialize agent
      expect(mockWriteFile).toHaveBeenCalled(); // Steps 3-4: Write files
    });
  });

  describe('error handling', () => {
    it('should return exit code 1 on agent failure', async () => {
      mockAgent.decompose.mockRejectedValue(new Error('Agent failed'));

      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
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
    it('should use correct cwd for codebase analysis', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        cwd: '/project/path',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // Verify directory created in correct cwd
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/project/path/.chopstack/specs/add-feature'),
        { recursive: true },
      );
    });

    it('should include prompt in specification generation', async () => {
      const testPrompt = 'Build authentication system';

      const options: SpecifyCommandOptions = {
        prompt: testPrompt,
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // Verify files were written
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('output formatting', () => {
    it('should write both spec.md and codebase.md', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add feature',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      // Verify spec.md written
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('spec.md'),
        expect.any(String),
        'utf8',
      );

      // Verify codebase.md written
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('codebase.md'),
        expect.any(String),
        'utf8',
      );
    });

    it('should create project-name directory from prompt', async () => {
      const options: SpecifyCommandOptions = {
        prompt: 'Add authentication system',
        verbose: false,
      };

      const deps = createDefaultDependencies();
      const command = new SpecifyCommand(deps);
      await command.execute(options);

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.chopstack/specs/add-authentication-system'),
        { recursive: true },
      );
    });
  });
});
