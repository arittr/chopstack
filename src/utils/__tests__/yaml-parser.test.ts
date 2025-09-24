import { vi } from 'vitest';

import { YamlPlanParser } from '../yaml-parser';

// Mock the Zod schema validation
vi.mock('../../types/decomposer', () => ({
  PlanSchema: {
    parse: vi.fn((data: unknown) => {
      // Simple mock - return the data if it has tasks array
      if (
        data !== null &&
        data !== undefined &&
        typeof data === 'object' &&
        'tasks' in data &&
        Array.isArray((data as { tasks: unknown }).tasks)
      ) {
        return data as { tasks: unknown[] };
      }
      throw new Error('Invalid plan schema');
    }),
  },
}));

describe('YamlPlanParser', () => {
  describe('extractYamlFromMarkdown', () => {
    it('extracts YAML from code blocks', () => {
      const markdown = `
Some text before

\`\`\`yaml
tasks:
  - id: test
    title: Test task
\`\`\`

Some text after
`;

      const result = YamlPlanParser.extractYamlFromMarkdown(markdown);
      expect(result).toBe(`tasks:
  - id: test
    title: Test task`);
    });

    it('returns null if no YAML block found', () => {
      const markdown = 'No YAML here';
      const result = YamlPlanParser.extractYamlFromMarkdown(markdown);
      expect(result).toBeNull();
    });

    it('returns null if YAML block is empty', () => {
      const markdown = '```yaml\n```';
      const result = YamlPlanParser.extractYamlFromMarkdown(markdown);
      expect(result).toBeNull();
    });
  });

  describe('extractJsonFromMarkdown', () => {
    it('extracts JSON from code blocks', () => {
      const markdown = `
\`\`\`json
{
  "tasks": [
    {"id": "test", "title": "Test task"}
  ]
}
\`\`\`
`;

      const result = YamlPlanParser.extractJsonFromMarkdown(markdown);
      expect(result).toBe(`{
  "tasks": [
    {"id": "test", "title": "Test task"}
  ]
}`);
    });

    it('returns null if no JSON block found', () => {
      const markdown = 'No JSON here';
      const result = YamlPlanParser.extractJsonFromMarkdown(markdown);
      expect(result).toBeNull();
    });
  });

  describe('parseAndValidatePlan', () => {
    const mockPlan = {
      tasks: [
        {
          id: 'test-task',
          title: 'Test Task',
          description: 'A test task',
          touches: [],
          produces: ['test.ts'],
          requires: [],
          estimatedLines: 10,
          agentPrompt: 'Create a test',
        },
      ],
    };

    it('parses and validates YAML content', () => {
      const yamlContent = `tasks:
  - id: test
    title: Test
    description: A test
    touches: []
    produces: []
    requires: []
    estimatedLines: 1
    agentPrompt: test`;

      const result = YamlPlanParser.parseAndValidatePlan({
        content: yamlContent,
        source: 'yaml',
      });

      expect(result).toBeDefined();
    });

    it('parses and validates JSON content', () => {
      const jsonContent = JSON.stringify(mockPlan);

      const result = YamlPlanParser.parseAndValidatePlan({
        content: jsonContent,
        source: 'json',
      });

      expect(result).toBeDefined();
    });

    it('throws error for invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: content:';

      expect(() => {
        YamlPlanParser.parseAndValidatePlan({
          content: invalidYaml,
          source: 'yaml',
        });
      }).toThrow();
    });

    it('throws error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      expect(() => {
        YamlPlanParser.parseAndValidatePlan({
          content: invalidJson,
          source: 'json',
        });
      }).toThrow();
    });

    it('throws error for unsupported source type', () => {
      expect(() => {
        YamlPlanParser.parseAndValidatePlan({
          content: 'test',
          source: 'unsupported' as 'yaml' | 'json',
        });
      }).toThrow('Unsupported source type: unsupported');
    });
  });
});
