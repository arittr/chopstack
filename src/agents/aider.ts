import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { parse as parseYaml } from 'yaml';

import type { DecomposerAgent, Plan } from '../types/decomposer';

import { PlanSchema } from '../types/decomposer';
import { PromptBuilder } from '../types/prompts';
import { hasContent, isNonEmptyString, isNonNullish } from '../utils/guards';

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

      // Parse the YAML from Aider's response
      const yamlMatch = stdout.match(/```yaml\n([\S\s]+?)\n```/);
      if (!isNonNullish(yamlMatch) || !isNonEmptyString(yamlMatch[1])) {
        throw new Error('No YAML plan found in Aider output');
      }

      const rawPlan = parseYaml(yamlMatch[1]) as unknown;

      // Validate the plan structure using Zod schema
      const validatedPlan = PlanSchema.parse(rawPlan);

      return validatedPlan;
    } catch (error) {
      if (error instanceof Error) {
        throw new TypeError(`Aider decomposition failed: ${error.message}`);
      }
      throw new Error('Aider decomposition failed with unknown error');
    }
  }

  private _escapePrompt(prompt: string): string {
    // Escape quotes and newlines for shell command
    return prompt.replaceAll('"', '\\"').replaceAll('\n', '\\n');
  }
}
