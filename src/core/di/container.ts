/**
 * Simple dependency injection container for chopstack
 */

// Container imports (no external dependencies needed for core container)

/**
 * Service identifiers for dependency injection
 */
export const ServiceIdentifiers = {
  // Core services
  Logger: Symbol.for('Logger'),
  VcsEngineService: Symbol.for('VcsEngineService'),
  AgentService: Symbol.for('AgentService'),
  ExecutionEngine: Symbol.for('ExecutionEngine'),
  TaskOrchestrator: Symbol.for('TaskOrchestrator'),

  // Domain services
  ExecutionPlanner: Symbol.for('ExecutionPlanner'),
  ExecutionMonitor: Symbol.for('ExecutionMonitor'),
  StateManager: Symbol.for('StateManager'),

  // VCS services
  RepositoryService: Symbol.for('RepositoryService'),
  CommitService: Symbol.for('CommitService'),
  WorktreeService: Symbol.for('WorktreeService'),
  ConflictResolutionService: Symbol.for('ConflictResolutionService'),
  StackBuildService: Symbol.for('StackBuildService'),
  VcsAnalysisService: Symbol.for('VcsAnalysisService'),

  // Agent providers
  ClaudeAgent: Symbol.for('ClaudeAgent'),
  CodexAgent: Symbol.for('CodexAgent'),
  MockAgent: Symbol.for('MockAgent'),

  // Configuration
  Config: Symbol.for('Config'),
} as const;

type ServiceIdentifier = (typeof ServiceIdentifiers)[keyof typeof ServiceIdentifiers];

/**
 * Simple service container implementation
 */
export class Container {
  private readonly services = new Map<ServiceIdentifier, unknown>();
  private readonly factories = new Map<ServiceIdentifier, () => unknown>();
  private readonly singletons = new Map<ServiceIdentifier, unknown>();

  /**
   * Register a service instance
   */
  register<T>(identifier: ServiceIdentifier, service: T): void {
    this.services.set(identifier, service);
  }

  /**
   * Register a factory function for lazy instantiation
   */
  registerFactory<T>(identifier: ServiceIdentifier, factory: () => T): void {
    this.factories.set(identifier, factory);
  }

  /**
   * Register a singleton factory (instantiated once on first access)
   */
  registerSingleton<T>(identifier: ServiceIdentifier, factory: () => T): void {
    this.factories.set(identifier, () => {
      if (!this.singletons.has(identifier)) {
        this.singletons.set(identifier, factory());
      }
      return this.singletons.get(identifier) as T;
    });
  }

  /**
   * Get a service from the container
   */
  get<T>(identifier: ServiceIdentifier): T {
    // Check direct registrations first
    if (this.services.has(identifier)) {
      return this.services.get(identifier) as T;
    }

    // Check factories
    if (this.factories.has(identifier)) {
      const factory = this.factories.get(identifier);
      return factory?.() as T;
    }

    throw new Error(`Service ${String(identifier)} not registered in container`);
  }

  /**
   * Check if a service is registered
   */
  has(identifier: ServiceIdentifier): boolean {
    return this.services.has(identifier) || this.factories.has(identifier);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }

  /**
   * Create a child container that inherits from this one
   */
  createChild(): Container {
    const child = new Container();
    // Copy parent registrations
    for (const [key, value] of this.services) {
      child.services.set(key, value);
    }
    for (const [key, value] of this.factories) {
      child.factories.set(key, value);
    }
    return child;
  }
}

/**
 * Global application container instance
 */
export const container = new Container();
