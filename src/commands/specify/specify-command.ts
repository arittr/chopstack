/**
 * Specify command for specification generation
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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

      this.logger.info(chalk.blue('📝 Chopstack Specify - Specification Generation'));
      this.logger.info(chalk.dim(`Working directory: ${cwd}`));
      this.logger.info(
        chalk.dim(`Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`),
      );

      // Create agent for codebase analysis and specification generation
      this.logger.info(chalk.cyan('🤖 Initializing AI agent...'));
      const agent = await createDecomposerAgent('claude');

      // Initialize services
      const codebaseAnalysisService = new CodebaseAnalysisService(agent);
      const specificationService = new SpecificationService(agent, codebaseAnalysisService);

      // Step 1: Analyze codebase
      this.logger.info(chalk.cyan('🔍 Step 1/3: Analyzing codebase...'));
      await codebaseAnalysisService.analyze(cwd);

      // Step 2: Generate specification
      this.logger.info(chalk.cyan('📄 Step 2/3: Generating specification...'));
      const specification = await specificationService.generate({ prompt, cwd });

      // Step 3: Write output
      this.logger.info(chalk.cyan('💾 Step 3/3: Writing specification to file...'));
      await this._writeSpecification(options.output, specification);

      // Success
      this.logger.info(chalk.green('✅ Specification generated successfully!'));
      this.logger.info(chalk.dim(`📄 Output: ${resolve(options.output)}`));
      this.logger.info(chalk.dim(`📊 Length: ${specification.length} characters`));
      this.logger.info(chalk.dim(`📊 Lines: ${specification.split('\n').length} lines`));

      return 0;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Specify command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      if (options.verbose && error instanceof Error && isNonNullish(error.stack)) {
        this.logger.error(chalk.dim(error.stack));
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
   * Write specification to output file
   */
  private async _writeSpecification(outputPath: string, content: string): Promise<void> {
    const resolvedPath = resolve(outputPath);

    // Ensure output directory exists
    const outputDir = dirname(resolvedPath);
    await mkdir(outputDir, { recursive: true });

    // Write the specification
    await writeFile(resolvedPath, content, 'utf8');

    this.logger.debug?.(`✅ Wrote ${content.length} characters to ${resolvedPath}`);
  }
}
