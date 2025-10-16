import type { VcsBackend } from '@/core/vcs/interfaces';
import type { VcsMode } from '@/core/vcs/vcs-strategy';

/**
 * Configuration for VCS mode
 *
 * Defines all settings for VCS backend selection, worktree management,
 * and stack integration behavior.
 */
export type VcsConfig = {
  /**
   * Auto-restack after task completion (git-spice, graphite only)
   *
   * @default true
   */
  autoRestack?: boolean;

  /**
   * Branch name prefix for task branches
   *
   * @default 'task'
   */
  branchPrefix?: string;

  /**
   * VCS mode to use
   *
   * - git-spice: Stacking workflow with gs CLI
   * - merge-commit: Simple merge workflow (default)
   * - graphite: Graphite stacking (stubbed)
   * - sapling: Sapling workflow (stubbed)
   *
   * If undefined, defaults to merge-commit
   */
  mode?: VcsMode;

  /**
   * Submit stack for review after completion
   *
   * @default false
   */
  submitOnComplete?: boolean;

  /**
   * Main branch name
   *
   * @default 'main'
   */
  trunk?: string;

  /**
   * Working directory (repository root)
   */
  workdir: string;

  /**
   * Path for worktree creation (relative to workdir)
   *
   * @default '.chopstack/shadows'
   */
  worktreePath?: string;
};

/**
 * VCS configuration service
 *
 * Responsibilities:
 * - Load configuration from file or environment
 * - Validate VCS mode against available tools
 * - Create appropriate VCS backend instance
 * - Provide configuration to MCP tools and slash commands
 */
export type VcsConfigService = {
  /**
   * Create VCS backend for mode
   *
   * @param mode - VCS mode
   * @param workdir - Working directory
   * @returns VCS backend instance
   */
  createBackend(mode: VcsMode, workdir: string): Promise<VcsBackend>;

  /**
   * Get current configuration
   *
   * @returns Current config or null if not loaded
   */
  getConfig(): VcsConfig | null;

  /**
   * Load configuration from file and environment
   *
   * Priority: CLI args > config file > defaults
   *
   * @param workdir - Working directory (repository root)
   * @param cliMode - VCS mode from CLI flag (optional)
   * @returns Loaded configuration
   */
  loadConfig(workdir: string, cliMode?: VcsMode): Promise<VcsConfig>;

  /**
   * Validate VCS mode is available
   *
   * @param mode - VCS mode to validate
   * @param explicitMode - Whether mode was explicitly configured
   * @throws Error if explicit mode unavailable
   * @returns Original mode or fallback if auto-detected
   */
  validateMode(mode: VcsMode, explicitMode: boolean): Promise<VcsMode>;
};

/**
 * Configuration error types
 */
export class VcsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VcsConfigError';
  }
}

export class VcsToolUnavailableError extends VcsConfigError {
  public override readonly name = 'VcsToolUnavailableError';

  constructor(
    public readonly mode: VcsMode,
    public readonly installInstructions: string,
  ) {
    super(`VCS tool for mode '${mode}' is not available.\n\n${installInstructions}`);
  }
}

export class VcsConfigFileError extends VcsConfigError {
  public override readonly name = 'VcsConfigFileError';
  public readonly configPath: string;
  public override readonly cause: Error;

  constructor(configPath: string, cause: Error) {
    super(`Failed to load config file at ${configPath}: ${cause.message}`);
    this.configPath = configPath;
    this.cause = cause;
  }
}
