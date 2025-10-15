import type { PlanV2, TaskV2, ValidationFinding } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { isNonEmptyArray, isNonNullish } from '@/validation/guards';

/**
 * Quality validation report with findings and metrics
 */
export type QualityValidationReport = {
  findings: ValidationFinding[];
  overallScore: number;
  taskMetrics: {
    averageFilesPerTask: number;
    complexityDistribution: ComplexityDistribution;
    total: TaskCount;
    withIssues: number;
  };
};

/**
 * Task count
 */
type TaskCount = number;

/**
 * Complexity distribution
 */
type ComplexityDistribution = {
  L: number;
  M: number;
  S: number;
  XL: number;
  XS: number;
};

/**
 * Service for validating task quality in generated plans.
 *
 * This service checks for common plan quality issues that lead to execution failures:
 * - XL tasks (should be split into smaller tasks)
 * - Tasks touching too many files (>10)
 * - Vague file patterns (wildcards like ** or *)
 * - Short descriptions (<50 characters)
 * - Missing dependencies for M/L tasks
 *
 * @example
 * ```typescript
 * const service = new QualityValidationService();
 * const report = service.validate(plan);
 *
 * console.log(report.findings.length); // 3
 * console.log(report.overallScore); // 75
 * console.log(report.taskMetrics.complexityDistribution.XL); // 1
 * ```
 */
export class QualityValidationService {
  /**
   * Maximum acceptable files per task (HIGH issue threshold)
   */
  private readonly MAX_FILES_PER_TASK = 10;

  /**
   * Minimum description length (MEDIUM issue threshold)
   */
  private readonly MIN_DESCRIPTION_LENGTH = 50;

  /**
   * File pattern wildcards to detect (HIGH issue)
   */
  private readonly WILDCARD_PATTERNS = ['**/', '*'];

  /**
   * Validate plan quality and generate comprehensive report.
   *
   * @param plan - Plan to validate
   * @returns Quality validation report with findings and metrics
   */
  validate(plan: PlanV2): QualityValidationReport {
    logger.debug('🔍 Starting plan quality validation...');

    const findings: ValidationFinding[] = [];

    // Validate each task
    for (const task of plan.tasks) {
      // 1. XL task detection (CRITICAL)
      if (task.complexity === 'XL') {
        findings.push(this._createXlTaskFinding(task));
      }

      // 2. File count validation (HIGH)
      if (task.files.length > this.MAX_FILES_PER_TASK) {
        findings.push(this._createTooManyFilesFinding(task));
      }

      // 3. Vague file pattern detection (HIGH)
      const vaguePatterns = this._detectVagueFilePatterns(task);
      if (isNonEmptyArray(vaguePatterns)) {
        findings.push(this._createVaguePatternFinding(task, vaguePatterns));
      }

      // 4. Short description detection (MEDIUM)
      if (task.description.length < this.MIN_DESCRIPTION_LENGTH) {
        findings.push(this._createShortDescriptionFinding(task));
      }

      // 5. Missing dependency validation (LOW)
      if (this._isMissingDependencies(task)) {
        findings.push(this._createMissingDependenciesFinding(task));
      }
    }

    // Calculate metrics
    const taskMetrics = this._calculateTaskMetrics(plan.tasks, findings);

    // Calculate overall score
    const overallScore = this._calculateOverallScore(findings, taskMetrics);

    logger.info(
      `✅ Quality validation complete: ${findings.length} issues found, score: ${overallScore}`,
    );

    return {
      findings,
      overallScore,
      taskMetrics,
    };
  }

  /**
   * Create XL task finding (CRITICAL severity)
   */
  private _createXlTaskFinding(task: TaskV2): ValidationFinding {
    return {
      id: `quality-xl-task-${task.id}`,
      severity: 'CRITICAL',
      category: 'gap',
      message: `Task "${task.name}" (${task.id}) is XL complexity (estimated >8 hours)`,
      artifacts: [task.id],
      remediation:
        'Split into 3-4 smaller tasks (M/L size). XL tasks often expand during execution to 15-20+ hours. Break down by logical components or phases.',
    };
  }

  /**
   * Create too many files finding (HIGH severity)
   */
  private _createTooManyFilesFinding(task: TaskV2): ValidationFinding {
    return {
      id: `quality-file-count-${task.id}`,
      severity: 'HIGH',
      category: 'gap',
      message: `Task "${task.name}" (${task.id}) touches ${task.files.length} files (threshold: ${this.MAX_FILES_PER_TASK})`,
      artifacts: [task.id, ...task.files],
      remediation: `Split by module or component. Tasks touching many files are poorly scoped. Consider: ${task.files.slice(0, 3).join(', ')}${task.files.length > 3 ? '...' : ''}`,
    };
  }

  /**
   * Create vague pattern finding (HIGH severity)
   */
  private _createVaguePatternFinding(task: TaskV2, vaguePatterns: string[]): ValidationFinding {
    return {
      id: `quality-vague-pattern-${task.id}`,
      severity: 'HIGH',
      category: 'ambiguity',
      message: `Task "${task.name}" (${task.id}) has vague file patterns: ${vaguePatterns.join(', ')}`,
      artifacts: [task.id, ...vaguePatterns],
      remediation:
        'Specify exact file paths. Wildcard patterns make scope unclear and testing difficult. List each file explicitly.',
    };
  }

  /**
   * Create short description finding (MEDIUM severity)
   */
  private _createShortDescriptionFinding(task: TaskV2): ValidationFinding {
    return {
      id: `quality-short-desc-${task.id}`,
      severity: 'MEDIUM',
      category: 'gap',
      message: `Task "${task.name}" (${task.id}) has brief description (${task.description.length} chars, minimum ${this.MIN_DESCRIPTION_LENGTH})`,
      artifacts: [task.id],
      remediation:
        'Expand description to explain both WHAT needs to be done and WHY it matters. Include context and rationale.',
    };
  }

  /**
   * Create missing dependencies finding (LOW severity)
   */
  private _createMissingDependenciesFinding(task: TaskV2): ValidationFinding {
    return {
      id: `quality-missing-deps-${task.id}`,
      severity: 'LOW',
      category: 'gap',
      message: `Task "${task.name}" (${task.id}) is ${task.complexity} complexity but has zero dependencies`,
      artifacts: [task.id],
      remediation:
        'Review if prerequisite tasks are needed. Complex tasks (M/L) typically depend on setup or foundation tasks.',
    };
  }

  /**
   * Detect vague file patterns in task
   */
  private _detectVagueFilePatterns(task: TaskV2): string[] {
    const vaguePatterns: string[] = [];

    for (const filePath of task.files) {
      for (const wildcard of this.WILDCARD_PATTERNS) {
        if (filePath.includes(wildcard)) {
          vaguePatterns.push(filePath);
          break; // Only add once per file
        }
      }
    }

    return vaguePatterns;
  }

  /**
   * Check if task is missing dependencies (M/L complexity with zero deps)
   */
  private _isMissingDependencies(task: TaskV2): boolean {
    const isComplex = task.complexity === 'M' || task.complexity === 'L';
    const hasNoDeps = !isNonNullish(task.dependencies) || task.dependencies.length === 0;

    return isComplex && hasNoDeps;
  }

  /**
   * Calculate task metrics
   */
  private _calculateTaskMetrics(
    tasks: TaskV2[],
    findings: ValidationFinding[],
  ): QualityValidationReport['taskMetrics'] {
    // Count tasks with issues
    const tasksWithIssues = new Set(findings.map((f) => f.artifacts[0])).size;

    // Calculate complexity distribution
    const distribution: ComplexityDistribution = {
      XL: 0,
      L: 0,
      M: 0,
      S: 0,
      XS: 0,
    };

    let totalFiles = 0;

    for (const task of tasks) {
      distribution[task.complexity]++;
      totalFiles += task.files.length;
    }

    const averageFilesPerTask = tasks.length > 0 ? totalFiles / tasks.length : 0;

    return {
      total: tasks.length,
      withIssues: tasksWithIssues,
      complexityDistribution: distribution,
      averageFilesPerTask: Math.round(averageFilesPerTask * 10) / 10, // Round to 1 decimal
    };
  }

  /**
   * Calculate overall quality score (0-100)
   *
   * Scoring algorithm:
   * - Start at 100
   * - Deduct 20 points per CRITICAL issue
   * - Deduct 10 points per HIGH issue
   * - Deduct 5 points per MEDIUM issue
   * - Deduct 2 points per LOW issue
   * - Minimum score: 0
   */
  private _calculateOverallScore(
    findings: ValidationFinding[],
    _metrics: QualityValidationReport['taskMetrics'],
  ): number {
    let score = 100;

    for (const finding of findings) {
      switch (finding.severity) {
        case 'CRITICAL': {
          score -= 20;
          break;
        }
        case 'HIGH': {
          score -= 10;
          break;
        }
        case 'MEDIUM': {
          score -= 5;
          break;
        }
        case 'LOW': {
          score -= 2;
          break;
        }
      }
    }

    return Math.max(0, score);
  }
}
