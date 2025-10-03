/**
 * Runtime configuration for the application
 * Contains settings that are determined at startup (CLI flags, etc.)
 */

export type RuntimeConfig = {
  /** Enable TUI mode */
  tui?: boolean;
  /** Enable verbose logging for task execution */
  verbose?: boolean;
  /** Enable file logging */
  writeLog?: boolean;
};

/**
 * Service that holds runtime configuration
 */
export class RuntimeConfigService {
  private _config: RuntimeConfig;

  constructor(config: RuntimeConfig = {}) {
    this._config = config;
  }

  get verbose(): boolean {
    return this._config.verbose ?? false;
  }

  get tui(): boolean {
    return this._config.tui ?? true;
  }

  get writeLog(): boolean {
    return this._config.writeLog ?? false;
  }

  getConfig(): Readonly<RuntimeConfig> {
    return { ...this._config };
  }

  updateConfig(updates: Partial<RuntimeConfig>): void {
    this._config = { ...this._config, ...updates };
  }
}
