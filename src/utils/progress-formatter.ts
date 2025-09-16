import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export class ProgressFormatter {
  private static readonly BAR_WIDTH = 30;
  private _spinner: Ora | null = null;

  createSpinner(text?: string): Ora {
    if (this._spinner !== null) {
      this._spinner.stop();
    }
    this._spinner = ora({
      text: text ?? '',
      spinner: 'dots',
      color: 'cyan',
    });
    return this._spinner;
  }

  stopSpinner(): void {
    if (this._spinner !== null) {
      this._spinner.stop();
      this._spinner = null;
    }
  }

  formatProgressBar(current: number, total: number, showPercentage = true): string {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const filledWidth = Math.round((percentage / 100) * ProgressFormatter.BAR_WIDTH);
    const emptyWidth = ProgressFormatter.BAR_WIDTH - filledWidth;

    const filled = '█'.repeat(filledWidth);
    const empty = '░'.repeat(emptyWidth);
    const bar = `[${filled}${empty}]`;

    if (showPercentage) {
      return `${bar} ${percentage}%`;
    }
    return bar;
  }

  formatTaskProgress(
    completed: number,
    total: number,
    running: number,
    failed: number = 0,
  ): string {
    const parts: string[] = [];

    parts.push(chalk.bold(`[${completed}/${total}]`));

    if (running > 0) {
      parts.push(chalk.yellow(`${running} running`));
    }

    if (failed > 0) {
      parts.push(chalk.red(`✗ ${failed} failed`));
    }

    return parts.join(' ');
  }

  formatLayerProgress(currentLayer: number, totalLayers: number): string {
    return chalk.cyan(`Layer ${currentLayer}/${totalLayers}`);
  }

  formatETA(seconds: number): string {
    if (seconds < 0) {
      return 'calculating...';
    }

    if (seconds < 60) {
      return `~${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return remainingSeconds > 0 ? `~${minutes}m ${remainingSeconds}s` : `~${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `~${hours}h ${remainingMinutes}m`;
  }

  formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return this.formatETA(seconds);
  }

  formatTaskStatus(
    taskId: string,
    status: 'running' | 'completed' | 'failed',
    duration?: number,
  ): string {
    const icon = {
      running: chalk.yellow('⠋'),
      completed: chalk.green('✓'),
      failed: chalk.red('✗'),
    }[status];

    const durationString = duration !== undefined ? ` (${this.formatDuration(duration)})` : '';
    return `${icon} ${taskId}${durationString}`;
  }

  formatParallelTasks(tasks: string[], maxDisplay = 3): string[] {
    const lines: string[] = [];
    const displayTasks = tasks.slice(0, maxDisplay);

    for (const [index, task] of displayTasks.entries()) {
      const prefix = index === displayTasks.length - 1 && tasks.length <= maxDisplay ? '└─' : '├─';
      lines.push(`${chalk.dim(`  ${prefix}`)} ${task}`);
    }

    if (tasks.length > maxDisplay) {
      lines.push(chalk.dim(`  └─ ... and ${tasks.length - maxDisplay} more`));
    }

    return lines;
  }

  clearLine(): string {
    return '\r\u001B[K';
  }

  moveCursorUp(lines: number): string {
    return `\u001B[${lines}A`;
  }

  hideCursor(): string {
    return '\u001B[?25l';
  }

  showCursor(): string {
    return '\u001B[?25h';
  }

  formatSummaryBox(title: string, lines: string[]): string {
    const maxLength = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
    const horizontalLine = '═'.repeat(maxLength);

    const result: string[] = [
      chalk.gray(`╔${horizontalLine}╗`),
      chalk.gray('║ ') + chalk.bold(title.padEnd(maxLength - 2)) + chalk.gray(' ║'),
      chalk.gray(`╠${horizontalLine}╣`),
    ];

    for (const line of lines) {
      result.push(chalk.gray('║ ') + line.padEnd(maxLength - 2) + chalk.gray(' ║'));
    }

    result.push(chalk.gray(`╚${horizontalLine}╝`));
    return result.join('\n');
  }

  formatMetrics(metrics: {
    averageTaskDuration?: number;
    criticalPathDuration?: number;
    parallelizationEfficiency?: number;
  }): string[] {
    const lines: string[] = [];

    if (metrics.parallelizationEfficiency !== undefined && metrics.parallelizationEfficiency > 0) {
      const efficiency = Math.round(metrics.parallelizationEfficiency * 100);
      const color = efficiency >= 80 ? chalk.green : efficiency >= 50 ? chalk.yellow : chalk.red;
      lines.push(color(`Parallelization: ${efficiency}%`));
    }

    if (metrics.averageTaskDuration !== undefined && metrics.averageTaskDuration > 0) {
      lines.push(`Avg Task Time: ${this.formatDuration(metrics.averageTaskDuration)}`);
    }

    if (metrics.criticalPathDuration !== undefined && metrics.criticalPathDuration > 0) {
      lines.push(`Critical Path: ${this.formatDuration(metrics.criticalPathDuration)}`);
    }

    return lines;
  }
}

export class TaskProgressManager {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly _spinners: Map<string, Ora> = new Map();

  private _mainSpinner: Ora | null = null;

  startTask(taskId: string, message: string): void {
    const spinner = ora({
      text: message,
      spinner: 'dots',
      color: 'cyan',
      indent: 2,
    }).start();
    this._spinners.set(taskId, spinner);
  }

  updateTask(taskId: string, message: string): void {
    const spinner = this._spinners.get(taskId);
    if (spinner !== undefined) {
      spinner.text = message;
    }
  }

  completeTask(taskId: string, message?: string): void {
    const spinner = this._spinners.get(taskId);
    if (spinner !== undefined) {
      spinner.succeed(message ?? spinner.text);
      this._spinners.delete(taskId);
    }
  }

  failTask(taskId: string, message?: string): void {
    const spinner = this._spinners.get(taskId);
    if (spinner !== undefined) {
      spinner.fail(message ?? spinner.text);
      this._spinners.delete(taskId);
    }
  }

  updateMainProgress(text: string): void {
    if (this._mainSpinner === null) {
      this._mainSpinner = ora({
        text,
        spinner: 'dots',
        color: 'cyan',
      }).start();
    } else {
      this._mainSpinner.text = text;
    }
  }

  stopAll(): void {
    for (const spinner of this._spinners.values()) {
      spinner.stop();
    }
    this._spinners.clear();

    if (this._mainSpinner !== null) {
      this._mainSpinner.stop();
      this._mainSpinner = null;
    }
  }
}

export const createProgressLine = (
  completed: number,
  total: number,
  running: string[],
  failed: number,
  currentLayer: number,
  totalLayers: number,
  eta: number,
): string => {
  const formatter = new ProgressFormatter();

  const parts = [
    formatter.formatLayerProgress(currentLayer, totalLayers),
    formatter.formatTaskProgress(completed, total, running.length, failed),
    formatter.formatProgressBar(completed, total),
  ];

  if (eta >= 0) {
    parts.push(chalk.dim(`ETA: ${formatter.formatETA(eta)}`));
  }

  return parts.join(chalk.gray(' | '));
};
