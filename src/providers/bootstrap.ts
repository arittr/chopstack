/**
 * Application bootstrap - initializes DI container with all providers
 */

import { container, ProviderManager } from '@/core/di';

import { CoreServicesProvider } from './core-services.provider';

let bootstrapPromise: Promise<void> | null = null;

/**
 * Bootstrap the application DI container
 */
export async function bootstrapApplication(): Promise<void> {
  if (bootstrapPromise !== null) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const manager = new ProviderManager(container);

    // Register all providers
    manager.add(new CoreServicesProvider());
    // Future: Add more providers here
    // manager.add(new AgentProvidersProvider());
    // manager.add(new VcsProvidersProvider());
    // manager.add(new ConfigurationProvider());

    // Initialize all providers
    await manager.initialize();
  })();

  try {
    await bootstrapPromise;
  } catch (error) {
    bootstrapPromise = null;
    throw error;
  }
}

/**
 * Get the configured application container
 * Call bootstrapApplication() first to initialize
 */
export function getContainer(): typeof container {
  return container;
}
