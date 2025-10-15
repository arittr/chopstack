import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DecomposerAgent } from '@/core/agents/interfaces';
import type { PlanV2 } from '@/types/schemas-v2';

import { CodebaseAnalysisService } from '../codebase-analysis-service';

describe('CodebaseAnalysisService Integration', () => {
  let testDir: string;
  let service: CodebaseAnalysisService;
  let mockAgent: DecomposerAgent;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `codebase-analysis-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create mock agent that returns a valid plan
    mockAgent = {
      decompose: async () => {
        await Promise.resolve(); // Satisfy require-await
        return {
          name: 'Analysis Plan',
          strategy: 'sequential',
          tasks: [],
        } as PlanV2;
      },
    } as DecomposerAgent;

    // Create service
    service = new CodebaseAnalysisService(mockAgent);
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should analyze real repository structure', async () => {
    // Create package.json
    const packageJson = {
      name: 'test-project',
      description: 'A test project for integration testing',
      dependencies: {
        react: '^18.0.0',
        zod: '^3.0.0',
        'ts-pattern': '^5.0.0',
      },
      devDependencies: {
        vitest: '^1.0.0',
        tsup: '^8.0.0',
        typescript: '^5.0.0',
      },
      packageManager: 'pnpm@10.0.0',
    };

    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create directory structure
    mkdirSync(join(testDir, 'src', 'services'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'types'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'commands'), { recursive: true });
    mkdirSync(join(testDir, 'test'), { recursive: true });

    // Create .git directory
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'abc123def456\n');

    // Run analysis
    const result = await service.analyze(testDir);

    // Verify structure
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThanOrEqual(500);

    // Verify tech stack detection
    expect(result.findings.techStack.frameworks).toContain('react');
    expect(result.findings.techStack.frameworks).toContain('vitest');
    expect(result.findings.techStack.buildTools).toContain('tsup');
    expect(result.findings.techStack.buildTools).toContain('pnpm');

    // Verify architecture patterns
    expect(result.findings.architecture.patterns).toHaveLength(3);

    // Verify directory mapping
    expect(result.findings.architecture.directories).toBeDefined();
    expect(result.findings.architecture.directories['src/services']).toBe(
      'Core business logic and services',
    );
    expect(result.findings.architecture.directories['src/types']).toBe(
      'Type definitions and schemas',
    );
  });

  it('should cache analysis results correctly', async () => {
    // Create minimal package.json
    const packageJson = { name: 'test-cache', version: '1.0.0' };
    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson));

    // Create .git directory
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'commit-hash-1\n');

    // Track agent calls
    let callCount = 0;
    const trackingAgent: DecomposerAgent = {
      decompose: async () => {
        await Promise.resolve(); // Satisfy require-await
        callCount += 1;
        return {
          name: 'Analysis Plan',
          strategy: 'sequential',
          tasks: [],
        } as PlanV2;
      },
    } as DecomposerAgent;

    const trackingService = new CodebaseAnalysisService(trackingAgent);

    // First call
    const result1 = await trackingService.analyze(testDir);
    expect(callCount).toBe(1);
    expect(result1).toBeDefined();

    // Second call should use cache
    const result2 = await trackingService.analyze(testDir);
    expect(callCount).toBe(1); // Still 1, no new call
    expect(result2).toEqual(result1);
  });

  it('should invalidate cache when package.json changes', async () => {
    // Create initial package.json
    const packageJson = { name: 'test-invalidate', version: '1.0.0' };
    const packagePath = join(testDir, 'package.json');
    writeFileSync(packagePath, JSON.stringify(packageJson));

    // Create .git directory
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'commit-hash\n');

    // Track agent calls
    let callCount = 0;
    const trackingAgent: DecomposerAgent = {
      decompose: async () => {
        await Promise.resolve(); // Satisfy require-await
        callCount += 1;
        return {
          name: 'Analysis Plan',
          strategy: 'sequential',
          tasks: [],
        } as PlanV2;
      },
    } as DecomposerAgent;

    const trackingService = new CodebaseAnalysisService(trackingAgent);

    // First call
    await trackingService.analyze(testDir);
    expect(callCount).toBe(1);

    // Wait a bit to ensure mtime changes
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 100);
    });

    // Modify package.json
    writeFileSync(packagePath, JSON.stringify({ ...packageJson, version: '2.0.0' }));

    // Second call should NOT use cache
    await trackingService.analyze(testDir);
    expect(callCount).toBe(2);
  });

  it('should handle repository without package.json', async () => {
    // Create .git directory only
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'commit-hash\n');

    // Should not throw
    const result = await service.analyze(testDir);
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should handle repository without git', async () => {
    // Create package.json only
    const packageJson = { name: 'no-git-test' };
    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson));

    // Should not throw
    const result = await service.analyze(testDir);
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should extract key dependencies correctly', async () => {
    const packageJson = {
      name: 'dep-test',
      dependencies: {
        react: '^18.0.0',
        zod: '^3.0.0',
        'ts-pattern': '^5.0.0',
        chalk: '^5.0.0',
        commander: '^12.0.0',
      },
    };

    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson));
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'abc123\n');

    const result = await service.analyze(testDir);

    expect(result.findings.techStack.dependencies).toBeDefined();
    expect(result.findings.techStack.dependencies.length).toBeGreaterThan(0);
    expect(result.findings.techStack.dependencies).toContain('react');
    expect(result.findings.techStack.dependencies).toContain('zod');
  });

  it('should generate valid summary with project name', async () => {
    const packageJson = {
      name: 'awesome-project',
      description: 'An awesome project for testing',
    };

    writeFileSync(join(testDir, 'package.json'), JSON.stringify(packageJson));
    mkdirSync(join(testDir, '.git'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'HEAD'), 'abc123\n');

    const result = await service.analyze(testDir);

    expect(result.summary).toContain('awesome-project');
    expect(result.summary).toContain('An awesome project for testing');
  });
});
