import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { ProjectPrinciples } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { hasContent, isNonEmptyArray, isNonNullish } from '@/validation/guards';

/**
 * Cache entry for project principles
 */
type CacheEntry = {
  mtime: number;
  principles: ProjectPrinciples;
  timestamp: number;
};

/**
 * Raw principle extracted from markdown
 */
type RawPrinciple = {
  codeExample?: string;
  text: string;
};

/**
 * Service for extracting project coding principles, standards, and conventions
 * from existing documentation files (CLAUDE.md, .cursorrules, CONTRIBUTING.md).
 *
 * This service parses markdown documentation to extract principle statements,
 * categorizes them by type, and extracts associated code examples. Results
 * are cached based on file modification time for performance.
 *
 * @example
 * ```typescript
 * const service = new ProjectPrinciplesService();
 * const principles = await service.extract('/path/to/repo');
 *
 * console.log(principles.source); // 'CLAUDE.md'
 * console.log(principles.principles[0].category); // 'Code Style'
 * console.log(principles.principles[0].rule); // 'Use ts-pattern for...'
 * ```
 */
export class ProjectPrinciplesService {
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * File search order (prioritized by reliability and comprehensiveness)
   */
  private readonly PRINCIPLE_FILES = ['CLAUDE.md', '.cursorrules', 'CONTRIBUTING.md'];

  /**
   * Extract project principles from documentation files.
   *
   * Searches for principle files in order (CLAUDE.md, .cursorrules, CONTRIBUTING.md)
   * and returns the first one found. Results are cached based on file modification time.
   *
   * @param cwd - Working directory to search in
   * @returns Project principles or empty structure if no files found
   */
  extract(cwd: string): ProjectPrinciples {
    logger.debug('🔍 Extracting project principles...');

    // Try to find first available principle file
    const principleFile = this._findPrincipleFile(cwd);
    if (!isNonNullish(principleFile)) {
      logger.info('⚠️  No principle files found (CLAUDE.md, .cursorrules, CONTRIBUTING.md)');
      return this._emptyPrinciples();
    }

    const filePath = join(cwd, principleFile);
    logger.info(`📄 Found principle file: ${principleFile}`);

    // Check cache first
    const cached = this._getCachedPrinciples(filePath);
    if (isNonNullish(cached)) {
      logger.info('✅ Using cached project principles');
      return cached;
    }

    // Parse fresh principles
    logger.info('📊 Parsing project principles...');
    const principles = this._parsePrinciples(filePath, principleFile);

    // Cache the result
    this._cachePrinciples(filePath, principles);

    logger.info(`✅ Extracted ${principles.principles.length} principles`);
    return principles;
  }

  /**
   * Find first available principle file
   */
  private _findPrincipleFile(cwd: string): string | null {
    for (const filename of this.PRINCIPLE_FILES) {
      try {
        const filePath = join(cwd, filename);
        statSync(filePath);
        return filename;
      } catch {
        // File doesn't exist, try next
      }
    }
    return null;
  }

  /**
   * Get cached principles if valid, null otherwise
   */
  private _getCachedPrinciples(filePath: string): ProjectPrinciples | null {
    const entry = this.cache.get(filePath);
    if (!isNonNullish(entry)) {
      return null;
    }

    // Validate cache is still fresh
    const currentMtime = this._getFileMtime(filePath);
    if (entry.mtime === currentMtime) {
      logger.debug('✅ Cache hit: file unchanged');
      return entry.principles;
    }

    logger.debug('❌ Cache miss: file modified');
    return null;
  }

  /**
   * Cache principles result
   */
  private _cachePrinciples(filePath: string, principles: ProjectPrinciples): void {
    const mtime = this._getFileMtime(filePath);
    this.cache.set(filePath, {
      principles,
      mtime,
      timestamp: Date.now(),
    });
    logger.debug('✅ Cached principles result');
  }

  /**
   * Get file modification time
   */
  private _getFileMtime(filePath: string): number {
    try {
      const stats = statSync(filePath);
      return stats.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Parse principles from markdown file
   */
  private _parsePrinciples(filePath: string, source: string): ProjectPrinciples {
    const content = readFileSync(filePath, 'utf8');
    const rawPrinciples = this._extractPrincipleStatements(content);
    const categorized = this._categorizePrinciples(rawPrinciples);

    return {
      source,
      principles: categorized,
    };
  }

  /**
   * Extract principle statements from markdown content
   *
   * Looks for:
   * - Bullet lists (- item, * item)
   * - Numbered lists (1. item, 2. item)
   * - Bold statements (**principle**)
   * - Code examples (fenced code blocks following principles)
   */
  private _extractPrincipleStatements(content: string): RawPrinciple[] {
    const principles: RawPrinciple[] = [];
    const lines = content.split('\n');

    let currentPrinciple: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    for (const line of lines) {
      if (!isNonNullish(line)) {
        continue;
      }

      const trimmed = line.trim();

      // Track code blocks
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // End of code block - associate with last principle if exists
          if (isNonNullish(currentPrinciple) && isNonEmptyArray(codeBlockContent)) {
            const lastPrinciple = principles.at(-1);
            if (isNonNullish(lastPrinciple)) {
              lastPrinciple.codeExample = codeBlockContent.join('\n');
            }
          }
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Extract principles from bullet/numbered lists
      const bulletMatch = trimmed.match(/^[*-]\s+(.+)$/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);

      if (bulletMatch?.[1] !== undefined) {
        const principleText = bulletMatch[1];
        if (this._isPrincipleStatement(principleText)) {
          currentPrinciple = principleText;
          principles.push({ text: principleText });
        }
      } else if (numberedMatch?.[1] !== undefined) {
        const principleText = numberedMatch[1];
        if (this._isPrincipleStatement(principleText)) {
          currentPrinciple = principleText;
          principles.push({ text: principleText });
        }
      } else if (boldMatch?.[1] !== undefined) {
        // Bold statement as principle
        const title = boldMatch[1];
        const description = boldMatch[2];
        const principleText =
          description !== undefined && hasContent(description) ? `${title}: ${description}` : title;

        if (this._isPrincipleStatement(principleText)) {
          currentPrinciple = principleText;
          principles.push({ text: principleText });
        }
      }
    }

    return principles;
  }

  /**
   * Check if text looks like a principle statement (not just a list item)
   */
  private _isPrincipleStatement(text: string): boolean {
    // Filter out non-principle items
    const excludePatterns = [
      /^https?:\/\//i, // URLs
      /^see\s+/i, // References starting with "see"
      /^example:\s*$/i, // Example labels alone (without content)
      /^file:/i, // File paths
      /^\d+%\s/i, // Lines starting with percentages
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Must be substantial (>15 chars minimum)
    if (text.length < 15) {
      return false;
    }

    // Allow any substantial text that looks like guidance or instruction
    // This is intentionally permissive to capture project-specific principles
    return true;
  }

  /**
   * Categorize principles by type
   */
  private _categorizePrinciples(
    rawPrinciples: RawPrinciple[],
  ): Array<{ category: string; examples?: string[]; rule: string }> {
    return rawPrinciples.map((raw) => {
      const category = this._inferCategory(raw.text);
      const result: { category: string; examples?: string[]; rule: string } = {
        category,
        rule: raw.text,
      };

      if (raw.codeExample !== undefined && hasContent(raw.codeExample)) {
        result.examples = [raw.codeExample];
      }

      return result;
    });
  }

  /**
   * Infer principle category from content
   */
  private _inferCategory(text: string): string {
    const lower = text.toLowerCase();

    // Architecture patterns
    if (
      lower.includes('architecture') ||
      lower.includes('pattern') ||
      lower.includes('dependency injection') ||
      lower.includes('adapter') ||
      lower.includes('strategy') ||
      lower.includes('service') ||
      lower.includes('repository')
    ) {
      return 'Architecture';
    }

    // Testing patterns
    if (
      lower.includes('test') ||
      lower.includes('mock') ||
      lower.includes('coverage') ||
      lower.includes('assertion') ||
      lower.includes('vitest') ||
      lower.includes('jest')
    ) {
      return 'Testing';
    }

    // Documentation patterns
    if (
      lower.includes('documentation') ||
      lower.includes('comment') ||
      lower.includes('jsdoc') ||
      lower.includes('readme')
    ) {
      return 'Documentation';
    }

    // Error handling patterns (check before Type System since "error types" includes both)
    if (lower.includes('error') || lower.includes('throw') || lower.includes('catch')) {
      return 'Error Handling';
    }

    // TypeScript/Type patterns
    if (
      lower.includes('type') ||
      lower.includes('interface') ||
      lower.includes('generic') ||
      lower.includes('typescript') ||
      lower.includes('any') ||
      lower.includes('unknown')
    ) {
      return 'Type System';
    }

    // Import/Module patterns
    if (lower.includes('import') || lower.includes('export') || lower.includes('module')) {
      return 'Module System';
    }

    // Default: Code Style
    return 'Code Style';
  }

  /**
   * Return empty principles structure
   */
  private _emptyPrinciples(): ProjectPrinciples {
    return {
      source: 'none',
      principles: [],
    };
  }
}
