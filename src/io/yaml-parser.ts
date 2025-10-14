import { parse as parseYaml } from 'yaml';

import { planSchemaV2, type PlanV2 } from '@/types/schemas-v2';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

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
   * Parse YAML/JSON content directly to a PlanV2
   */
  static parse(content: string): PlanV2 {
    // Determine format based on content
    const trimmed = content.trim();
    const source = trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'yaml';
    return this.parseAndValidatePlan({ content, source });
  }

  /**
   * Parse and validate a plan from parsed content
   */
  static parseAndValidatePlan(parsedContent: ParsedContent): PlanV2 {
    try {
      const rawPlan = this._parseContentBySource(parsedContent);
      const validatedPlan = planSchemaV2.parse(rawPlan);

      return validatedPlan;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parsing error';
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
        // Note: This regex now needs to handle already-quoted strings properly
        processedContent = processedContent.replaceAll(
          /^(\s+agentPrompt:\s*)(.+)$/gm,
          (match: string, prefix: string, content: string) => {
            // If already quoted (starts with quote), leave it alone
            // We only check the start because multi-line quoted strings won't have the closing quote on this line
            if (/^["']/.test(content.trim())) {
              return match;
            }
            // If using block scalar (| or >), leave it alone
            if (/^[>|]/.test(content.trim())) {
              return match;
            }
            // If unquoted and has problematic characters, quote it
            if (content.includes(':') || content.includes('…')) {
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
