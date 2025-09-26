/**
 * Command factory and registry for easy command creation
 */

import { logger } from '@/utils/global-logger';

import type {
  Command,
  CommandContext,
  CommandDependencies,
  CommandServiceOverrides,
} from './types';

/**
 * Command registry to manage all available commands
 */
export class CommandRegistry {
  private readonly commands = new Map<string, () => Command>();

  /**
   * Register a command factory
   */
  register(name: string, factory: () => Command): void {
    this.commands.set(name, factory);
  }

  /**
   * Get a command by name
   */
  get(name: string): Command | undefined {
    const factory = this.commands.get(name);
    return factory !== undefined ? factory() : undefined;
  }

  /**
   * Get all registered command names
   */
  getNames(): string[] {
    return [...this.commands.keys()];
  }

  /**
   * Check if a command exists
   */
  has(name: string): boolean {
    return this.commands.has(name);
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new CommandRegistry();

/**
 * Default command dependencies factory
 */
export function createDefaultDependencies(
  overrides?: Partial<CommandContext>,
  serviceOverrides?: CommandServiceOverrides,
): CommandDependencies {
  return {
    context: {
      logger: overrides?.logger ?? logger,
      cwd: overrides?.cwd ?? process.cwd(),
      env: overrides?.env ?? process.env,
    },
    ...(serviceOverrides !== undefined ? { services: serviceOverrides } : {}),
  };
}

/**
 * Decorator to automatically register commands
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function RegisterCommand(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <T extends new (...args: any[]) => Command>(constructor: T): T {
    commandRegistry.register(name, () => {
      const deps = createDefaultDependencies();
      return new constructor(deps);
    });
    return constructor;
  };
}

/**
 * Create and execute a command by name
 */
export async function executeCommand(
  name: string,
  args: unknown,
  overrides?: Partial<CommandContext>,
): Promise<number> {
  const command = commandRegistry.get(name);

  if (command === undefined) {
    throw new Error(
      `Unknown command: ${name}. Available: ${commandRegistry.getNames().join(', ')}`,
    );
  }

  // Apply context overrides if needed
  if (overrides !== undefined && Object.keys(overrides).length > 0) {
    const deps = createDefaultDependencies(overrides);
    const CommandClass = command.constructor as new (deps: CommandDependencies) => Command;
    const overriddenCommand = new CommandClass(deps);
    const result = await overriddenCommand.execute(args);
    return typeof result === 'number' ? result : 0;
  }

  const result = await command.execute(args);
  return typeof result === 'number' ? result : 0;
}
