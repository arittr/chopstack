import { describe, expect, it } from 'vitest';

import { PromptBuilder } from '../prompts';

describe('PromptBuilder', () => {
  describe('buildDecompositionPrompt', () => {
    it('should include the specification in the prompt', () => {
      const spec = 'Add user authentication system';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain('FEATURE SPECIFICATION:');
      expect(prompt).toContain(spec);
    });

    it('should include task rules and guidelines', () => {
      const spec = 'Add API endpoints';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain('parallelizable subtasks');
      expect(prompt).toContain('MUST NOT modify the same files');
      expect(prompt).toContain('max ~200 lines');
      expect(prompt).toContain('architectural layers');
    });

    it('should include YAML structure definition', () => {
      const spec = 'Create components';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain('```yaml');
      expect(prompt).toContain('tasks:');
      expect(prompt).toContain('- id: string');
      expect(prompt).toContain('title: string');
      expect(prompt).toContain('description: string');
      expect(prompt).toContain('touches: [list');
      expect(prompt).toContain('produces: [list');
      expect(prompt).toContain('requires: [list');
      expect(prompt).toContain('estimatedLines: number');
      expect(prompt).toContain('agentPrompt: string');
    });

    it('should include file path quoting examples', () => {
      const spec = 'Update routes';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain('Always quote file paths');
      expect(prompt).toContain('[id]/route.ts');
      expect(prompt).toContain('user.service.ts');
      expect(prompt).toContain('(quoted because of [])');
      expect(prompt).toContain('(no quotes needed)');
    });

    it('should emphasize YAML-only output', () => {
      const spec = 'Add tests';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain('DO NOT MAKE ANY EDITS');
      expect(prompt).toContain('Output ONLY the YAML plan');
      expect(prompt).toContain('no other text or edits');
    });

    it('should handle empty specification', () => {
      const prompt = PromptBuilder.buildDecompositionPrompt('');

      expect(prompt).toContain('FEATURE SPECIFICATION:');
      expect(prompt).toContain('\n\n'); // Empty spec should still have proper formatting
    });

    it('should handle multi-line specification', () => {
      const spec = `Add user authentication:
      - Login form
      - JWT tokens
      - Protected routes`;

      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain(spec);
      expect(prompt).toContain('Login form');
      expect(prompt).toContain('JWT tokens');
    });

    it('should handle special characters in specification', () => {
      const spec = 'Add API for users/[id]/profile with {brackets} and "quotes"';
      const prompt = PromptBuilder.buildDecompositionPrompt(spec);

      expect(prompt).toContain(spec);
      expect(prompt).toContain('{brackets}');
      expect(prompt).toContain('"quotes"');
    });
  });

  describe('buildClaudeCodePrompt', () => {
    it('should include the spec file path', () => {
      const specFile = 'features/auth.md';
      const prompt = PromptBuilder.buildClaudeCodePrompt(specFile);

      expect(prompt).toContain(`Read the specification in ${specFile}`);
    });

    it('should include key instructions', () => {
      const specFile = 'spec.md';
      const prompt = PromptBuilder.buildClaudeCodePrompt(specFile);

      expect(prompt).toContain('Analyze the current codebase');
      expect(prompt).toContain('conflict-free task breakdown');
      expect(prompt).toContain('Output only YAML');
      expect(prompt).toContain('no edits');
    });

    it('should handle different file extensions', () => {
      const specFile = 'requirements.txt';
      const prompt = PromptBuilder.buildClaudeCodePrompt(specFile);

      expect(prompt).toContain(specFile);
    });

    it('should handle file paths with spaces', () => {
      const specFile = 'specs/feature spec.md';
      const prompt = PromptBuilder.buildClaudeCodePrompt(specFile);

      expect(prompt).toContain(specFile);
    });

    it('should be concise compared to decomposition prompt', () => {
      const specFile = 'spec.md';
      const claudePrompt = PromptBuilder.buildClaudeCodePrompt(specFile);
      const decompPrompt = PromptBuilder.buildDecompositionPrompt('test spec');

      expect(claudePrompt.length).toBeLessThan(decompPrompt.length);
    });
  });

  describe('buildAiderPrompt', () => {
    it('should include the spec file with /read command', () => {
      const specFile = 'features/payments.md';
      const prompt = PromptBuilder.buildAiderPrompt(specFile);

      expect(prompt.startsWith(`/read ${specFile}`)).toBe(true);
    });

    it('should include task breakdown instructions', () => {
      const specFile = 'spec.md';
      const prompt = PromptBuilder.buildAiderPrompt(specFile);

      expect(prompt).toContain('Create a task breakdown');
      expect(prompt).toContain('implementing this specification');
      expect(prompt).toContain('repository structure');
      expect(prompt).toContain('existing code');
    });

    it('should specify YAML output format', () => {
      const specFile = 'spec.md';
      const prompt = PromptBuilder.buildAiderPrompt(specFile);

      expect(prompt).toContain('Output a YAML plan');
      expect(prompt).toContain('parallelizable tasks');
    });

    it('should emphasize no edits policy', () => {
      const specFile = 'spec.md';
      const prompt = PromptBuilder.buildAiderPrompt(specFile);

      expect(prompt).toContain('Do not make any edits');
      expect(prompt).toContain('only output the plan');
    });

    it('should handle file paths with special characters', () => {
      const specFile = 'specs/[auth] feature.md';
      const prompt = PromptBuilder.buildAiderPrompt(specFile);

      expect(prompt).toContain(`/read ${specFile}`);
    });

    it('should be shorter than decomposition prompt', () => {
      const specFile = 'spec.md';
      const aiderPrompt = PromptBuilder.buildAiderPrompt(specFile);
      const decompPrompt = PromptBuilder.buildDecompositionPrompt('test spec');

      expect(aiderPrompt.length).toBeLessThan(decompPrompt.length);
    });
  });

  describe('prompt consistency', () => {
    it('should all emphasize YAML output', () => {
      const specFile = 'spec.md';
      const spec = 'test feature';

      const decomp = PromptBuilder.buildDecompositionPrompt(spec);
      const claude = PromptBuilder.buildClaudeCodePrompt(specFile);
      const aider = PromptBuilder.buildAiderPrompt(specFile);

      expect(decomp.toLowerCase()).toContain('yaml');
      expect(claude.toLowerCase()).toContain('yaml');
      expect(aider.toLowerCase()).toContain('yaml');
    });

    it('should all prohibit making edits', () => {
      const specFile = 'spec.md';
      const spec = 'test feature';

      const decomp = PromptBuilder.buildDecompositionPrompt(spec);
      const claude = PromptBuilder.buildClaudeCodePrompt(specFile);
      const aider = PromptBuilder.buildAiderPrompt(specFile);

      expect(decomp.toLowerCase()).toMatch(/no.*edit|not.*edit|only.*plan/);
      expect(claude.toLowerCase()).toMatch(/no.*edit|not.*edit|only.*yaml/);
      expect(aider.toLowerCase()).toMatch(/no.*edit|not.*edit|only.*plan/);
    });

    it('should all mention task breakdown or decomposition', () => {
      const specFile = 'spec.md';
      const spec = 'test feature';

      const decomp = PromptBuilder.buildDecompositionPrompt(spec);
      const claude = PromptBuilder.buildClaudeCodePrompt(specFile);
      const aider = PromptBuilder.buildAiderPrompt(specFile);

      expect(decomp.toLowerCase()).toMatch(/breakdown|decompos/);
      expect(claude.toLowerCase()).toMatch(/breakdown|decompos/);
      expect(aider.toLowerCase()).toMatch(/breakdown|decompos/);
    });
  });
});
