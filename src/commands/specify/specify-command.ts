/**
 * Specify command for specification generation
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { SpecifyCommandOptions } from '@/types/cli';

import { createDecomposerAgent } from '@/adapters/agents';
import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { CodebaseAnalysisService } from '@/services/analysis/codebase-analysis-service';
import { SpecificationService } from '@/services/specification/specification-service';
import { isNonNullish } from '@/validation/guards';

/**
 * Generate comprehensive specifications from brief prompts
 */
@RegisterCommand('specify')
export class SpecifyCommand extends BaseCommand {
  constructor(dependencies: CommandDependencies) {
    super('specify', 'Generate comprehensive specifications from brief prompts', dependencies);
  }

  async execute(options: SpecifyCommandOptions): Promise<number> {
    try {
      // Get the prompt (from --prompt option or --input file)
      const prompt = await this._getPrompt(options);

      // Get working directory (from --cwd option or context)
      const cwd = options.cwd ?? this.dependencies.context.cwd;

      // Determine project name from prompt (first few words, kebab-case)
      const projectName = this._extractProjectName(prompt);

      // Setup output directory structure: .chopstack/specs/[project-name]/
      const outputDir = resolve(cwd, '.chopstack', 'specs', projectName);
      const specPath = resolve(outputDir, 'spec.md');
      const codebasePath = resolve(outputDir, 'codebase.md');
      const notesDir = resolve(outputDir, 'notes');

      this.logger.info(chalk.blue('📝 Chopstack Specify - Specification Generation'));
      this.logger.info(chalk.dim(`Working directory: ${cwd}`));
      this.logger.info(chalk.dim(`Project: ${projectName}`));
      this.logger.info(
        chalk.dim(`Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`),
      );

      // Step 1: Create output directory structure immediately
      this.logger.info(chalk.cyan('📁 Step 1/5: Creating output directory structure...'));
      await mkdir(outputDir, { recursive: true });
      await mkdir(notesDir, { recursive: true });
      this.logger.info(chalk.dim(`  ✓ Created ${outputDir}`));

      // Step 2: Create agent for codebase analysis and specification generation
      this.logger.info(chalk.cyan('🤖 Step 2/5: Initializing AI agent...'));
      const agent = await createDecomposerAgent('claude');

      // Initialize services
      const codebaseAnalysisService = new CodebaseAnalysisService(agent);
      const specificationService = new SpecificationService(agent, codebaseAnalysisService);

      // Step 3: Analyze codebase and write codebase.md immediately
      this.logger.info(chalk.cyan('🔍 Step 3/5: Analyzing codebase...'));
      const codebaseAnalysis = await codebaseAnalysisService.analyze(cwd);

      // Write codebase.md immediately after analysis completes
      const codebaseContent = this._formatCodebaseAnalysis(codebaseAnalysis);
      await writeFile(codebasePath, codebaseContent, 'utf8');
      this.logger.info(chalk.dim(`  ✓ codebase.md (${codebaseContent.length} characters)`));

      // Step 4: Generate specification and write spec.md immediately
      this.logger.info(chalk.cyan('📄 Step 4/5: Generating specification...'));
      const specification = await specificationService.generate({ prompt, cwd });

      // Write spec.md immediately after generation completes
      await writeFile(specPath, specification, 'utf8');
      this.logger.info(chalk.dim(`  ✓ spec.md (${specification.length} characters)`));

      // Step 5: Summary
      this.logger.info(chalk.cyan('✅ Step 5/5: Complete!'));

      // Success
      this.logger.info(chalk.green('✅ Specification generated successfully!'));
      this.logger.info(chalk.dim(''));
      this.logger.info(chalk.dim('Files created:'));
      this.logger.info(chalk.dim(`  📄 ${specPath}`));
      this.logger.info(chalk.dim(`  📄 ${codebasePath}`));
      this.logger.info(chalk.dim(`  📁 ${notesDir}/`));
      this.logger.info(chalk.dim(''));
      this.logger.info(chalk.cyan('Next steps:'));
      this.logger.info(chalk.dim(`  1. Review ${specPath}`));
      this.logger.info(chalk.dim(`  2. Run: chopstack decompose --spec ${specPath}`));

      return 0;
    } catch (error) {
      this.logger.error(chalk.red('❌ Specify command failed'));
      this.logger.error('');

      if (error instanceof Error) {
        // Show the error name and message
        this.logger.error(chalk.red(`Error: ${error.name}: ${error.message}`));

        // Show the cause chain if available
        let currentCause: unknown = error.cause;
        let depth = 0;
        while (currentCause instanceof Error && depth < 5) {
          depth++;
          this.logger.error(
            chalk.yellow(`  Caused by: ${currentCause.name}: ${currentCause.message}`),
          );
          currentCause = currentCause.cause;
        }

        // Show stack trace in verbose mode
        if (options.verbose && isNonNullish(error.stack)) {
          this.logger.error('');
          this.logger.error(chalk.dim('Stack trace:'));
          this.logger.error(chalk.dim(error.stack));
        }
      } else {
        this.logger.error(chalk.red(`Error: ${String(error)}`));
      }

      return 1;
    }
  }

  /**
   * Get prompt from options (either direct prompt or from input file)
   */
  private async _getPrompt(options: SpecifyCommandOptions): Promise<string> {
    // Validate that we have either prompt or input (schema should ensure this)
    if (options.prompt !== undefined) {
      return options.prompt;
    }

    if (options.input !== undefined) {
      this.logger.info(chalk.dim(`📖 Reading prompt from: ${options.input}`));
      const promptPath = resolve(options.input);
      const promptContent = await readFile(promptPath, 'utf8');

      if (promptContent.trim().length === 0) {
        throw new Error(`Input file is empty: ${promptPath}`);
      }

      return promptContent.trim();
    }

    // This should never happen due to schema validation, but TypeScript doesn't know that
    throw new Error('Either --prompt or --input must be provided');
  }

  /**
   * Extract project name from prompt
   * Takes first few words and converts to kebab-case
   */
  private _extractProjectName(prompt: string): string {
    // Take first 5 words or first sentence, whichever is shorter
    const words = prompt.trim().split(/\s+/).slice(0, 5);
    const projectName = words
      .join('-')
      .toLowerCase()
      .replaceAll(/[^\da-z-]/g, '') // Remove non-alphanumeric except hyphens
      .replaceAll(/-+/g, '-') // Collapse multiple hyphens
      .replaceAll(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure we have a valid name
    return projectName.length > 0 ? projectName : 'untitled';
  }

  /**
   * Format codebase analysis as markdown document
   */
  private _formatCodebaseAnalysis(analysis: unknown): string {
    // Type guard to ensure analysis has summary field
    if (
      typeof analysis !== 'object' ||
      analysis === null ||
      !('summary' in analysis) ||
      typeof analysis.summary !== 'string'
    ) {
      return '# Codebase Context\n\n*Analysis not available*\n';
    }

    // The summary field already contains formatted markdown
    return analysis.summary;
  }
}
