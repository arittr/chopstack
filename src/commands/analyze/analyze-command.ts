/**
 * Analyze command for specification completeness validation
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import type { AnalyzeCommandOptions } from '@/types/cli';
import type { Gap, Severity } from '@/types/schemas-v2';

import { RegisterCommand } from '@/commands/command-factory';
import { BaseCommand, type CommandDependencies } from '@/commands/types';
import { GapAnalysisService } from '@/services/analysis/gap-analysis-service';
import { ProjectPrinciplesService } from '@/services/analysis/project-principles-service';
import { isNonEmptyArray } from '@/validation/guards';

/**
 * Analyze specification completeness and generate remediation guidance
 */
@RegisterCommand('analyze')
export class AnalyzeCommand extends BaseCommand {
  private readonly gapAnalysisService: GapAnalysisService;
  private readonly principlesService: ProjectPrinciplesService;

  constructor(dependencies: CommandDependencies) {
    super(
      'analyze',
      'Analyze specification completeness and generate remediation guidance',
      dependencies,
    );
    this.gapAnalysisService = new GapAnalysisService();
    this.principlesService = new ProjectPrinciplesService();
  }

  async execute(options: AnalyzeCommandOptions): Promise<number> {
    try {
      // Read specification file
      const specPath = resolve(options.spec);
      this.logger.info(chalk.blue(`📄 Reading spec from: ${specPath}`));
      const specContent = await readFile(specPath, 'utf8');

      // Read optional codebase file (reserved for future use)
      if (options.codebase !== undefined) {
        const codebasePath = resolve(options.codebase);
        this.logger.info(chalk.blue(`📄 Reading codebase from: ${codebasePath}`));
        await readFile(codebasePath, 'utf8');
        // Note: codebase content will be used in future iterations for enhanced analysis
      }

      // Extract project principles
      const cwd = options.targetDir ?? this.dependencies.context.cwd;
      this.logger.info(chalk.cyan('🔍 Extracting project principles...'));
      const principles = this.principlesService.extract(cwd);

      // Analyze specification
      this.logger.info(chalk.cyan('📊 Analyzing specification completeness...'));
      const report = this.gapAnalysisService.analyze(specContent, principles);

      // Output report
      if (options.output !== undefined) {
        // JSON output
        const outputPath = resolve(options.output);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
        this.logger.info(chalk.green(`✅ Report written to: ${outputPath}`));
      }

      // Terminal output (always show, even if also writing to file)
      if (options.format === 'json') {
        // JSON to stdout
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(report, null, 2));
      } else {
        // Default to text format
        this._displayTerminalReport(report);
      }

      // Exit code 0 if 100% complete, 1 otherwise
      return report.completeness === 100 ? 0 : 1;
    } catch (error) {
      this.logger.error(
        chalk.red(
          `❌ Analyze command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return 1;
    }
  }

  /**
   * Display formatted terminal report
   */
  private _displayTerminalReport(report: ReturnType<typeof this.gapAnalysisService.analyze>): void {
    // eslint-disable-next-line no-console
    console.log(`\n${chalk.bold('📊 Specification Analysis Report')}\n`);

    // Completeness score
    const statusColor = report.completeness === 100 ? chalk.green : chalk.yellow;
    const status = report.completeness === 100 ? 'COMPLETE' : 'INCOMPLETE';
    // eslint-disable-next-line no-console
    console.log(
      `${chalk.bold('Completeness: ') + statusColor(`${report.completeness}% (${status})`)}\n`,
    );

    // Summary
    // eslint-disable-next-line no-console
    console.log(`${chalk.bold('📋 Summary: ') + report.summary}\n`);

    if (report.gaps.length === 0) {
      // eslint-disable-next-line no-console
      console.log(chalk.green('✅ No gaps found - specification is ready for decomposition!\n'));
      return;
    }

    // Group gaps by severity
    const critical = report.gaps.filter((g) => g.severity === 'CRITICAL');
    const high = report.gaps.filter((g) => g.severity === 'HIGH');
    const medium = report.gaps.filter((g) => g.severity === 'MEDIUM');
    const low = report.gaps.filter((g) => g.severity === 'LOW');

    /* eslint-disable no-console */
    // Display gaps by severity
    if (isNonEmptyArray(critical)) {
      console.log(chalk.red.bold('🔴 CRITICAL Issues:'));
      this._displayGaps(critical);
      console.log('');
    }

    if (isNonEmptyArray(high)) {
      console.log(chalk.hex('#FFA500').bold('🟠 HIGH Priority Issues:'));
      this._displayGaps(high);
      console.log('');
    }

    if (isNonEmptyArray(medium)) {
      console.log(chalk.yellow.bold('🟡 MEDIUM Priority Issues:'));
      this._displayGaps(medium);
      console.log('');
    }

    if (isNonEmptyArray(low)) {
      console.log(chalk.blue.bold('🔵 LOW Priority Issues:'));
      this._displayGaps(low);
      console.log('');
    }

    // Remediation steps
    if (isNonEmptyArray(report.remediation)) {
      console.log(chalk.bold('💡 Recommendations (Priority Order):'));
      for (const step of report.remediation) {
        const priorityColor = this._getSeverityColor(step.priority);
        console.log(`  ${step.order}. [${priorityColor(step.priority)}] ${step.action}`);
        console.log(chalk.dim(`     ${step.reasoning}`));
        if (isNonEmptyArray(step.artifacts)) {
          console.log(chalk.dim(`     Artifacts: ${step.artifacts.join(', ')}`));
        }
      }
      console.log('');
    }

    // Footer warning
    if (report.completeness < 100) {
      console.log(
        chalk.yellow('⚠️  Cannot proceed with decomposition until completeness reaches 100%'),
      );
      console.log('');
      console.log(
        `${chalk.dim('Run: ')}${chalk.cyan(
          `chopstack analyze --spec ${resolve(this.dependencies.context.cwd)} --output report.json`,
        )}${chalk.dim(' for detailed JSON report')}`,
      );
      console.log('');
    }
    /* eslint-enable no-console */
  }

  /**
   * Display individual gaps
   */
  private _displayGaps(gaps: Gap[]): void {
    /* eslint-disable no-console */
    for (const gap of gaps) {
      console.log(`  [${gap.id}] ${gap.message}`);
      if (gap.remediation !== undefined) {
        console.log(chalk.dim(`      → ${gap.remediation}`));
      }
      if (isNonEmptyArray(gap.artifacts)) {
        console.log(chalk.dim(`      Artifacts: ${gap.artifacts.join(', ')}`));
      }
    }
    /* eslint-enable no-console */
  }

  /**
   * Get chalk color function for severity
   */
  private _getSeverityColor(severity: Severity): (text: string) => string {
    switch (severity) {
      case 'CRITICAL': {
        return chalk.red;
      }
      case 'HIGH': {
        return chalk.hex('#FFA500');
      }
      case 'MEDIUM': {
        return chalk.yellow;
      }
      case 'LOW': {
        return chalk.blue;
      }
    }
  }
}
