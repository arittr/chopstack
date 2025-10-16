import type { DecomposerAgent } from '@/core/agents/interfaces';
import type {
  AnalysisReport,
  Gap,
  ProjectPrinciples,
  RemediationStep,
  Severity,
} from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { hasContent, isNonEmptyArray, isNonEmptyString, isNonNullish } from '@/validation/guards';

/**
 * Section requirement definition
 */
type SectionRequirement = {
  minLength: number;
  name: string;
  patterns: string[];
};

/**
 * Service for analyzing specification completeness and detecting gaps.
 *
 * Uses a hybrid approach combining fast static checks with intelligent LLM analysis:
 *
 * STATIC CHECKS (Fast, deterministic):
 * - Missing required sections (CRITICAL)
 * - Placeholder text detection (CRITICAL)
 * - Unchecked open questions (CRITICAL)
 * - Content depth validation (HIGH)
 * - Cross-reference consistency (MEDIUM)
 *
 * LLM-POWERED ANALYSIS (Context-aware, intelligent):
 * - Vague requirements detection (understands RFC 2119 vs ambiguity)
 * - Architecture decision gaps (identifies missing design choices)
 * - Scope ambiguities (finds unclear boundaries)
 * - Implicit assumptions (surfaces hidden dependencies)
 * - Technical depth assessment (evaluates completeness contextually)
 *
 * @example
 * ```typescript
 * const agent = createDecomposerAgent('claude');
 * const service = new GapAnalysisService(agent);
 * const report = await service.analyze(specContent, principles);
 *
 * console.log(report.completeness); // 75
 * console.log(report.gaps.length); // 3
 * console.log(report.remediation[0].priority); // 'CRITICAL'
 * ```
 */
export class GapAnalysisService {
  constructor(private readonly _agent?: DecomposerAgent) {}
  /**
   * Required sections with their detection patterns and minimum lengths
   */
  private readonly REQUIRED_SECTIONS: SectionRequirement[] = [
    { name: 'Overview', patterns: ['# Overview', '## Overview'], minLength: 100 },
    { name: 'Background', patterns: ['# Background', '## Background'], minLength: 150 },
    {
      name: 'Requirements',
      patterns: ['# Requirements', '## Requirements', '## Functional Requirements'],
      minLength: 200,
    },
    {
      name: 'Architecture',
      patterns: ['# Architecture', '## Architecture', '# Design', '## Design'],
      minLength: 200,
    },
    {
      name: 'Acceptance Criteria',
      patterns: ['# Acceptance Criteria', '## Acceptance Criteria'],
      minLength: 100,
    },
  ];

  /**
   * Ambiguous terms that indicate incomplete specifications
   */
  private readonly AMBIGUOUS_TERMS = [
    'should',
    'maybe',
    'possibly',
    'probably',
    'TBD',
    'TODO',
    'might',
    'could be',
    'perhaps',
  ];

  /**
   * Placeholder patterns that indicate incomplete content
   */
  private readonly PLACEHOLDER_PATTERNS = [
    /\?{3}/g,
    /\[fill this in]/gi,
    /\[todo]/gi,
    /\[tbd]/gi,
    /\[placeholder]/gi,
    /\[to be determined]/gi,
  ];

  /**
   * Analyze specification completeness and generate report.
   *
   * Uses hybrid approach:
   * 1. Fast static checks (CRITICAL gaps that block decomposition)
   * 2. LLM-powered analysis (context-aware gap detection) - if agent provided
   * 3. Fallback heuristics (simple pattern matching) - if no agent
   *
   * @param specContent - Full markdown specification content
   * @param principles - Optional project principles for validation
   * @returns Comprehensive analysis report with gaps and remediation steps
   */
  async analyze(specContent: string, principles?: ProjectPrinciples): Promise<AnalysisReport> {
    logger.debug('🔍 Starting specification gap analysis...');

    const gaps: Gap[] = [];

    // PHASE 1: FAST STATIC CHECKS (required, deterministic)
    logger.debug('  Phase 1: Running static checks...');

    // 1. Check required sections (CRITICAL)
    const sectionGaps = this._checkRequiredSections(specContent);
    gaps.push(...sectionGaps);

    // 2. Find placeholder text (CRITICAL)
    const placeholderGaps = this._detectPlaceholders(specContent);
    gaps.push(...placeholderGaps);

    // 3. Parse open questions (CRITICAL)
    const openQuestionGaps = this._parseOpenQuestions(specContent);
    gaps.push(...openQuestionGaps);

    // 4. Validate cross-references (MEDIUM)
    const crossRefGaps = this._validateCrossReferences(specContent);
    gaps.push(...crossRefGaps);

    // PHASE 2: INTELLIGENT ANALYSIS (context-aware)
    logger.debug('  Phase 2: Running intelligent analysis...');

    if (isNonNullish(this._agent)) {
      // Use LLM for context-aware gap detection
      logger.debug('    Using LLM agent for intelligent analysis');
      const llmGaps = await this._analyzeWithAgent(specContent, principles);
      gaps.push(...llmGaps);
    } else {
      // Fallback to simple heuristics
      logger.debug('    No agent provided, using fallback heuristics');

      // Validate content depth (HIGH)
      const depthGaps = this._checkContentDepth(specContent);
      gaps.push(...depthGaps);

      // Detect ambiguous language (MEDIUM - brittle without LLM)
      const ambiguityGaps = this._detectAmbiguousLanguage(specContent);
      gaps.push(...ambiguityGaps);

      // Check principle violations if provided (MEDIUM - brittle without LLM)
      if (isNonNullish(principles) && isNonEmptyArray(principles.principles)) {
        const principleGaps = this._checkPrincipleViolations(specContent, principles);
        gaps.push(...principleGaps);
      }
    }

    // Calculate completeness score
    const completeness = this._calculateCompleteness(specContent, gaps);

    // Generate remediation steps
    const remediation = this._generateRemediationSteps(gaps);

    // Generate summary
    const summary = this._generateSummary(completeness, gaps);

    logger.info(`✅ Analysis complete: ${completeness}% complete, ${gaps.length} gaps found`);

    return {
      completeness,
      gaps,
      remediation,
      summary,
    };
  }

  /**
   * Check for required sections
   */
  private _checkRequiredSections(specContent: string): Gap[] {
    const gaps: Gap[] = [];

    for (const section of this.REQUIRED_SECTIONS) {
      const hasSection = section.patterns.some((pattern) => specContent.includes(pattern));

      if (!hasSection) {
        gaps.push({
          id: `gap-missing-${section.name.toLowerCase().replaceAll(/\s+/g, '-')}`,
          severity: 'CRITICAL',
          category: 'gap',
          message: `Missing required section: ${section.name}`,
          artifacts: ['specification'],
          remediation: `Add ${section.name} section with detailed information (minimum ${section.minLength} characters)`,
        });
      }
    }

    return gaps;
  }

  /**
   * Validate content depth (minimum character counts per section)
   */
  private _checkContentDepth(specContent: string): Gap[] {
    const gaps: Gap[] = [];

    for (const section of this.REQUIRED_SECTIONS) {
      const sectionContent = this._extractSectionContent(specContent, section.patterns);

      if (isNonNullish(sectionContent) && sectionContent.length < section.minLength) {
        gaps.push({
          id: `gap-shallow-${section.name.toLowerCase().replaceAll(/\s+/g, '-')}`,
          severity: 'HIGH',
          category: 'gap',
          message: `${section.name} section is too brief (${sectionContent.length} chars, minimum ${section.minLength})`,
          artifacts: ['specification'],
          remediation: `Expand ${section.name} section with more detail to meet minimum ${section.minLength} characters`,
        });
      }
    }

    return gaps;
  }

  /**
   * Extract section content from markdown
   */
  private _extractSectionContent(content: string, patterns: string[]): string | null {
    for (const pattern of patterns) {
      const sectionIndex = content.indexOf(pattern);
      if (sectionIndex === -1) {
        continue;
      }

      // Determine the header level of current section
      const headerMatch = pattern.match(/^#+/);
      const headerLevel = (headerMatch?.[0] ?? '#').length;

      // Find next section header at same or higher level
      const remainingContent = content.slice(sectionIndex + pattern.length);
      const nextSectionRegex = new RegExp(`\\n#{1,${headerLevel}}\\s+`, 'm');
      const nextSectionMatch = remainingContent.match(nextSectionRegex);

      const sectionContent =
        nextSectionMatch?.index !== undefined
          ? remainingContent.slice(0, nextSectionMatch.index)
          : remainingContent;

      return sectionContent.trim();
    }

    return null;
  }

  /**
   * Detect ambiguous language
   */
  private _detectAmbiguousLanguage(specContent: string): Gap[] {
    const gaps: Gap[] = [];
    const foundTerms = new Set<string>();

    // Case-insensitive search for ambiguous terms
    const lowerContent = specContent.toLowerCase();

    for (const term of this.AMBIGUOUS_TERMS) {
      // Match whole words only
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = lowerContent.match(regex);

      if (isNonNullish(matches) && matches.length > 0) {
        foundTerms.add(term);
      }
    }

    if (foundTerms.size > 0) {
      gaps.push({
        id: 'gap-ambiguous-language',
        severity: 'MEDIUM',
        category: 'ambiguity',
        message: `Ambiguous language detected: ${[...foundTerms].join(', ')}`,
        artifacts: ['specification'],
        remediation: 'Replace ambiguous terms with concrete, specific language (MUST/SHOULD/COULD)',
      });
    }

    return gaps;
  }

  /**
   * Detect placeholder text
   */
  private _detectPlaceholders(specContent: string): Gap[] {
    const gaps: Gap[] = [];
    const foundPlaceholders: string[] = [];

    for (const pattern of this.PLACEHOLDER_PATTERNS) {
      const matches = specContent.match(pattern);
      if (isNonNullish(matches) && matches.length > 0 && isNonNullish(matches[0])) {
        foundPlaceholders.push(matches[0]);
      }
    }

    if (foundPlaceholders.length > 0) {
      gaps.push({
        id: 'gap-placeholder-text',
        severity: 'CRITICAL',
        category: 'gap',
        message: `Placeholder text found: ${foundPlaceholders.join(', ')}`,
        artifacts: ['specification'],
        remediation: 'Replace all placeholder text with actual content',
      });
    }

    return gaps;
  }

  /**
   * Parse open questions/tasks from specification
   */
  private _parseOpenQuestions(specContent: string): Gap[] {
    const gaps: Gap[] = [];

    // Look for "Open Tasks/Questions" section
    const openSectionPatterns = [
      '## Open Tasks/Questions',
      '## Open Questions',
      '## Unresolved Questions',
      '## Open Tasks',
    ];

    let openSectionContent: string | null = null;

    for (const pattern of openSectionPatterns) {
      const content = this._extractSectionContent(specContent, [pattern]);
      if (isNonNullish(content) && hasContent(content)) {
        openSectionContent = content;
        break;
      }
    }

    if (isNonNullish(openSectionContent)) {
      // Count unchecked checkboxes (but not checked ones with [x])
      const uncheckedBoxes = openSectionContent.match(/- \[ ]/g);
      const questionMarks = openSectionContent.match(/\?/g);

      const uncheckedCount = uncheckedBoxes?.length ?? 0;
      const questionCount = questionMarks?.length ?? 0;

      if (uncheckedCount > 0 || questionCount > 0) {
        gaps.push({
          id: 'gap-open-questions',
          severity: 'CRITICAL',
          category: 'gap',
          message: `Unresolved open questions found (${uncheckedCount} unchecked items, ${questionCount} questions)`,
          artifacts: ['specification'],
          remediation:
            'Resolve all open questions and remove them from the "Open Tasks/Questions" section',
        });
      }
    }

    return gaps;
  }

  /**
   * Validate cross-references between sections
   */
  private _validateCrossReferences(specContent: string): Gap[] {
    const gaps: Gap[] = [];

    // Extract requirement IDs (FR1, FR2, NFR1, etc.)
    const requirementIds = this._extractRequirementIds(specContent);

    if (requirementIds.length === 0) {
      // No requirements found or they're not properly numbered
      return gaps;
    }

    // Check for numbering gaps (FR1, FR2, FR4 - missing FR3)
    const numberingGaps = this._findNumberingGaps(requirementIds);
    if (numberingGaps.length > 0) {
      gaps.push({
        id: 'gap-requirement-numbering',
        severity: 'MEDIUM',
        category: 'inconsistency',
        message: `Requirement numbering gaps: missing ${numberingGaps.join(', ')}`,
        artifacts: ['specification'],
        remediation: 'Fix requirement numbering to be sequential without gaps',
      });
    }

    return gaps;
  }

  /**
   * Extract requirement IDs from specification
   */
  private _extractRequirementIds(specContent: string): string[] {
    // Match patterns like **FR1.1**, FR1:, NFR1.2, etc.
    const matches = specContent.match(/\*\*(FR|NFR)\d+(\.\d+)?\*\*|(FR|NFR)\d+(\.\d+)?:/g);

    if (!isNonNullish(matches)) {
      return [];
    }

    // Extract just the ID part
    return matches.map((match) => {
      const cleaned = match.replaceAll(/\*\*|:/g, '').trim();
      return cleaned;
    });
  }

  /**
   * Find numbering gaps in requirement IDs
   */
  private _findNumberingGaps(requirementIds: string[]): string[] {
    const gaps: string[] = [];

    // Group by prefix (FR, NFR)
    const groups = new Map<string, number[]>();

    for (const id of requirementIds) {
      const match = id.match(/^(FR|NFR)(\d+)/);
      if (!isNonNullish(match) || match[1] === undefined || match[2] === undefined) {
        continue;
      }

      const prefix = match[1];
      const number = Number.parseInt(match[2], 10);

      const numbers = groups.get(prefix) ?? [];
      numbers.push(number);
      groups.set(prefix, numbers);
    }

    // Check for gaps in each group
    for (const [prefix, numbers] of groups) {
      const sorted = [...new Set(numbers)].sort((a, b) => a - b);

      for (let index = 0; index < sorted.length - 1; index++) {
        const current = sorted[index];
        const next = sorted[index + 1];

        if (current === undefined || next === undefined) {
          continue;
        }

        if (next - current > 1) {
          // Found a gap
          for (let missing = current + 1; missing < next; missing++) {
            gaps.push(`${prefix}${missing}`);
          }
        }
      }
    }

    return gaps;
  }

  /**
   * Check for principle violations (if principles provided)
   */
  private _checkPrincipleViolations(specContent: string, principles: ProjectPrinciples): Gap[] {
    const gaps: Gap[] = [];

    // This is a simple check - in reality, you might want to use an LLM for this
    // For now, we just flag if spec contradicts common principles

    // Check if spec mentions patterns that violate principles
    for (const principle of principles.principles) {
      // Simple keyword matching - could be enhanced with LLM analysis
      const isDiPrinciple =
        principle.category === 'Architecture' && principle.rule.toLowerCase().includes('di');
      const hasSingleton = specContent.toLowerCase().includes('singleton');
      const hasDi = specContent.toLowerCase().includes('dependency injection');

      if (isDiPrinciple && hasSingleton && !hasDi) {
        gaps.push({
          id: 'gap-principle-di',
          severity: 'MEDIUM',
          category: 'inconsistency',
          message: 'Specification may violate dependency injection principles',
          artifacts: ['specification'],
          remediation: 'Review architecture to ensure it follows project DI patterns',
        });
      }
    }

    return gaps;
  }

  /**
   * Calculate completeness score (0-100)
   *
   * Algorithm:
   * - Section presence (40%): All required sections exist
   * - Content depth (30%): Minimum content length requirements met (only for present sections)
   * - Quality indicators (20%): No ambiguous language, no placeholders
   * - Cross-validation (10%): Consistency across sections
   */
  private _calculateCompleteness(_specContent: string, gaps: Gap[]): number {
    // Section score (40%)
    const missingSections = gaps.filter(
      (g) => g.severity === 'CRITICAL' && g.message.includes('Missing required section'),
    ).length;
    const totalSections = this.REQUIRED_SECTIONS.length;
    const sectionScore = ((totalSections - missingSections) / totalSections) * 40;

    // Depth score (30%) - only count present sections
    const presentSections = totalSections - missingSections;
    const shallowSections = gaps.filter(
      (g) => g.severity === 'HIGH' && g.message.includes('too brief'),
    ).length;

    // If no sections present, depth score is 0
    const depthScore =
      presentSections > 0 ? ((presentSections - shallowSections) / presentSections) * 30 : 0;

    // Quality score (20%)
    const hasAmbiguity = gaps.some((g) => g.category === 'ambiguity');
    const hasPlaceholders = gaps.some((g) => g.message.includes('Placeholder text'));
    const hasOpenQuestions = gaps.some((g) => g.message.includes('open questions'));

    let qualityScore = 20;
    if (hasAmbiguity) {
      qualityScore -= 5;
    }
    if (hasPlaceholders) {
      qualityScore -= 10;
    }
    if (hasOpenQuestions) {
      qualityScore -= 5;
    }

    // Consistency score (10%)
    const inconsistencies = gaps.filter((g) => g.category === 'inconsistency').length;
    const consistencyScore = Math.max(0, 10 - inconsistencies * 2);

    const total = Math.round(sectionScore + depthScore + qualityScore + consistencyScore);

    return Math.max(0, Math.min(100, total));
  }

  /**
   * Generate prioritized remediation steps from gaps
   */
  private _generateRemediationSteps(gaps: Gap[]): RemediationStep[] {
    // Sort gaps by severity (CRITICAL → HIGH → MEDIUM → LOW)
    const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const sortedGaps = [...gaps].sort((a, b) => {
      const orderA = severityOrder.indexOf(a.severity);
      const orderB = severityOrder.indexOf(b.severity);
      return orderA - orderB;
    });

    // Convert gaps to remediation steps
    return sortedGaps
      .filter((gap) => isNonNullish(gap.remediation) && hasContent(gap.remediation))
      .map((gap, index) => ({
        priority: gap.severity,
        order: index + 1,
        action: gap.remediation ?? 'Review and fix this issue',
        reasoning: `${gap.severity} gap: ${gap.message}`,
        artifacts: gap.artifacts,
      }));
  }

  /**
   * Analyze specification using LLM agent for intelligent gap detection.
   *
   * The LLM agent can:
   * - Understand RFC 2119 MUST/SHOULD vs ambiguous "should"
   * - Identify missing architecture decisions
   * - Detect vague requirements that need clarification
   * - Find scope ambiguities
   * - Surface implicit assumptions
   */
  private async _analyzeWithAgent(
    specContent: string,
    principles?: ProjectPrinciples,
  ): Promise<Gap[]> {
    try {
      const prompt = this._buildAnalysisPrompt(specContent, principles);

      // Check if agent exists and supports query method
      if (!this._agentSupportsQuery(this._agent)) {
        logger.warn('⚠️ Agent does not support query method, falling back to heuristics');
        return this._fallbackHeuristicAnalysis(specContent, principles);
      }

      // Call agent with gap analysis prompt (type safe after guard above)
      const response = await this._agent.query(prompt, process.cwd(), { verbose: false });

      // Parse structured gap response from LLM
      const gaps = this._parseAgentGaps(response);

      logger.debug(`  ✓ LLM analysis found ${gaps.length} gaps`);
      return gaps;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ LLM analysis failed: ${errorMessage}, falling back to heuristics`);
      return this._fallbackHeuristicAnalysis(specContent, principles);
    }
  }

  /**
   * Type guard to check if agent supports query method
   */
  private _agentSupportsQuery(agent: DecomposerAgent | undefined): agent is DecomposerAgent & {
    query: (prompt: string, cwd: string, options?: { verbose?: boolean }) => Promise<string>;
  } {
    return isNonNullish(agent) && 'query' in agent && typeof agent.query === 'function';
  }

  /**
   * Build LLM prompt for gap analysis.
   *
   * Follows the pattern from .claude/commands/build-plan.md analysis agent.
   */
  private _buildAnalysisPrompt(specContent: string, principles?: ProjectPrinciples): string {
    const principlesSection =
      isNonNullish(principles) && isNonEmptyArray(principles.principles)
        ? `
## Project Principles (Must Follow)

${principles.principles.map((p) => `- **${p.category}**: ${p.rule}`).join('\n')}
`
        : '';

    return `ROLE: You are a specification analysis agent for chopstack v2.

YOUR JOB: Analyze the specification for completeness and identify gaps that would lead to poor task decomposition.

SPECIFICATION TO ANALYZE:

\`\`\`markdown
${specContent}
\`\`\`
${principlesSection}

ANALYSIS REQUIREMENTS:

1. **Vague Requirements Detection**
   - Identify requirements that are too ambiguous to implement
   - Distinguish between RFC 2119 language (MUST/SHOULD/MAY) and actual ambiguity
   - Flag unclear scope boundaries
   - Example GOOD: "The system MUST validate email format using RFC 5322 regex"
   - Example BAD: "The system should handle emails somehow"

2. **Architecture Decision Gaps**
   - Identify missing design choices that will affect implementation
   - Flag undefined component boundaries
   - Find missing technology choices
   - Example: "Storage mechanism not specified (database vs file vs memory?)"

3. **Scope Ambiguities**
   - Find unclear feature boundaries
   - Identify unaddressed edge cases
   - Flag missing acceptance criteria details
   - Example: "What happens when user is offline?"

4. **Implicit Assumptions**
   - Surface hidden dependencies or requirements
   - Find unstated technical constraints
   - Identify assumed knowledge
   - Example: "Assumes existing authentication system (not defined)"

5. **Technical Depth Assessment**
   - Evaluate if requirements are detailed enough for implementation
   - Check if architecture has sufficient detail
   - Verify acceptance criteria are testable
${
  isNonNullish(principles)
    ? `
6. **Principle Violations**
   - Check if specification contradicts project principles
   - Flag architectural patterns that violate established conventions
`
    : ''
}

SEVERITY GUIDELINES:
- CRITICAL: Blocks decomposition entirely (missing core requirements, contradictory specs)
- HIGH: Will cause poor task breakdown (vague requirements, missing architecture)
- MEDIUM: May affect task granularity (unclear scope, implicit assumptions)
- LOW: Minor clarifications (small ambiguities that can be resolved during execution)

OUTPUT FORMAT (JSON):
\`\`\`json
{
  "gaps": [
    {
      "id": "gap-vague-authentication",
      "severity": "HIGH",
      "category": "gap",
      "message": "Authentication requirements are vague: 'support login' lacks detail on method (OAuth, JWT, session?)",
      "artifacts": ["specification"],
      "remediation": "Specify authentication method, session management, and token handling approach"
    },
    {
      "id": "gap-missing-error-handling",
      "severity": "MEDIUM",
      "category": "gap",
      "message": "Error handling strategy not defined for API failures",
      "artifacts": ["specification"],
      "remediation": "Add section defining retry logic, fallback behavior, and user-facing error messages"
    }
  ]
}
\`\`\`

IMPORTANT:
- Return ONLY the JSON object wrapped in \`\`\`json code fence
- Do NOT flag RFC 2119 keywords (MUST/SHOULD/MAY) as ambiguous - they are intentional
- Focus on gaps that would lead to poor task decomposition
- Be specific: include the problematic text and concrete remediation
- Each gap must have: id, severity, category, message, artifacts, remediation

Begin analysis now.`;
  }

  /**
   * Parse agent response into structured Gap[] array.
   *
   * Expects JSON response with { gaps: Gap[] } structure.
   */
  private _parseAgentGaps(response: string): Gap[] {
    try {
      // Extract JSON from markdown code fence
      const jsonMatch = response.match(/```json\n([\S\s]+?)\n```/);
      const jsonContent = jsonMatch?.[1];

      if (!isNonEmptyString(jsonContent)) {
        throw new Error('No JSON code block found in response');
      }

      // Parse JSON
      const parsed = JSON.parse(jsonContent) as { gaps?: unknown };

      // Validate structure
      if (!isNonNullish(parsed.gaps) || !Array.isArray(parsed.gaps)) {
        throw new Error('Response missing gaps array');
      }

      // Validate each gap has required fields
      const gaps: Gap[] = [];
      for (const gap of parsed.gaps) {
        if (
          typeof gap !== 'object' ||
          gap === null ||
          !('id' in gap) ||
          !('severity' in gap) ||
          !('category' in gap) ||
          !('message' in gap) ||
          !('artifacts' in gap)
        ) {
          logger.warn(`⚠️ Skipping invalid gap: ${JSON.stringify(gap)}`);
          continue;
        }

        gaps.push(gap as Gap);
      }

      return gaps;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse agent gaps: ${errorMessage}`);
    }
  }

  /**
   * Fallback to simple heuristic analysis when LLM is unavailable.
   */
  private _fallbackHeuristicAnalysis(specContent: string, principles?: ProjectPrinciples): Gap[] {
    const gaps: Gap[] = [];

    // Validate content depth (HIGH)
    const depthGaps = this._checkContentDepth(specContent);
    gaps.push(...depthGaps);

    // Detect ambiguous language (MEDIUM - brittle without LLM)
    const ambiguityGaps = this._detectAmbiguousLanguage(specContent);
    gaps.push(...ambiguityGaps);

    // Check principle violations if provided (MEDIUM - brittle without LLM)
    if (isNonNullish(principles) && isNonEmptyArray(principles.principles)) {
      const principleGaps = this._checkPrincipleViolations(specContent, principles);
      gaps.push(...principleGaps);
    }

    return gaps;
  }

  /**
   * Generate human-readable summary
   */
  private _generateSummary(completeness: number, gaps: Gap[]): string {
    const status = completeness === 100 ? 'COMPLETE' : 'INCOMPLETE';

    const criticalCount = gaps.filter((g) => g.severity === 'CRITICAL').length;
    const highCount = gaps.filter((g) => g.severity === 'HIGH').length;
    const mediumCount = gaps.filter((g) => g.severity === 'MEDIUM').length;
    const lowCount = gaps.filter((g) => g.severity === 'LOW').length;

    const parts = [];
    if (criticalCount > 0) {
      parts.push(`${criticalCount} CRITICAL gap${criticalCount > 1 ? 's' : ''}`);
    }
    if (highCount > 0) {
      parts.push(`${highCount} HIGH priority gap${highCount > 1 ? 's' : ''}`);
    }
    if (mediumCount > 0) {
      parts.push(`${mediumCount} MEDIUM priority gap${mediumCount > 1 ? 's' : ''}`);
    }
    if (lowCount > 0) {
      parts.push(`${lowCount} LOW priority gap${lowCount > 1 ? 's' : ''}`);
    }

    const gapSummary = parts.length > 0 ? parts.join(', ') : 'no gaps';

    return `Completeness: ${completeness}% (${status}) - ${gapSummary}`;
  }
}
