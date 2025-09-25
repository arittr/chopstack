import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execaSync } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommitMessageGenerator } from '@/vcs/commit-message-generator';

describe('CommitMessageGenerator Integration', () => {
  let testDir: string;
  let generator: CommitMessageGenerator;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `commit-msg-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Initialize git repo in test directory
    execaSync('git', ['init'], { cwd: testDir });
    execaSync('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });
    execaSync('git', ['config', 'user.name', 'Test User'], { cwd: testDir });

    // Create generator instance
    generator = new CommitMessageGenerator({
      enableAI: true,
      aiCommand: 'claude',
      aiTimeout: 30_000,
    });
  });

  afterEach(() => {
    // Cleanup test directory
    try {
      execaSync('rm', ['-rf', testDir]);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateCommitMessage', () => {
    it('should generate commit message for simple file changes', async () => {
      // Create and stage some test files
      await writeFile(join(testDir, 'test1.ts'), 'export const test1 = "hello";');
      await writeFile(join(testDir, 'test2.ts'), 'export const test2 = "world";');
      execaSync('git', ['add', '.'], { cwd: testDir });

      const task = {
        title: 'Add test files',
        description: 'Adding two TypeScript test files',
        produces: ['test1.ts', 'test2.ts'],
      };

      const message = await generator.generateCommitMessage(task, {
        workdir: testDir,
        files: task.produces,
      });

      // Should return a properly formatted commit message
      expect(message).toBeDefined();
      expect(message).toContain('🤖 Generated with Claude via chopstack');
      expect(message).toContain('Co-Authored-By: Claude');

      // The AI-generated part should be present
      const lines = message.split('\n');
      expect(lines[0]).toBeTruthy(); // Should have a commit title
      expect(lines[0]?.length).toBeLessThanOrEqual(72); // Reasonable title length
    });

    it('should handle large prompts via stdin', async () => {
      // Create many files to generate a large prompt
      const files = [];
      for (let i = 0; i < 50; i++) {
        const filename = `component${i}.tsx`;
        await writeFile(
          join(testDir, filename),
          `export const Component${i} = () => <div>Component ${i}</div>;`,
        );
        files.push(filename);
      }
      execaSync('git', ['add', '.'], { cwd: testDir });

      const task = {
        title: 'Add multiple components',
        description: `Adding ${files.length} React component files`,
        produces: files,
      };

      const message = await generator.generateCommitMessage(task, {
        workdir: testDir,
        files: task.produces,
      });

      // Should still work with large prompts
      expect(message).toBeDefined();
      expect(message).toContain('🤖 Generated with Claude via chopstack');
    });

    it('should fall back to rule-based generation when AI fails', async () => {
      // Create generator with invalid AI command
      const failingGenerator = new CommitMessageGenerator({
        enableAI: true,
        aiCommand: 'nonexistent-command',
        aiTimeout: 1000,
      });

      await writeFile(join(testDir, 'component.tsx'), 'export const Component = () => null;');
      execaSync('git', ['add', '.'], { cwd: testDir });

      const task = {
        title: 'Add component',
        description: 'Adding a React component',
        produces: ['component.tsx'],
      };

      const message = await failingGenerator.generateCommitMessage(task, {
        workdir: testDir,
        files: task.produces,
      });

      // Should fall back to rule-based generation
      expect(message).toBeDefined();
      expect(message).toContain('🤖 Generated with Claude via chopstack');
      expect(message).toContain('Add component'); // Rule-based uses the task title
    });

    it('should handle prompts with special characters', async () => {
      // Create files with special characters in content
      await writeFile(
        join(testDir, 'config.json'),
        JSON.stringify(
          {
            special: '<<<COMMIT_MESSAGE_START>>>',
            chars: '```\n"quotes"',
            emoji: '🚀',
          },
          null,
          2,
        ),
      );
      execaSync('git', ['add', '.'], { cwd: testDir });

      const task = {
        title: 'Add configuration',
        description: 'Adding JSON config with special characters',
        produces: ['config.json'],
      };

      const message = await generator.generateCommitMessage(task, {
        workdir: testDir,
        files: task.produces,
      });

      // Should handle special characters without breaking
      expect(message).toBeDefined();
      expect(message).toContain('🤖 Generated with Claude via chopstack');
    });

    it('should respect timeout configuration', async () => {
      // Create generator with very short timeout
      const quickGenerator = new CommitMessageGenerator({
        enableAI: true,
        aiCommand: 'claude',
        aiTimeout: 1, // 1ms timeout - will definitely timeout
      });

      await writeFile(join(testDir, 'test.ts'), 'export const test = true;');
      execaSync('git', ['add', '.'], { cwd: testDir });

      const task = {
        title: 'Add test',
        description: 'Adding test file',
        produces: ['test.ts'],
      };

      // Should fall back to rule-based when timeout occurs
      const message = await quickGenerator.generateCommitMessage(task, {
        workdir: testDir,
        files: task.produces,
      });

      expect(message).toBeDefined();
      expect(message).toContain('Add test'); // Fallback uses task title
    });
  });

  describe('edge cases', () => {
    it('should handle empty git diff', async () => {
      // Don't stage any files
      const task = {
        title: 'Empty commit',
        description: 'No files changed',
        produces: [],
      };

      const message = await generator.generateCommitMessage(task, {
        workdir: testDir,
        files: [],
      });

      // Should still generate a message
      expect(message).toBeDefined();
      expect(message).toContain('🤖 Generated with Claude via chopstack');
    });

    it('should handle non-git directory gracefully', async () => {
      // Create a new directory without git init
      const nonGitDir = join(tmpdir(), `non-git-test-${Date.now()}`);
      await mkdir(nonGitDir, { recursive: true });

      const task = {
        title: 'Test task',
        description: 'Testing in non-git directory',
        produces: ['file.ts'],
      };

      // Should handle the error gracefully
      const message = await generator.generateCommitMessage(task, {
        workdir: nonGitDir,
        files: task.produces,
      });

      // Should fall back to rule-based generation
      expect(message).toBeDefined();
      expect(message).toContain('Test task');

      // Cleanup
      execaSync('rm', ['-rf', nonGitDir]);
    });
  });
});
