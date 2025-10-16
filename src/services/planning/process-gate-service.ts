import type { DecomposerAgent } from '@/core/agents/interfaces';
import type { PlanV2, ProjectPrinciples, ValidationFinding } from '@/types/schemas-v2';

import { GapAnalysisService } from '@/services/analysis/gap-analysis-service';
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
  principles?: ProjectPrinciples;
  skipGates?: boolean;
};

/**
 * Service for coordinating pre-generation and post-generation process gates.
 *
 * This service implements two quality gates in the decompose workflow:
 * 1. Pre-generation gate: Comprehensive gap analysis of specification
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
  private readonly gapAnalysisService: GapAnalysisService;
  private readonly qualityValidationService: QualityValidationService;

  constructor(agent?: DecomposerAgent) {
    this.gapAnalysisService = new GapAnalysisService(agent);
    this.qualityValidationService = new QualityValidationService();
  }

  /**
   * Check pre-generation gate (comprehensive gap analysis).
   *
   * Uses GapAnalysisService with hybrid approach:
   * - STATIC CHECKS: Required sections, placeholders, open questions (fast)
   * - LLM ANALYSIS: Context-aware gap detection (if agent provided)
   * - FALLBACK HEURISTICS: Simple pattern matching (if no agent)
   *
   * @param specContent - Specification content to check
   * @param options - Gate options (skipGates flag, optional principles)
   * @returns Gate check result with blocking flag
   */
  async checkPreGeneration(
    specContent: string,
    options: ProcessGateOptions = {},
  ): Promise<ProcessGateResult> {
    logger.debug('🚪 Checking pre-generation gate (gap analysis)...');

    // Allow bypass for testing
    if (options.skipGates === true) {
      logger.info('⏭️ Skipping pre-generation gate (skipGates=true)');
      return {
        blocking: false,
        issues: [],
        message: 'Pre-generation gate skipped',
      };
    }

    // Run comprehensive gap analysis (now async with LLM support)
    const analysisReport = await this.gapAnalysisService.analyze(specContent, options.principles);

    // Check if analysis found CRITICAL issues
    // GATE 1 blocks ONLY on CRITICAL gaps, not on completeness score
    // Completeness score is informational - helps users improve their specs
    const criticalGaps = analysisReport.gaps.filter((g) => g.severity === 'CRITICAL');

    if (isNonEmptyArray(criticalGaps)) {
      const message = this._formatPreGenerationError(analysisReport);
      logger.warn(
        `❌ Pre-generation gate failed: ${criticalGaps.length} CRITICAL gaps (${analysisReport.completeness}% complete)`,
      );
      return {
        blocking: true,
        message,
        issues: criticalGaps.map((g) => g.message),
      };
    }

    // Log warnings for non-critical gaps but allow decomposition to proceed
    const highGaps = analysisReport.gaps.filter((g) => g.severity === 'HIGH');
    const mediumGaps = analysisReport.gaps.filter((g) => g.severity === 'MEDIUM');

    if (isNonEmptyArray(highGaps) || isNonEmptyArray(mediumGaps)) {
      logger.warn(
        `⚠️ Specification has ${highGaps.length} HIGH, ${mediumGaps.length} MEDIUM gaps (non-blocking)`,
      );
      logger.warn('   These gaps may affect plan quality but will not prevent decomposition.');
      logger.warn('   Run `chopstack analyze --spec <file>` for detailed remediation guidance.');
    }

    logger.info(
      `✅ Pre-generation gate passed (${analysisReport.completeness}% complete, 0 CRITICAL gaps)`,
    );
    return {
      blocking: false,
      message: `Pre-generation gate passed: ${analysisReport.completeness}% complete`,
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
   * Format pre-generation gate error message using AnalysisReport.
   *
   * @param analysisReport - Gap analysis report
   * @returns Formatted error message
   */
  private _formatPreGenerationError(
    analysisReport: Awaited<ReturnType<typeof this.gapAnalysisService.analyze>>,
  ): string {
    const criticalGaps = analysisReport.gaps.filter((g) => g.severity === 'CRITICAL');
    const highGaps = analysisReport.gaps.filter((g) => g.severity === 'HIGH');

    const criticalGapLines: string[] = [];
    if (isNonEmptyArray(criticalGaps)) {
      criticalGapLines.push('## CRITICAL Gaps (MUST FIX)', '');
      for (const gap of criticalGaps) {
        criticalGapLines.push(`  🔴 ${gap.message}`);
        if (gap.remediation !== undefined) {
          criticalGapLines.push(`     💡 ${gap.remediation}`);
        }
      }
      criticalGapLines.push('');
    }

    const highGapLines: string[] = [];
    if (isNonEmptyArray(highGaps)) {
      highGapLines.push('## HIGH Priority Gaps (RECOMMENDED)', '');
      for (const gap of highGaps) {
        highGapLines.push(`  🟠 ${gap.message}`);
        if (gap.remediation !== undefined) {
          highGapLines.push(`     💡 ${gap.remediation}`);
        }
      }
      highGapLines.push('');
    }

    const remediationLines: string[] = [];
    if (isNonEmptyArray(analysisReport.remediation)) {
      remediationLines.push('## Remediation Steps (Prioritized)', '');
      for (const step of analysisReport.remediation.slice(0, 5)) {
        // Top 5 steps
        remediationLines.push(`  ${step.order}. [${step.priority}] ${step.action}`);
      }
      remediationLines.push('');
    }

    const lines = [
      `❌ GATE 1 FAILURE: Specification is incomplete (${analysisReport.completeness}% complete)`,
      '',
      `## Specification Analysis Report`,
      '',
      `Completeness Score: ${analysisReport.completeness}%`,
      '',
      ...criticalGapLines,
      ...highGapLines,
      ...remediationLines,
      '## Required Actions',
      '',
      '1. Review gaps and remediation steps above',
      '2. Update specification to address all CRITICAL gaps',
      '3. Optionally address HIGH priority gaps',
      '4. Re-run: chopstack analyze --spec <spec-file> to verify progress',
      '5. When completeness reaches 100%, retry: chopstack decompose --spec <spec-file>',
      '',
      '## Why This Matters',
      '',
      'Incomplete specifications lead to:',
      '  • Incomplete task breakdowns',
      '  • Mid-execution plan expansion',
      '  • Unclear requirements',
      '  • Poor task quality',
      '',
      'Resolving gaps before decomposition produces better quality plans.',
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
