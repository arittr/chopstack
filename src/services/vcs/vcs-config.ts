import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { match } from 'ts-pattern';
import YAML from 'yaml';

import type { VcsBackend } from '@/core/vcs/interfaces';
import type { VcsMode } from '@/core/vcs/vcs-strategy';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { GraphiteBackend } from '@/adapters/vcs/graphite/backend';
import { MergeCommitBackend } from '@/adapters/vcs/merge-commit/backend';
import { SaplingBackend } from '@/adapters/vcs/sapling/backend';
import { logger } from '@/utils/global-logger';

import type { VcsConfig, VcsConfigService } from './types';

import { VcsConfigFileError, VcsToolUnavailableError } from './types';

/**
 * Configuration file schema
 */
type ConfigFileSchema = {
  vcs?: {
    autoRestack?: boolean;
    branchPrefix?: string;
    mode?: VcsMode;
    submitOnComplete?: boolean;
    trunk?: string;
    worktreePath?: string;
  };
};

/**
 * VCS configuration service implementation
 *
 * Handles loading configuration from file, environment, and CLI arguments,
 * validates VCS mode availability, and creates appropriate backend instances.
 */
export class VcsConfigServiceImpl implements VcsConfigService {
  private _config: VcsConfig | null = null;
  private readonly CONFIG_PATH: string;

  constructor() {
    this.CONFIG_PATH = path.join(os.homedir(), '.chopstack', 'config.yaml');
  }

  /**
   * Load configuration with priority: CLI args > file > defaults
   */
  async loadConfig(workdir: string, cliMode?: VcsMode): Promise<VcsConfig> {
    // 1. Load from config file
    const fileConfig = await this._loadConfigFile();

    // 2. Build config with priority: CLI > file > defaults
    const mode = cliMode ?? fileConfig?.vcs?.mode;
    this._config = {
      workdir,
      trunk: fileConfig?.vcs?.trunk ?? 'main',
      worktreePath: fileConfig?.vcs?.worktreePath ?? '.chopstack/shadows',
      branchPrefix: fileConfig?.vcs?.branchPrefix ?? 'task',
      autoRestack: fileConfig?.vcs?.autoRestack ?? true,
      submitOnComplete: fileConfig?.vcs?.submitOnComplete ?? false,
      ...(mode !== undefined && { mode }),
    };

    logger.debug('VCS config loaded', { config: this._config });
    return this._config;
  }

  /**
   * Validate VCS mode is available
   *
   * For explicit mode (user configured): Fail if tool unavailable
   * For default mode (no config): Use merge-commit (requires only git)
   */
  async validateMode(mode: VcsMode, explicitMode: boolean): Promise<VcsMode> {
    // Get current working directory from config or use process.cwd()
    const workdir = this._config?.workdir ?? process.cwd();

    // Check if mode is available
    const backend = await this.createBackend(mode, workdir);
    const available = await backend.isAvailable();

    if (!available) {
      if (explicitMode) {
        // Explicit mode MUST be available
        throw new VcsToolUnavailableError(mode, this._getInstallInstructions(mode));
      }

      // Auto-detected mode - fallback to merge-commit
      logger.warn(`VCS mode '${mode}' not available, falling back to merge-commit`);
      return 'merge-commit';
    }

    return mode;
  }

  /**
   * Create VCS backend for mode
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createBackend(mode: VcsMode, workdir: string): Promise<VcsBackend> {
    return match(mode)
      .with('git-spice', () => new GitSpiceBackend())
      .with('stacked', () => new GitSpiceBackend()) // Legacy alias
      .with('merge-commit', () => new MergeCommitBackend(workdir))
      .with('simple', () => new MergeCommitBackend(workdir)) // Legacy alias
      .with('graphite', () => new GraphiteBackend(workdir))
      .with('sapling', () => new SaplingBackend(workdir))
      .with('worktree', () => {
        // Legacy worktree mode - use merge-commit
        logger.warn("'worktree' mode is deprecated, using 'merge-commit' instead");
        return new MergeCommitBackend(workdir);
      })
      .exhaustive();
  }

  /**
   * Get current configuration
   */
  getConfig(): VcsConfig | null {
    return this._config;
  }

  /**
   * Load configuration from file
   */
  private async _loadConfigFile(): Promise<ConfigFileSchema | null> {
    try {
      const content = await fs.readFile(this.CONFIG_PATH, 'utf8');
      const parsed = YAML.parse(content) as unknown;
      return parsed as ConfigFileSchema;
    } catch (error) {
      const errorObject = error as { code?: string };
      if (errorObject.code === 'ENOENT') {
        logger.debug('No config file found, using defaults');
        return null;
      }

      // Config file exists but failed to parse
      throw new VcsConfigFileError(
        this.CONFIG_PATH,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Get installation instructions for a VCS mode
   */
  private _getInstallInstructions(mode: VcsMode): string {
    return match(mode)
      .with(
        'git-spice',
        () =>
          '\n\nInstall git-spice:\n' +
          '  brew install abhinav/git-spice/git-spice\n' +
          '  # or\n' +
          '  go install go.abhg.dev/gs@latest',
      )
      .with(
        'stacked',
        () =>
          '\n\nInstall git-spice (stacked mode requires git-spice):\n' +
          '  brew install abhinav/git-spice/git-spice\n' +
          '  # or\n' +
          '  go install go.abhg.dev/gs@latest',
      )
      .with(
        'graphite',
        () => '\n\nInstall graphite CLI:\n' + '  npm install -g @withgraphite/graphite-cli',
      )
      .with(
        'sapling',
        () =>
          '\n\nInstall sapling:\n' +
          '  See https://sapling-scm.com/docs/introduction/getting-started',
      )
      .with('merge-commit', () => '')
      .with('simple', () => '')
      .with('worktree', () => '')
      .exhaustive();
  }
}
