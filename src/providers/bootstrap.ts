/**
 * Application bootstrap - initializes DI container with all providers
 */

import { container, ProviderManager } from '@/core/di';

import { CoreServicesProvider } from './core-services.provider';

/**
 * Bootstrap the application DI container
 */
export async function bootstrapApplication(): Promise<void> {
  const manager = new ProviderManager(container);

  // Register all providers
  manager.add(new CoreServicesProvider());
  // Future: Add more providers here
  // manager.add(new AgentProvidersProvider());
  // manager.add(new VcsProvidersProvider());
  // manager.add(new ConfigurationProvider());

  // Initialize all providers
  await manager.initialize();
}

/**
 * Get the configured application container
 * Call bootstrapApplication() first to initialize
 */
export function getContainer(): typeof container {
  return container;
}
