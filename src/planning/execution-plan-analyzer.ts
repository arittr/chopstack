import type { SDKResultMessage } from '@anthropic-ai/claude-code';

import { isNonEmptyObject } from '../validation/guards';

// Use official Claude Code SDK types
export type ClaudeExecutionPlan = SDKResultMessage;

// Analysis results for execution plans
export type PlanAnalysis = {
  complexity: 'low' | 'medium' | 'high';
  fileOperations: {
    creates: string[];
    modifies: string[];
    total: number;
  };
  quality: {
    hasSteps: boolean;
    hasTechnicalDetails: boolean;
    mentionsFiles: boolean;
    score: number; // 0-100
  };
  stepCount: number;
  technologies: string[];
  wordCount: number;
};

export class ExecutionPlanAnalyzer {
  private static readonly TECHNOLOGY_PATTERNS = new Map([
    ['react', /\breact\b/i],
    ['typescript', /\btypescript\b|\bts\b|\btsx?\b/i],
    ['nextjs', /\bnext\.?js\b|\bnext\b/i],
    ['css', /\bcss\b|\bstyles?\b|\bstyling\b/i],
    ['context', /\bcontext\b|\bprovider\b/i],
    ['hooks', /\bhooks?\b|\busestate\b|\buseeffect\b/i],
    ['components', /\bcomponents?\b/i],
    ['routing', /\brouting\b|\brouter\b/i],
  ]);

  private static readonly FILE_OPERATION_PATTERNS = new Map([
    ['create', /create|add|new\s+(?:file|component|context|provider)/i],
    ['modify', /modify|update|edit|change/i],
  ]);

  static extractPlanFromClaudeResponse(response: string): string | null {
    try {
      const parsedResponse = JSON.parse(response) as ClaudeExecutionPlan;

      // Look for ExitPlanMode tool in permission denials
      const exitPlanDenial = parsedResponse.permission_denials.find(
        (denial) => denial.tool_name === 'ExitPlanMode',
      );

      if (exitPlanDenial !== undefined && isNonEmptyObject(exitPlanDenial.tool_input)) {
        const toolInput = exitPlanDenial.tool_input as { plan?: string };
        return toolInput.plan ?? null;
      }

      return null;
    } catch {
      // If not JSON, try to extract plan from text response
      const planMatch = response.match(/## plan[\S\s]*$/i);
      return planMatch?.[0] ?? null;
    }
  }

  static parseClaudeResponse(response: string): ClaudeExecutionPlan | null {
    try {
      return JSON.parse(response) as ClaudeExecutionPlan;
    } catch {
      return null;
    }
  }

  static analyzePlan(planText: string): PlanAnalysis {
    const wordCount = planText.split(/\s+/).length;
    const lines = planText.split('\n');

    // Detect steps (numbered or bulleted)
    const stepLines = lines.filter((line) => /^\s*(?:\d+\.|[*+-]|\w+\.)\s+/.test(line));
    const stepCount = stepLines.length;

    // Extract file operations
    const fileOperations = this._extractFileOperations(planText);

    // Detect technologies mentioned
    const technologies = this._detectTechnologies(planText);

    // Calculate quality metrics
    const quality = this._assessPlanQuality(planText, stepCount, fileOperations.total);

    // Determine complexity based on multiple factors
    const complexity = this._determineComplexity(stepCount, fileOperations.total, wordCount);

    return {
      wordCount,
      stepCount,
      fileOperations,
      technologies,
      quality,
      complexity,
    };
  }

  private static _extractFileOperations(planText: string): PlanAnalysis['fileOperations'] {
    const creates: string[] = [];
    const modifies: string[] = [];

    // Look for file paths in the plan
    const filePathPattern = /(?:src\/|\.\/)?[\w-]+(?:\/[\w-]+)*\.(?:tsx?|jsx?|css|json|md)/gi;
    const filePaths = planText.match(filePathPattern) ?? [];

    // Classify based on context
    for (const filePath of filePaths) {
      const context = this._getFileContext(planText, filePath);
      if (this.FILE_OPERATION_PATTERNS.get('create')?.test(context) === true) {
        creates.push(filePath);
      } else if (this.FILE_OPERATION_PATTERNS.get('modify')?.test(context) === true) {
        modifies.push(filePath);
      }
    }

    return {
      creates: [...new Set(creates)], // Remove duplicates
      modifies: [...new Set(modifies)],
      total: new Set([...creates, ...modifies]).size,
    };
  }

  private static _getFileContext(planText: string, filePath: string): string {
    const lines = planText.split('\n');
    const fileLineIndex = lines.findIndex((line) => line.includes(filePath));

    if (fileLineIndex === -1) {
      return '';
    }

    // Get surrounding context (2 lines before and after)
    const startIndex = Math.max(0, fileLineIndex - 2);
    const endIndex = Math.min(lines.length, fileLineIndex + 3);

    return lines.slice(startIndex, endIndex).join(' ');
  }

  private static _detectTechnologies(planText: string): string[] {
    const detected: string[] = [];

    for (const [tech, pattern] of this.TECHNOLOGY_PATTERNS) {
      if (pattern.test(planText)) {
        detected.push(tech);
      }
    }

    return detected;
  }

  private static _assessPlanQuality(
    planText: string,
    stepCount: number,
    fileCount: number,
  ): PlanAnalysis['quality'] {
    const hasSteps = stepCount > 0;
    const mentionsFiles = /\.(tsx?|jsx?|css|json)/i.test(planText);
    const hasTechnicalDetails =
      this.TECHNOLOGY_PATTERNS.size > 0 && this._detectTechnologies(planText).length > 0;

    // Calculate quality score (0-100)
    let score = 0;

    // Step structure (30 points)
    if (hasSteps) {
      score += Math.min(30, stepCount * 5); // Up to 6 steps for full points
    }

    // File mentions (25 points)
    if (mentionsFiles) {
      score += Math.min(25, fileCount * 5); // Up to 5 files for full points
    }

    // Technical details (25 points)
    const techCount = this._detectTechnologies(planText).length;
    score += Math.min(25, techCount * 5); // Up to 5 technologies for full points

    // Plan length appropriateness (20 points)
    const wordCount = planText.split(/\s+/).length;
    if (wordCount >= 50 && wordCount <= 500) {
      score += 20;
    } else if (wordCount >= 30 && wordCount <= 800) {
      score += 15;
    } else if (wordCount >= 20) {
      score += 10;
    }

    return {
      hasSteps,
      mentionsFiles,
      hasTechnicalDetails,
      score: Math.min(100, score),
    };
  }

  private static _determineComplexity(
    stepCount: number,
    fileCount: number,
    wordCount: number,
  ): PlanAnalysis['complexity'] {
    // Calculate complexity score
    let complexityScore = 0;

    // More steps = more complex
    complexityScore += stepCount * 2;

    // More files = more complex
    complexityScore += fileCount * 3;

    // Longer plans tend to be more complex
    if (wordCount > 300) {
      complexityScore += 3;
    } else if (wordCount > 150) {
      complexityScore += 2;
    } else if (wordCount > 75) {
      complexityScore += 1;
    }

    if (complexityScore >= 15) {
      return 'high';
    }
    if (complexityScore >= 8) {
      return 'medium';
    }
    return 'low';
  }

  static compareExecutionPlans(plans: Array<{ analysis: PlanAnalysis; taskTitle: string }>): {
    averageComplexity: number;
    averageQuality: number;
    highestQuality: { analysis: PlanAnalysis; taskTitle: string };
    lowestQuality: { analysis: PlanAnalysis; taskTitle: string };
    totalFileOperations: number;
  } {
    if (plans.length === 0) {
      throw new Error('Cannot compare empty plans array');
    }

    const complexityValues = { low: 1, medium: 2, high: 3 };
    const avgComplexity =
      plans.reduce((sum, p) => sum + complexityValues[p.analysis.complexity], 0) / plans.length;
    const avgQuality = plans.reduce((sum, p) => sum + p.analysis.quality.score, 0) / plans.length;

    const sortedByQuality = [...plans].sort(
      (a, b) => b.analysis.quality.score - a.analysis.quality.score,
    );

    return {
      averageComplexity: avgComplexity,
      averageQuality: avgQuality,
      highestQuality: sortedByQuality[0] as { analysis: PlanAnalysis; taskTitle: string },
      lowestQuality: sortedByQuality.at(-1) as { analysis: PlanAnalysis; taskTitle: string },
      totalFileOperations: plans.reduce((sum, p) => sum + p.analysis.fileOperations.total, 0),
    };
  }
}
