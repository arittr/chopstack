import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { DecomposerAgent, Plan } from '../types/decomposer';

import { PromptBuilder } from '../types/prompts';
import { AgentNotFoundError, PlanParsingError } from '../utils/errors';
import { hasContent } from '../utils/guards';
import { YamlPlanParser } from '../utils/yaml-parser';

const execAsync = promisify(exec);

export class AiderDecomposer implements DecomposerAgent {
  async decompose(specContent: string, cwd: string): Promise<Plan> {
    const prompt = PromptBuilder.buildDecompositionPrompt(specContent);

    try {
      // Use Aider with --dry-run flag to analyze without editing
      const command = `aider --message "${this._escapePrompt(prompt)}" --dry-run --yes`;
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 1024 * 1024, // 1MB buffer for large outputs
      });

      if (hasContent(stderr)) {
        console.warn('Aider stderr:', stderr);
      }

      // Parse and validate the YAML from Aider's response
      const yamlContent = YamlPlanParser.extractYamlFromMarkdown(stdout);
      if (yamlContent === null) {
        throw new PlanParsingError('No YAML plan found in Aider output', stdout);
      }

      return YamlPlanParser.parseAndValidatePlan({
        content: yamlContent,
        source: 'yaml',
      });
    } catch (error) {
      if (error instanceof PlanParsingError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AgentNotFoundError('aider', error);
      }
      throw new AgentNotFoundError('aider');
    }
  }

  private _escapePrompt(prompt: string): string {
    // Escape quotes and newlines for shell command
    return prompt.replaceAll('"', '\\"').replaceAll('\n', '\\n');
  }
}
