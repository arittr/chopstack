import type { AgentService } from '@/core/agents/interfaces';
import type { ExecutionEngine } from '@/services/execution';

/**
 * Base command interface that all commands must implement
 */
export type Command<TOptions = unknown> = {
  /**
   * Command description for help text
   */
  readonly description: string;

  /**
   * Execute the command with given options
   * Returns exit code (0 for success, non-zero for failure)
   */
  execute(options: TOptions): Promise<number> | number;

  /**
   * Command name for identification
   */
  readonly name: string;
};

/**
 * Command result with detailed information
 */
export type CommandResult = {
  error?: Error;
  exitCode: number;
  output?: unknown;
};

/**
 * Command context with shared dependencies
 */
export type CommandContext = {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env?: Record<string, string | undefined>;
  /** Logger instance */
  logger: {
    debug?: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
  };
};

/**
 * Optional service overrides for commands (primarily for testing)
 */
export type CommandServiceOverrides = {
  agentService?: AgentService;
  executionEngine?: ExecutionEngine;
};

/**
 * Command dependencies for dependency injection
 */
export type CommandDependencies = {
  context: CommandContext;
  services?: CommandServiceOverrides;
};

/**
 * Abstract base class for commands
 */
export abstract class BaseCommand<TOptions = unknown> implements Command<TOptions> {
  constructor(
    public readonly name: string,
    public readonly description: string,
    protected readonly dependencies: CommandDependencies,
  ) {}

  abstract execute(options: TOptions): Promise<number> | number;

  protected get logger(): CommandContext['logger'] {
    return this.dependencies.context.logger;
  }

  protected get context(): CommandContext {
    return this.dependencies.context;
  }

  protected get cwd(): CommandContext['cwd'] {
    return this.dependencies.context.cwd;
  }
}
