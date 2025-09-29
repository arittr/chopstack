import { EventEmitter } from 'node:events';

import type { ExecutionTask } from '@/core/execution/types';
import type {
  CommitOptions,
  CommitService,
  ConflictResolutionService,
  RepositoryService,
  StackBuildService,
  StackBuildStrategy,
  VcsAnalysisService,
  WorktreeContext,
  WorktreeService,
} from '@/core/vcs/domain-services';
import type { VcsEngineService } from '@/core/vcs/interfaces';

import { logger } from '@/utils/global-logger';

import { CommitServiceImpl } from './commit-service';
import { ConflictResolutionServiceImpl } from './conflict-resolution-service';
import { RepositoryServiceImpl } from './repository-service';
import { StackBuildServiceImpl, type StackEvent } from './stack-build-service';
import { VcsAnalysisServiceImpl } from './vcs-analysis-service';
import { type WorktreeEvent, WorktreeServiceImpl } from './worktree-service';

export type VcsEngineConfig = {
  branchPrefix: string;
  cleanupOnFailure: boolean;
  cleanupOnSuccess: boolean;
  conflictStrategy: 'auto' | 'manual' | 'fail';
  shadowPath: string;
  stackSubmission: {
    autoMerge: boolean;
    draft: boolean;
    enabled: boolean;
  };
};

export type WorktreeExecutionContext = WorktreeContext;

export type VcsEngineDependencies = {
  analysisService: VcsAnalysisService;
  commitService: CommitService;
  conflictResolutionService: ConflictResolutionService;
  repositoryService: RepositoryService;
  stackBuildService: StackBuildService;
  worktreeService: WorktreeService;
};

// Simple mutex for serializing git operations that need exclusive index access
class GitOperationQueue {
  private _queue: Promise<unknown> = Promise.resolve();

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Create a new promise that chains to the current queue
    const executeOperation = async (): Promise<T> => {
      // Wait for the previous operation to complete
      await this._queue;
      // Execute the new operation
      return operation();
    };

    const resultPromise = executeOperation();

    // Update the queue to wait for this operation (but continue on errors)
    this._queue = (async () => {
      try {
        await resultPromise;
      } catch {
        // Continue queue even if operation fails
      }
    })();

    // Return the result promise
    return resultPromise;
  }
}

/**
 * Main VCS Engine service that coordinates all VCS domain services
 * Implements the VcsEngineService interface for clean architecture integration
 */
export class VcsEngineServiceImpl extends EventEmitter implements VcsEngineService {
  private readonly worktreeService: WorktreeService;
  private readonly commitService: CommitService;
  private readonly repositoryService: RepositoryService;
  private readonly analysisService: VcsAnalysisService;
  private readonly conflictResolutionService: ConflictResolutionService;
  private readonly stackBuildService: StackBuildService;
  private readonly config: VcsEngineConfig;
  private readonly gitOperationQueue: GitOperationQueue;

  constructor(config: VcsEngineConfig, dependencies: Partial<VcsEngineDependencies> = {}) {
    super();
    this.config = config;
    this.gitOperationQueue = new GitOperationQueue();

    // Initialize domain services with DI overrides
    this.worktreeService =
      dependencies.worktreeService ??
      new WorktreeServiceImpl({
        branchPrefix: config.branchPrefix,
        cleanupOnSuccess: config.cleanupOnSuccess,
        cleanupOnFailure: config.cleanupOnFailure,
        shadowPath: config.shadowPath,
      });

    this.commitService =
      dependencies.commitService ??
      new CommitServiceImpl({
        defaultGenerateMessage: true,
        enforceConventionalCommits: false,
      });

    this.repositoryService = dependencies.repositoryService ?? new RepositoryServiceImpl();

    this.analysisService = dependencies.analysisService ?? new VcsAnalysisServiceImpl();

    this.conflictResolutionService =
      dependencies.conflictResolutionService ?? new ConflictResolutionServiceImpl();

    this.stackBuildService =
      dependencies.stackBuildService ??
      new StackBuildServiceImpl({
        branchPrefix: config.branchPrefix,
        parentRef: 'main',
        stackSubmissionEnabled: config.stackSubmission.enabled,
      });

    this._setupEventForwarding();
  }

  getDefaultParentRef(): string {
    return this.stackBuildService.getDefaultParentRef();
  }

  async initialize(workdir: string): Promise<void> {
    logger.info(`🔧 Initializing VCS engine for ${workdir}`);

    // Verify the directory is a git repository
    const isClean = await this.repositoryService.isClean(workdir);
    logger.info(`📊 Repository status: ${isClean ? 'clean' : 'has changes'}`);

    // Log current branch
    const currentBranch = await this.repositoryService.getCurrentBranch(workdir);
    logger.info(`🌿 Current branch: ${currentBranch}`);

    logger.info(`✅ VCS engine initialized successfully`);
  }

  initializeStackState(parentRef: string): void {
    this.stackBuildService.initializeStackState(parentRef);
  }

  async addTaskToStack(
    task: ExecutionTask,
    workdir: string,
    worktreeContext?: WorktreeContext,
  ): Promise<string | null> {
    return this.stackBuildService.addTaskToStack(task, workdir, worktreeContext);
  }

  async analyzeWorktreeNeeds(
    tasks: ExecutionTask[],
    workdir: string,
  ): Promise<{
    estimatedDiskUsage: number;
    maxConcurrentTasks: number;
    parallelLayers: number;
    requiresWorktrees: boolean;
  }> {
    return this.analysisService.analyzeWorktreeNeeds(tasks, workdir);
  }

  async createWorktreesForTasks(
    tasks: ExecutionTask[],
    baseRef: string,
    workdir: string,
  ): Promise<WorktreeExecutionContext[]> {
    logger.info(`🏗️ Creating worktrees for ${tasks.length} tasks from base ${baseRef}`);

    const worktreePromises = tasks.map(async (task) => {
      // Use the task's branchName if provided, otherwise create a temporary branch
      const branchName = task.branchName ?? `tmp-chopstack/${task.id}`;
      const worktreePath = `${this.config.shadowPath}/${task.id}`;

      const context = await this.worktreeService.createWorktree({
        taskId: task.id,
        branchName,
        worktreePath,
        baseRef,
        workdir,
      });

      return context;
    });

    const contexts = await Promise.all(worktreePromises);
    logger.info(`✅ Created ${contexts.length} worktrees successfully`);
    return contexts;
  }

  async commitTaskChanges(
    task: ExecutionTask,
    context: WorktreeExecutionContext,
    options: CommitOptions = {},
  ): Promise<string> {
    logger.info(`📝 Committing changes for task ${task.id} in worktree ${context.worktreePath}`);

    const commitHash = await this.commitService.commitChanges(task, context, options);

    // Update task with commit hash
    task.commitHash = commitHash;

    return commitHash;
  }

  async buildStackFromTasks(
    tasks: ExecutionTask[],
    workdir: string,
    options: {
      parentRef?: string;
      strategy?: StackBuildStrategy;
      submitStack?: boolean;
    } = {},
  ): Promise<{
    branches: Array<{ branchName: string; commitHash: string; taskId: string }>;
    parentRef: string;
    prUrls?: string[] | undefined;
  }> {
    const parentRef = options.parentRef ?? 'main';
    const strategy = options.strategy ?? 'dependency-order';

    logger.info(`🏗️ Building git-spice stack from ${tasks.length} tasks`);

    // Build the stack
    const stackInfo = await this.stackBuildService.buildStack(tasks, workdir, {
      parentRef,
      strategy,
    });

    if (stackInfo.failedTasks !== undefined && stackInfo.failedTasks.length > 0) {
      for (const failure of stackInfo.failedTasks) {
        logger.warn(`⚠️ Stack branch skipped for task ${failure.taskId}: ${failure.reason}`);
      }
    }

    // Submit stack if requested and enabled
    if (options.submitStack === true && this.config.stackSubmission.enabled) {
      try {
        const prUrls = await this.stackBuildService.submitStack(workdir);
        stackInfo.prUrls = prUrls;
      } catch (error) {
        logger.warn(
          `⚠️ Stack built but submission failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return stackInfo;
  }

  async cleanupWorktrees(contexts: WorktreeExecutionContext[]): Promise<void> {
    const shouldCleanup = this.config.cleanupOnSuccess || this.config.cleanupOnFailure;

    if (!shouldCleanup) {
      logger.info('🏗️ Preserving worktrees for debugging');
      return;
    }

    const taskIds = contexts.map((c) => c.taskId);
    await this.worktreeService.cleanupWorktrees(taskIds);
  }

  async createBranchFromCommit(
    branchName: string,
    commitHash: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    await this.stackBuildService.createBranchFromCommit(
      branchName,
      commitHash,
      parentBranch,
      workdir,
    );
  }

  async restack(workdir: string): Promise<void> {
    await this.stackBuildService.restack(workdir);
  }

  async createStackBranch(
    branchName: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    // Serialize branch creation to avoid git index lock conflicts
    await this.gitOperationQueue.execute(async () => {
      await this.stackBuildService.createStackBranch(branchName, parentBranch, workdir);
    });
  }

  async commitInStack(
    task: ExecutionTask,
    context: WorktreeExecutionContext,
    options: CommitOptions = {},
  ): Promise<string> {
    // Use git-spice backend for stack-aware commits
    return this.stackBuildService.commitInStack(task, context, options);
  }

  async fetchWorktreeCommits(tasks: ExecutionTask[], workdir: string): Promise<void> {
    // Fetch commits from worktrees to make them available in the main repository
    const { fetchWorktreeCommits } = await import('@/adapters/vcs/git-spice/worktree-sync');
    await fetchWorktreeCommits(tasks, workdir);
  }

  async trackBranch(branchName: string, parentBranch: string, workdir: string): Promise<void> {
    // Track an existing branch with the VCS backend
    await this.stackBuildService.trackBranch(branchName, parentBranch, workdir);
  }

  async updateBranchToCommit(
    branchName: string,
    commitHash: string,
    workdir: string,
  ): Promise<void> {
    // Update a branch to point to a specific commit
    await this.stackBuildService.updateBranchToCommit(branchName, commitHash, workdir);
  }

  private _setupEventForwarding(): void {
    // Forward worktree events - implementation extends EventEmitter
    if ('on' in this.worktreeService && typeof this.worktreeService.on === 'function') {
      const worktreeEmitter = this.worktreeService as unknown as EventEmitter;
      worktreeEmitter.on('worktree_created', (event: WorktreeEvent) => {
        this.emit('worktree_created', event);
      });

      worktreeEmitter.on('worktree_cleanup', (event: WorktreeEvent) => {
        this.emit('worktree_cleanup', event);
      });
    }

    // Forward stack build events - implementation extends EventEmitter
    if ('on' in this.stackBuildService && typeof this.stackBuildService.on === 'function') {
      const stackEmitter = this.stackBuildService as unknown as EventEmitter;
      stackEmitter.on('branch_created', (event: StackEvent) => {
        this.emit('branch_created', event);
      });

      stackEmitter.on('stack_built', (event: StackEvent) => {
        this.emit('stack_built', event);
      });
    }
  }
}
