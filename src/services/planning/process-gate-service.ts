import type { PlanV2, ValidationFinding } from '@/types/schemas-v2';

import { QualityValidationService } from '@/services/validation/quality-validation-service';
import { logger } from '@/utils/global-logger';
import { isNonEmptyArray } from '@/validation/guards';

/**
 * Process gate check result
 */
export type ProcessGateResult = {
  blocking: boolean;
  issues: string[];
  message: string;
};

/**
 * Process gate options
 */
export type ProcessGateOptions = {
  skipGates?: boolean;
};

/**
 * Service for coordinating pre-generation and post-generation process gates.
 *
 * This service implements two quality gates in the decompose workflow:
 * 1. Pre-generation gate: Checks for open questions in specification
 * 2. Post-generation gate: Validates task quality using QualityValidationService
 *
 * @example
 * ```typescript
 * const service = new ProcessGateService();
 *
 * // Check pre-generation gate
 * const preResult = service.checkPreGeneration(specContent);
 * if (preResult.blocking) {
 *   console.error(preResult.message);
 *   process.exit(1);
 * }
 *
 * // Check post-generation gate
 * const postResult = service.checkPostGeneration(plan);
 * if (postResult.blocking) {
 *   console.error(postResult.message);
 *   process.exit(1);
 * }
 * ```
 */
export class ProcessGateService {
  private readonly qualityValidationService: QualityValidationService;

  /**
   * Section headers to look for when parsing open questions
   */
  private readonly OPEN_QUESTIONS_HEADERS = [
    '## Open Tasks/Questions',
    '## Open Questions',
    '## Unresolved Questions',
  ];

  /**
   * Patterns to detect unresolved items
   */
  private readonly UNRESOLVED_PATTERNS = {
    uncheckedCheckbox: /- \[ ]|\[ ]/,
    questionMarkers: /\?|TODO:|TBD:/,
  };

  constructor() {
    this.qualityValidationService = new QualityValidationService();
  }

  /**
   * Check pre-generation gate (open questions in specification).
   *
   * @param specContent - Specification content to check
   * @param options - Gate options (skipGates flag)
   * @returns Gate check result with blocking flag
   */
  checkPreGeneration(specContent: string, options: ProcessGateOptions = {}): ProcessGateResult {
    logger.debug('🚪 Checking pre-generation gate (open questions)...');

    // Allow bypass for testing
    if (options.skipGates === true) {
      logger.info('⏭️ Skipping pre-generation gate (skipGates=true)');
      return {
        blocking: false,
        message: 'Pre-generation gate skipped',
        issues: [],
      };
    }

    const openQuestions = this._parseOpenQuestions(specContent);

    if (isNonEmptyArray(openQuestions)) {
      const message = this._formatPreGenerationError(openQuestions);
      logger.warn(`❌ Pre-generation gate failed: ${openQuestions.length} unresolved questions`);
      return {
        blocking: true,
        message,
        issues: openQuestions,
      };
    }

    logger.info('✅ Pre-generation gate passed (no open questions)');
    return {
      blocking: false,
      message: 'Pre-generation gate passed',
      issues: [],
    };
  }

  /**
   * Check post-generation gate (task quality validation).
   *
   * @param plan - Generated plan to validate
   * @param options - Gate options (skipGates flag)
   * @returns Gate check result with blocking flag
   */
  checkPostGeneration(plan: PlanV2, options: ProcessGateOptions = {}): ProcessGateResult {
    logger.debug('🚪 Checking post-generation gate (task quality)...');

    // Allow bypass for testing
    if (options.skipGates === true) {
      logger.info('⏭️ Skipping post-generation gate (skipGates=true)');
      return {
        blocking: false,
        message: 'Post-generation gate skipped',
        issues: [],
      };
    }

    const report = this.qualityValidationService.validate(plan);

    // Check for CRITICAL severity issues
    const criticalFindings = report.findings.filter((f) => f.severity === 'CRITICAL');

    if (isNonEmptyArray(criticalFindings)) {
      const message = this._formatPostGenerationError(report, criticalFindings);
      logger.warn(
        `❌ Post-generation gate failed: ${criticalFindings.length} CRITICAL issues found`,
      );
      return {
        blocking: true,
        message,
        issues: criticalFindings.map((f) => f.message),
      };
    }

    logger.info('✅ Post-generation gate passed (no CRITICAL issues)');
    return {
      blocking: false,
      message: 'Post-generation gate passed',
      issues: [],
    };
  }

  /**
   * Parse "Open Tasks/Questions" section from specification.
   *
   * @param specContent - Specification content
   * @returns Array of unresolved question strings
   */
  private _parseOpenQuestions(specContent: string): string[] {
    const openQuestions: string[] = [];

    // Find "Open Tasks/Questions" section
    let sectionContent: string | undefined;
    for (const header of this.OPEN_QUESTIONS_HEADERS) {
      const headerIndex = specContent.indexOf(header);
      if (headerIndex !== -1) {
        // Extract section content (from header to next ## or end of file)
        const nextHeaderIndex = specContent.indexOf('\n## ', headerIndex + header.length);
        sectionContent =
          nextHeaderIndex === -1
            ? specContent.slice(headerIndex + header.length)
            : specContent.slice(headerIndex + header.length, nextHeaderIndex);
        break;
      }
    }

    // If no section found, return empty array
    if (sectionContent === undefined) {
      return openQuestions;
    }

    // Parse lines looking for unresolved items
    const lines = sectionContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and headers
      if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
        continue;
      }

      // Check for unchecked checkboxes
      if (this.UNRESOLVED_PATTERNS.uncheckedCheckbox.test(trimmedLine)) {
        openQuestions.push(trimmedLine);
        continue;
      }

      // Check for question markers
      if (this.UNRESOLVED_PATTERNS.questionMarkers.test(trimmedLine)) {
        openQuestions.push(trimmedLine);
      }
    }

    return openQuestions;
  }

  /**
   * Format pre-generation gate error message.
   *
   * @param openQuestions - List of unresolved questions
   * @returns Formatted error message
   */
  private _formatPreGenerationError(openQuestions: string[]): string {
    const lines = [
      `❌ Cannot decompose: Specification has ${openQuestions.length} unresolved open questions`,
      '',
      'Open Questions:',
      ...openQuestions.map((q) => `  ${q}`),
      '',
      'Action Required:',
      '  1. Complete all audits and answer open questions',
      '  2. Update specification to remove items from "Open Tasks/Questions" section',
      '  3. Re-run: chopstack analyze --spec <spec-file> to verify 100% completeness',
      '  4. Then retry: chopstack decompose --spec <spec-file>',
      '',
      'Why this matters:',
      '  Open questions lead to incomplete task breakdowns and mid-execution plan expansion.',
      '  Resolving questions before decomposition produces better quality plans.',
    ];

    return lines.join('\n');
  }

  /**
   * Format post-generation gate error message.
   *
   * @param report - Quality validation report
   * @param criticalFindings - Critical severity findings
   * @returns Formatted error message
   */
  private _formatPostGenerationError(
    report: ReturnType<typeof this.qualityValidationService.validate>,
    criticalFindings: ValidationFinding[],
  ): string {
    const lines = [
      `❌ Plan is NOT ready for execution due to ${criticalFindings.length} CRITICAL issues`,
      '',
      `📊 Task Quality Report`,
      `Summary: ${report.findings.length} total issues (${criticalFindings.length} CRITICAL)`,
      '',
      '🔴 CRITICAL Issues:',
      ...criticalFindings.map((finding, index) => {
        const parts = [`  [${index + 1}] ${finding.message}`];
        if (finding.remediation !== undefined) {
          parts.push(`      💡 ${finding.remediation}`);
        }
        return parts.join('\n');
      }),
      '',
      'Recommended Actions:',
      ...criticalFindings.map(
        (finding, index) => `  ${index + 1}. ${finding.remediation ?? 'Fix this issue'}`,
      ),
      '',
      'After fixing issues, save updated plan and run:',
      '  chopstack run --plan <plan-file>',
    ];

    return lines.join('\n');
  }
}
