/**
 * Core services provider for dependency injection
 */

import type { Container } from '@/core/di';

import { BaseServiceProvider, ServiceIdentifiers } from '@/core/di';
import { AgentServiceImpl } from '@/services/agents';
import { ExecutionEngine, StateManager } from '@/services/execution';
import { TaskOrchestrator } from '@/services/orchestration';
import { VcsEngineServiceImpl } from '@/services/vcs';
import { logger } from '@/utils/logger';

export class CoreServicesProvider extends BaseServiceProvider {
  register(container: Container): void {
    // Register logger
    container.register(ServiceIdentifiers.Logger, logger);

    // Register core services as singletons
    container.registerSingleton(ServiceIdentifiers.AgentService, () => new AgentServiceImpl());

    container.registerSingleton(ServiceIdentifiers.TaskOrchestrator, () => new TaskOrchestrator());

    container.registerSingleton(ServiceIdentifiers.StateManager, () => new StateManager());

    container.registerSingleton(
      ServiceIdentifiers.VcsEngineService,
      () =>
        new VcsEngineServiceImpl({
          shadowPath: '.chopstack/shadows',
          branchPrefix: 'chopstack/',
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: 'auto',
          stackSubmission: {
            enabled: false,
            draft: true,
            autoMerge: false,
          },
        }),
    );

    // Register ExecutionEngine with dependencies
    container.registerSingleton(ServiceIdentifiers.ExecutionEngine, () => {
      const orchestrator = container.get<TaskOrchestrator>(ServiceIdentifiers.TaskOrchestrator);
      const stateManager = container.get<StateManager>(ServiceIdentifiers.StateManager);
      const vcsEngine = container.get<VcsEngineServiceImpl>(ServiceIdentifiers.VcsEngineService);

      return new ExecutionEngine({
        orchestrator,
        stateManager,
        vcsEngine,
      });
    });
  }
}
