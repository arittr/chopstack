import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectPrinciplesService } from '../project-principles-service';

// Mock fs operations
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('ProjectPrinciplesService', () => {
  let service: ProjectPrinciplesService;

  beforeEach(() => {
    service = new ProjectPrinciplesService();
    vi.clearAllMocks();
  });

  describe('extract', () => {
    it('should extract principles from CLAUDE.md when present', () => {
      const cwd = '/test/repo';
      const mockContent = `# CLAUDE.md

## Code Style Requirements

- Use ts-pattern for complex conditional logic instead of switch statements
- All public functions must have explicit return types
- Prefer type over interface for simple shapes

## Architecture Patterns

- Use Dependency Injection for service instantiation
- Follow the Adapter pattern for external system integration

\`\`\`typescript
const result = match(value).with(...).exhaustive();
\`\`\`
`;

      vi.mocked(statSync).mockImplementation((path) => {
        if (path === join(cwd, 'CLAUDE.md')) {
          return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
        }
        throw new Error('File not found');
      });

      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.source).toBe('CLAUDE.md');
      expect(result.principles.length).toBeGreaterThanOrEqual(5);

      // Check that principles were categorized (don't assert specific categories since content varies)
      const categories = new Set(result.principles.map((p) => p.category));
      expect(categories.size).toBeGreaterThan(0);
    });

    it('should fall back to .cursorrules when CLAUDE.md not found', () => {
      const cwd = '/test/repo';
      const mockContent = `# Project Rules

- Always use named exports (no default exports)
- Test files must be co-located in __tests__ directories
`;

      vi.mocked(statSync).mockImplementation((path) => {
        if (path === join(cwd, '.cursorrules')) {
          return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
        }
        throw new Error('File not found');
      });

      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.source).toBe('.cursorrules');
      expect(result.principles.length).toBeGreaterThan(0);
    });

    it('should fall back to CONTRIBUTING.md when other files not found', () => {
      const cwd = '/test/repo';
      const mockContent = `# Contributing Guidelines

## Code Standards

1. All code must pass ESLint checks before committing
2. Write comprehensive unit tests for all new features
3. Follow the existing architecture patterns
`;

      vi.mocked(statSync).mockImplementation((path) => {
        if (path === join(cwd, 'CONTRIBUTING.md')) {
          return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
        }
        throw new Error('File not found');
      });

      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.source).toBe('CONTRIBUTING.md');
      expect(result.principles.length).toBeGreaterThan(0);
    });

    it('should return empty principles when no files found', () => {
      const cwd = '/test/repo';

      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = service.extract(cwd);

      expect(result.source).toBe('none');
      expect(result.principles).toEqual([]);
    });

    it('should categorize principles correctly', () => {
      const cwd = '/test/repo';
      const mockContent = `
- Use ts-pattern for complex conditional logic with exhaustive matching
- Follow Dependency Injection pattern for services and adapters
- Write unit tests for all business logic using Vitest framework
- Add JSDoc comments to all public APIs for documentation clarity
- Use type over interface for simple shapes in TypeScript
- Always use named exports instead of default exports in modules
- Handle errors gracefully with proper error types and throw statements
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      // Verify all principles were extracted
      expect(result.principles.length).toBe(7);

      // Verify categories were assigned
      const categories = new Set(result.principles.map((p) => p.category));
      expect(categories.size).toBeGreaterThan(1); // Multiple different categories

      // Verify some key categories are present
      const hasArchitecture = result.principles.some((p) => p.category === 'Architecture');
      const hasTesting = result.principles.some((p) => p.category === 'Testing');
      const hasDocumentation = result.principles.some((p) => p.category === 'Documentation');
      const hasTypeSystem = result.principles.some((p) => p.category === 'Type System');
      const hasModuleSystem = result.principles.some((p) => p.category === 'Module System');
      const hasErrorHandling = result.principles.some((p) => p.category === 'Error Handling');

      expect(hasArchitecture).toBe(true);
      expect(hasTesting).toBe(true);
      expect(hasDocumentation).toBe(true);
      expect(hasTypeSystem).toBe(true);
      expect(hasModuleSystem).toBe(true);
      expect(hasErrorHandling).toBe(true);
    });

    it('should extract code examples when present', () => {
      const cwd = '/test/repo';
      const mockContent = `
- Use pattern matching for control flow

\`\`\`typescript
const result = match(value)
  .with('foo', () => 'FOO')
  .with('bar', () => 'BAR')
  .exhaustive();
\`\`\`

- Another principle without example
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      const principleWithExample = result.principles.find((p) =>
        p.rule.includes('pattern matching'),
      );

      expect(principleWithExample).toBeDefined();
      expect(principleWithExample?.examples).toBeDefined();
      expect(principleWithExample?.examples?.[0]).toContain('match(value)');
    });

    it('should handle numbered lists', () => {
      const cwd = '/test/repo';
      const mockContent = `
## Coding Standards

1. Always use strict TypeScript configuration
2. Prefer functional programming patterns over imperative
3. Use Zod for runtime validation of external data
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.principles.length).toBeGreaterThanOrEqual(3);
      expect(result.principles.some((p) => p.rule.includes('TypeScript'))).toBe(true);
      expect(result.principles.some((p) => p.rule.includes('functional'))).toBe(true);
      expect(result.principles.some((p) => p.rule.includes('Zod'))).toBe(true);
    });

    it('should handle bold statements as principles', () => {
      const cwd = '/test/repo';
      const mockContent = `
**IMPORTANT**: Always validate user input before processing
**Pattern Matching**: Use ts-pattern for exhaustive type checking
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.principles.length).toBeGreaterThanOrEqual(2);
      expect(result.principles.some((p) => p.rule.includes('validate user input'))).toBe(true);
      expect(result.principles.some((p) => p.rule.includes('ts-pattern'))).toBe(true);
    });

    it('should filter out non-principle items', () => {
      const cwd = '/test/repo';
      const mockContent = `
- https://example.com/docs
- See the documentation
- Example:
- 95% test coverage
- Use ts-pattern for complex conditional logic
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      // Should only extract the actual principle, not URLs, references, etc.
      expect(result.principles.length).toBe(1);
      expect(result.principles[0]?.rule).toContain('ts-pattern');
    });
  });

  describe('caching', () => {
    it('should cache principles based on file mtime', () => {
      const cwd = '/test/repo';
      const mockContent = '- Use pattern matching for control flow';

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      // First call
      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(1);

      // Second call with same mtime - should use cache
      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(1); // No additional read
    });

    it('should invalidate cache when file is modified', () => {
      const cwd = '/test/repo';
      const mockContent = '- Use pattern matching for control flow';

      // First call with mtime 1000
      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(1);

      // Second call with different mtime - should invalidate cache
      vi.mocked(statSync).mockReturnValue({ mtimeMs: 2000 } as ReturnType<typeof statSync>);

      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(2); // Cache invalidated
    });

    it('should maintain separate caches for different files', () => {
      const cwd = '/test/repo';
      const mockContent = '- Use pattern matching for control flow';

      // Cache CLAUDE.md
      vi.mocked(statSync).mockImplementation((path) => {
        if (path === join(cwd, 'CLAUDE.md')) {
          return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
        }
        throw new Error('File not found');
      });
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(1);

      // Switch to .cursorrules (different file)
      vi.mocked(statSync).mockImplementation((path) => {
        if (path === join(cwd, '.cursorrules')) {
          return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
        }
        throw new Error('File not found');
      });

      service.extract(cwd);
      expect(readFileSync).toHaveBeenCalledTimes(2); // Different file, different cache
    });
  });

  describe('real-world patterns', () => {
    it('should extract principles from complex CLAUDE.md format', () => {
      const cwd = '/test/repo';
      const mockContent = `# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Code Style Requirements

### Pattern Matching with ts-pattern

**ALWAYS use ts-pattern for complex conditional logic** instead of switch statements:

\`\`\`typescript
import { match, P } from 'ts-pattern';

const result = match(command)
  .with({ type: 'init' }, (cmd) => handleInit(cmd))
  .with({ type: 'stack' }, (cmd) => handleStack(cmd))
  .exhaustive();
\`\`\`

### TypeScript Guidelines

- Use type over interface for simple shapes
- All public functions must have explicit return types
- Use const assertions and as const for immutable data
- **ALWAYS use utils/guards.ts** for type guards instead of inline checks

## Testing Strategy

- Co-locate tests next to source files in __tests__ directories
- Use Vitest for all testing (not Jest)
- Unit tests should achieve 95%+ coverage
- Integration tests validate real class interactions
`;

      vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000 } as ReturnType<typeof statSync>);
      vi.mocked(readFileSync).mockReturnValue(mockContent);

      const result = service.extract(cwd);

      expect(result.principles.length).toBeGreaterThanOrEqual(7);

      // Check that various principles were extracted and categorized
      const categories = new Set(result.principles.map((p) => p.category));
      expect(categories.size).toBeGreaterThanOrEqual(2); // At least 2 different categories

      // Check that code example was extracted
      const patternMatchingPrinciple = result.principles.find((p) => p.rule.includes('ts-pattern'));
      expect(patternMatchingPrinciple?.examples).toBeDefined();
    });
  });
});
