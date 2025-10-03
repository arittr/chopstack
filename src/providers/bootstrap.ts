/**
 * Application bootstrap - initializes DI container with all providers
 */

import { type RuntimeConfig, RuntimeConfigService } from '@/core/config/runtime-config';
import { container, ProviderManager, ServiceIdentifiers } from '@/core/di';

import { CoreServicesProvider } from './core-services.provider';

let bootstrapPromise: Promise<void> | null = null;

/**
 * Bootstrap the application DI container
 */
export async function bootstrapApplication(runtimeConfig?: RuntimeConfig): Promise<void> {
  if (bootstrapPromise !== null) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    // Register runtime configuration first (so it's available to all providers)
    const configService = new RuntimeConfigService(runtimeConfig);
    container.register(ServiceIdentifiers.RuntimeConfig, configService);

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
