/**
 * Core services provider for dependency injection
 */

import type { Container } from '@/core/di';
import type {
  CommitService,
  ConflictResolutionService,
  RepositoryService,
  VcsAnalysisService,
  WorktreeService,
} from '@/core/vcs/domain-services';

import { BaseServiceProvider, ServiceIdentifiers } from '@/core/di';
import { AgentServiceImpl } from '@/services/agents';
import {
  ExecutionEngine,
  type ExecutionMonitorService,
  ExecutionMonitorServiceImpl,
  ExecutionOrchestrator,
  type ExecutionPlannerService,
  ExecutionPlannerServiceImpl,
  StateManager,
} from '@/services/execution';
import { type TaskExecutionAdapter, TaskOrchestrator } from '@/services/orchestration';
import { DynamicTaskExecutionAdapter } from '@/services/orchestration/adapters/dynamic-task-execution-adapter';
import {
  CommitServiceImpl,
  ConflictResolutionServiceImpl,
  RepositoryServiceImpl,
  StackBuildServiceImpl,
  VcsAnalysisServiceImpl,
  type VcsEngineConfig,
  VcsEngineServiceImpl,
  WorktreeServiceImpl,
} from '@/services/vcs';
import { logger } from '@/utils/logger';

export class CoreServicesProvider extends BaseServiceProvider {
  register(container: Container): void {
    // Register logger
    container.register(ServiceIdentifiers.Logger, logger);

    // Register core services as singletons
    container.registerSingleton(ServiceIdentifiers.AgentService, () => new AgentServiceImpl());

    container.registerSingleton(ServiceIdentifiers.TaskExecutionAdapter, () => {
      return new DynamicTaskExecutionAdapter();
    });

    container.registerSingleton(ServiceIdentifiers.TaskOrchestrator, () => {
      const adapter = container.get<TaskExecutionAdapter>(ServiceIdentifiers.TaskExecutionAdapter);
      return new TaskOrchestrator(adapter);
    });

    container.registerSingleton(ServiceIdentifiers.StateManager, () => new StateManager());

    container.registerSingleton(ServiceIdentifiers.ExecutionPlanner, () => {
      return new ExecutionPlannerServiceImpl();
    });

    container.registerSingleton(ServiceIdentifiers.ExecutionMonitor, () => {
      return new ExecutionMonitorServiceImpl({
        enableProgressBar: true,
        enableRealTimeStats: true,
        logLevel: 'info',
      });
    });

    const defaultVcsConfig: VcsEngineConfig = {
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
    };

    container.registerSingleton(ServiceIdentifiers.WorktreeService, () => {
      return new WorktreeServiceImpl({
        branchPrefix: defaultVcsConfig.branchPrefix,
        cleanupOnSuccess: defaultVcsConfig.cleanupOnSuccess,
        cleanupOnFailure: defaultVcsConfig.cleanupOnFailure,
        shadowPath: defaultVcsConfig.shadowPath,
      });
    });

    container.registerSingleton(ServiceIdentifiers.CommitService, () => {
      return new CommitServiceImpl();
    });

    container.registerSingleton(ServiceIdentifiers.RepositoryService, () => {
      return new RepositoryServiceImpl();
    });

    container.registerSingleton(ServiceIdentifiers.ConflictResolutionService, () => {
      return new ConflictResolutionServiceImpl();
    });

    container.registerSingleton(ServiceIdentifiers.StackBuildService, () => {
      const conflictResolutionService = container.get<ConflictResolutionService>(
        ServiceIdentifiers.ConflictResolutionService,
      );

      return new StackBuildServiceImpl(
        {
          branchPrefix: defaultVcsConfig.branchPrefix,
          parentRef: 'main',
          stackSubmissionEnabled: defaultVcsConfig.stackSubmission.enabled,
          stackSubmission: defaultVcsConfig.stackSubmission,
          conflictStrategy: defaultVcsConfig.conflictStrategy,
        },
        {
          conflictResolutionService,
        },
      );
    });

    container.registerSingleton(ServiceIdentifiers.VcsAnalysisService, () => {
      return new VcsAnalysisServiceImpl();
    });

    container.registerSingleton(ServiceIdentifiers.VcsEngineService, () => {
      const worktreeService = container.get<WorktreeService>(ServiceIdentifiers.WorktreeService);
      const commitService = container.get<CommitService>(ServiceIdentifiers.CommitService);
      const repositoryService = container.get<RepositoryService>(
        ServiceIdentifiers.RepositoryService,
      );
      const conflictResolutionService = container.get<ConflictResolutionService>(
        ServiceIdentifiers.ConflictResolutionService,
      );
      const stackBuildService = container.get<StackBuildServiceImpl>(
        ServiceIdentifiers.StackBuildService,
      );
      const analysisService = container.get<VcsAnalysisService>(
        ServiceIdentifiers.VcsAnalysisService,
      );

      return new VcsEngineServiceImpl(defaultVcsConfig, {
        worktreeService,
        commitService,
        repositoryService,
        conflictResolutionService,
        stackBuildService,
        analysisService,
      });
    });

    container.registerSingleton(ServiceIdentifiers.ExecutionOrchestrator, () => {
      const taskOrchestrator = container.get<TaskOrchestrator>(ServiceIdentifiers.TaskOrchestrator);
      const vcsEngine = container.get<VcsEngineServiceImpl>(ServiceIdentifiers.VcsEngineService);
      return new ExecutionOrchestrator({
        taskOrchestrator,
        vcsEngine,
      });
    });

    // Register ExecutionEngine with dependencies
    container.registerSingleton(ServiceIdentifiers.ExecutionEngine, () => {
      const orchestrator = container.get<ExecutionOrchestrator>(
        ServiceIdentifiers.ExecutionOrchestrator,
      );
      const plannerService = container.get<ExecutionPlannerService>(
        ServiceIdentifiers.ExecutionPlanner,
      );
      const monitorService = container.get<ExecutionMonitorService>(
        ServiceIdentifiers.ExecutionMonitor,
      );
      const stateManager = container.get<StateManager>(ServiceIdentifiers.StateManager);

      return new ExecutionEngine({
        orchestrator,
        plannerService,
        monitorService,
        stateManager,
      });
    });
  }
}
