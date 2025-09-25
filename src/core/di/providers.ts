/**
 * Service provider interfaces and base implementation
 */

import type { Container } from './container';

/**
 * Interface for service providers that can register services with the container
 */
export type ServiceProvider = {
  /**
   * Optional bootstrap hook called after all providers are registered
   */
  boot?(container: Container): void | Promise<void>;

  /**
   * Register services with the container
   */
  register(container: Container): void | Promise<void>;
};

/**
 * Base service provider class
 */
export abstract class BaseServiceProvider implements ServiceProvider {
  abstract register(container: Container): void | Promise<void>;

  boot?(container: Container): void | Promise<void>;
}

/**
 * Provider manager for registering multiple providers
 */
export class ProviderManager {
  private readonly providers: ServiceProvider[] = [];

  constructor(private readonly _container: Container) {}

  /**
   * Add a provider to be registered
   */
  add(provider: ServiceProvider): this {
    this.providers.push(provider);
    return this;
  }

  /**
   * Register all providers with the container
   */
  async register(): Promise<void> {
    for (const provider of this.providers) {
      await provider.register(this._container);
    }
  }

  /**
   * Bootstrap all providers (call after registration)
   */
  async boot(): Promise<void> {
    for (const provider of this.providers) {
      if (provider.boot !== undefined) {
        await provider.boot(this._container);
      }
    }
  }

  /**
   * Register and bootstrap all providers
   */
  async initialize(): Promise<void> {
    await this.register();
    await this.boot();
  }
}
