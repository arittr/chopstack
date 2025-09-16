import { parse as parseYaml } from 'yaml';

import { type Plan, PlanSchema } from '../types/decomposer';

import { isNonEmptyString, isNonNullish } from './guards';

export type ParsedContent = {
  content: string;
  source: 'yaml' | 'json' | 'raw';
};

/**
 * Utility class for parsing and validating YAML plans from various sources
 */
export class YamlPlanParser {
  /**
   * Extract YAML content from markdown code blocks
   */
  static extractYamlFromMarkdown(text: string): string | null {
    const yamlMatch = text.match(/```yaml\n([\S\s]+?)\n```/);
    if (isNonNullish(yamlMatch) && isNonEmptyString(yamlMatch[1])) {
      return yamlMatch[1];
    }
    return null;
  }

  /**
   * Extract JSON content from markdown code blocks
   */
  static extractJsonFromMarkdown(text: string): string | null {
    const jsonMatch = text.match(/```json\n([\S\s]+?)\n```/);
    if (isNonNullish(jsonMatch) && isNonEmptyString(jsonMatch[1])) {
      return jsonMatch[1];
    }
    return null;
  }

  /**
   * Parse and validate a plan from parsed content
   */
  static parseAndValidatePlan(parsedContent: ParsedContent): Plan {
    console.log('🔍 Validating plan structure with Zod...');

    try {
      const rawPlan = this._parseContentBySource(parsedContent);
      const validatedPlan = PlanSchema.parse(rawPlan);
      console.log(`✅ Plan validated successfully with ${validatedPlan.tasks.length} tasks`);

      return validatedPlan;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parsing error';
      console.error(`❌ Failed to parse ${parsedContent.source}: ${message}`);
      console.error(`📤 Content for debugging:\n${parsedContent.content}`);
      throw new Error(`Failed to parse ${parsedContent.source}: ${message}`);
    }
  }

  private static _parseContentBySource(parsedContent: ParsedContent): unknown {
    switch (parsedContent.source) {
      case 'yaml':
      case 'raw': {
        // Pre-process YAML content to handle Claude's formatting issues
        let processedContent = parsedContent.content;

        // Fix agentPrompt fields that might have unquoted content with special characters
        processedContent = processedContent.replaceAll(
          /^(\s+agentPrompt:\s*)([^\n"'][^\n]*?)$/gm,
          (match: string, prefix: string, content: string) => {
            // Only quote if not already quoted and contains problematic characters
            if (!/^["']/.test(content) && (content.includes(':') || content.includes('…'))) {
              return `${prefix}"${content.replaceAll('"', '\\"')}"`;
            }
            return match;
          },
        );

        // Use yaml parser with proper options for handling long strings and complex content
        return parseYaml(processedContent, {
          strict: false,
          mapAsMap: false,
          maxAliasCount: -1,
          prettyErrors: false,
          // Allow duplicate keys (Claude might generate them)
          uniqueKeys: false,
        }) as unknown;
      }
      case 'json': {
        return JSON.parse(parsedContent.content) as unknown;
      }
      default: {
        throw new Error(`Unsupported source type: ${String(parsedContent.source)}`);
      }
    }
  }
}
