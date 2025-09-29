import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

import { execa } from 'execa';

import type { ExecutionTask } from '@/core/execution/types';
import type {
  CommitOptions,
  ConflictInfo,
  ConflictResolutionService,
  ConflictResolutionStrategy,
  StackBuildService,
  StackBuildStrategy,
  StackInfo,
  WorktreeContext,
} from '@/core/vcs/domain-services';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import {
  fetchSingleWorktreeCommit,
  fetchWorktreeCommits,
} from '@/adapters/vcs/git-spice/worktree-sync';
import { GitWrapper } from '@/adapters/vcs/git-wrapper';
import { logger } from '@/utils/global-logger';
import { isDefined, isNonEmptyString } from '@/validation/guards';

export type StackEvent = {
  branchName?: string;
  stackInfo?: StackInfo;
  taskId?: string;
  timestamp: Date;
  type: 'branch_created' | 'stack_built' | 'conflict_detected' | 'conflict_resolved';
};

export type StackBuildServiceConfig = {
  branchPrefix: string;
  conflictStrategy?: ConflictResolutionStrategy;
  parentRef: string;
  retryConfig?: {
    maxRetries?: number;
    retryDelayMs?: number;
  };
  stackSubmission?: {
    autoMerge?: boolean;
    draft?: boolean;
    extraArgs?: string[];
  };
  stackSubmissionEnabled: boolean;
};

export type StackBuildServiceDependencies = {
  conflictResolutionService?: ConflictResolutionService;
};

type StackSubmissionOptions = {
  autoMerge?: boolean;
  draft?: boolean;
  extraArgs?: string[];
};

type BranchCreationResult = {
  branchName?: string;
  reason?: string;
  success: boolean;
};

type CherryPickResult = {
  reason?: string;
  success: boolean;
};

type StackState = {
  pending: Map<string, ExecutionTask>; // Tasks waiting on dependencies
  stacked: Set<string>; // Task IDs already in stack
  taskToBranch: Map<string, string>; // Maps task ID to branch name
  tip: string; // Current top of stack (branch name)
};

/**
 * Implementation of StackBuildService domain interface
 * Handles git-spice stack creation and management
 */
export class StackBuildServiceImpl extends EventEmitter implements StackBuildService {
  private readonly gitSpice: GitSpiceBackend;
  private readonly config: StackBuildServiceConfig;
  private readonly conflictResolutionService: ConflictResolutionService | undefined;
  private readonly conflictStrategy: ConflictResolutionStrategy;
  private readonly stackSubmissionOptions: StackSubmissionOptions;
  private _stackState: StackState | null = null;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: StackBuildServiceConfig, dependencies: StackBuildServiceDependencies = {}) {
    super();
    this.config = config;
    this.gitSpice = new GitSpiceBackend();
    this.conflictResolutionService = dependencies.conflictResolutionService;
    this.conflictStrategy = config.conflictStrategy ?? 'auto';
    this.stackSubmissionOptions = config.stackSubmission ?? {};
    this.maxRetries = config.retryConfig?.maxRetries ?? 2;
    this.retryDelayMs = config.retryConfig?.retryDelayMs ?? 1000;
  }

  /**
   * Initialize stack state for incremental building
   */
  initializeStackState(parentRef: string): void {
    this._stackState = {
      tip: parentRef,
      stacked: new Set<string>(),
      pending: new Map<string, ExecutionTask>(),
      taskToBranch: new Map<string, string>(),
    };
    logger.debug(`📚 Initialized stack state with base ref: ${parentRef}`);
  }

  /**
   * Get the current top of the stack
   */
  getStackTip(): string {
    if (this._stackState === null) {
      return this.config.parentRef;
    }
    return this._stackState.tip;
  }

  /**
   * Check if a task is already in the stack
   */
  isTaskStacked(taskId: string): boolean {
    return this._stackState?.stacked.has(taskId) ?? false;
  }

  getDefaultParentRef(): string {
    return this.config.parentRef;
  }

  /**
   * Check if all task dependencies are satisfied (stacked)
   */
  private _areDependenciesSatisfied(task: ExecutionTask): boolean {
    if (this._stackState === null) {
      return false;
    }
    return task.requires.every((depId) => this._stackState?.stacked.has(depId) ?? false);
  }

  /**
   * Process pending tasks that may now have satisfied dependencies
   */
  private async _processPendingTasks(workdir: string): Promise<void> {
    if (this._stackState === null) {
      return;
    }

    const readyTasks: ExecutionTask[] = [];

    // Find tasks whose dependencies are now satisfied
    for (const task of this._stackState.pending.values()) {
      if (this._areDependenciesSatisfied(task)) {
        readyTasks.push(task);
      }
    }

    // Process ready tasks
    for (const task of readyTasks) {
      this._stackState.pending.delete(task.id);
      await this.addTaskToStack(task, workdir);
    }
  }

  /**
   * Add a single task to the stack incrementally
   * This is called as each task completes during execution
   */
  async addTaskToStack(
    task: ExecutionTask,
    workdir: string,
    worktreeContext?: WorktreeContext,
  ): Promise<string | null> {
    // Initialize stack state if needed
    if (this._stackState === null) {
      this.initializeStackState(this.config.parentRef);
    }

    // Check if task is already stacked
    if (this.isTaskStacked(task.id)) {
      logger.debug(`📚 Task ${task.id} is already in the stack`);
      // Return the existing branch name
      return this._stackState?.taskToBranch.get(task.id) ?? null;
    }

    // Check if task has a commit
    if (!isNonEmptyString(task.commitHash)) {
      logger.warn(`⚠️ Task ${task.id} has no commit hash, cannot add to stack`);
      return null;
    }

    // Check dependencies
    if (!this._areDependenciesSatisfied(task)) {
      logger.info(`⏸️ Task ${task.id} has unsatisfied dependencies, queuing for later`);
      if (this._stackState !== null) {
        this._stackState.pending.set(task.id, task);
      }
      return null;
    }

    logger.info(`📚 Adding task ${task.id} to stack...`);

    try {
      // Fetch commit from worktree to main repository
      await fetchSingleWorktreeCommit(task, worktreeContext, workdir);

      // Create branch for this task
      const branchName = `${this.config.branchPrefix}${task.id}`;

      // Determine the correct parent branch
      let parentBranch = this.config.parentRef;

      // Priority 1: Use baseRef from WorktreeContext if provided (for completion-order stacking)
      if (isNonEmptyString(worktreeContext?.baseRef)) {
        parentBranch = worktreeContext.baseRef;
        logger.info(`  📍 Using WorktreeContext baseRef as parent: ${parentBranch}`);
      } else if (task.requires.length > 0 && isDefined(this._stackState)) {
        // Priority 2: Calculate parent based on task dependencies (for dependency-order stacking)
        const dependencyBranches: string[] = [];
        for (const depId of task.requires) {
          const depBranch = this._stackState?.taskToBranch.get(depId);
          if (isNonEmptyString(depBranch)) {
            dependencyBranches.push(depBranch);
          }
        }

        // If task has multiple dependencies, use the last one (they should be cumulative)
        // If task has one dependency, use that dependency's branch
        if (dependencyBranches.length > 0) {
          const lastDependencyBranch = dependencyBranches.at(-1);
          if (isDefined(lastDependencyBranch)) {
            parentBranch = lastDependencyBranch;
            logger.info(`  📍 Using dependency branch as parent: ${parentBranch}`);
          }
        } else {
          // No dependency branches found, use the base
          parentBranch = this.config.parentRef;
          logger.info(`  📍 No dependency branches found, using base: ${parentBranch}`);
        }
      } else {
        // No dependencies, build from the base
        logger.info(`  📍 Task has no dependencies, using base: ${parentBranch}`);
      }

      // Try to create branch using native git-spice workflow
      logger.info(`  🌿 Creating git-spice branch ${branchName} with parent ${parentBranch}...`);

      // For tasks with commits, we need to use the new workflow:
      // 1. Create branch with git-spice
      // 2. Worktree will be created from this branch
      // 3. Commit will happen in the worktree
      const actualBranchName = await this._createBranchSpiceFirst({
        branchName,
        parentBranch,
        workdir,
      });

      // Note: The actual commit will be applied when the task executes in its worktree
      // using gs commit, which automatically handles restacking

      logger.info(`  ✅ Branch ${actualBranchName} created successfully`);
      if (actualBranchName !== branchName) {
        logger.info(
          `  ℹ️ Branch name was suffixed due to collision: ${branchName} → ${actualBranchName}`,
        );
      }
      logger.info(`✅ [addTaskToStack] Completed - task ${task.id} added to stack`);

      // Update stack state with the ACTUAL branch name
      if (this._stackState !== null) {
        this._stackState.stacked.add(task.id);
        this._stackState.taskToBranch.set(task.id, actualBranchName);
        this._stackState.tip = actualBranchName;
      }

      // Emit event with the ACTUAL branch name
      this.emit('branch_created', {
        type: 'branch_created',
        branchName: actualBranchName,
        taskId: task.id,
        timestamp: new Date(),
      } as StackEvent);

      // Process any pending tasks that might now be ready
      await this._processPendingTasks(workdir);

      return actualBranchName;
    } catch (error) {
      logger.error(
        `❌ Failed to add task ${task.id} to stack: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Keep task in pending if it failed
      if (this._stackState !== null) {
        this._stackState.pending.set(task.id, task);
      }
      throw error;
    }
  }

  async buildStack(
    tasks: ExecutionTask[],
    workdir: string,
    options: {
      parentRef: string;
      strategy: StackBuildStrategy;
    },
  ): Promise<StackInfo> {
    logger.info(
      `🏗️ Building git-spice stack from ${tasks.length} tasks using ${options.strategy} strategy...`,
    );

    // Ensure commits from worktrees are available locally before branch creation
    await fetchWorktreeCommits(tasks, workdir);

    // Filter tasks that have commits
    const tasksWithCommits = tasks.filter((task) => task.commitHash !== undefined);
    if (tasksWithCommits.length === 0) {
      throw new Error('No tasks with commits found to build stack');
    }

    // Reorder tasks based on strategy
    const orderedTasks = this.reorderStack(tasksWithCommits, options.strategy);

    logger.info(`📋 Stack order (${orderedTasks.length} tasks):`);
    for (const [index, task] of orderedTasks.entries()) {
      logger.info(`  ${index + 1}. ${task.id}: ${task.title}`);
    }

    // Build stack incrementally using git-spice
    const stackInfo = await this._buildStackIncremental(orderedTasks, workdir, options.parentRef);

    // After all branches are tracked, run upstack restack to properly stack them
    if (stackInfo.branches.length > 0) {
      try {
        await this.restack(workdir);
      } catch (restackError) {
        logger.warn(`⚠️ Failed to restack branches: ${String(restackError)}`);
        // Continue anyway - branches are still created and tracked
      }
    }

    this.emit('stack_built', {
      type: 'stack_built',
      stackInfo,
      timestamp: new Date(),
    } as StackEvent);

    if (stackInfo.failedTasks !== undefined && stackInfo.failedTasks.length > 0) {
      for (const failure of stackInfo.failedTasks) {
        logger.warn(`⚠️ Task ${failure.taskId} could not be stacked: ${failure.reason}`);
      }
    }

    logger.info(`✅ Stack built successfully with ${stackInfo.branches.length} branches`);
    return stackInfo;
  }

  async submitStack(workdir: string): Promise<string[]> {
    if (!this.config.stackSubmissionEnabled) {
      throw new Error('Stack submission is not enabled');
    }

    logger.info('📤 Submitting git-spice stack for review...');

    try {
      const prUrls = await this.gitSpice.submitStack(workdir, this.stackSubmissionOptions);
      logger.info(`✅ Stack submitted successfully: ${prUrls.length} PRs created`);
      return prUrls;
    } catch (error) {
      logger.error(
        `❌ Failed to submit stack: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getStackInfo(workdir: string): Promise<StackInfo | null> {
    try {
      const gitSpiceInfo = await this.gitSpice.getStackInfo(workdir);
      if (gitSpiceInfo === null) {
        return null;
      }

      // Convert GitSpiceStackInfo to StackInfo
      const branches = gitSpiceInfo.branches ?? [];
      return {
        branches: branches.map((branch) => ({
          branchName: branch.name,
          taskId: branch.taskId,
          commitHash: branch.commitHash,
        })),
        parentRef: gitSpiceInfo.stackRoot !== '' ? gitSpiceInfo.stackRoot : this.config.parentRef,
        strategy: 'dependency-order',
        totalTasks: branches.length,
        prUrls: gitSpiceInfo.prUrls.length > 0 ? gitSpiceInfo.prUrls : undefined,
      };
    } catch (error) {
      logger.warn(
        `⚠️ Could not get stack info: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  reorderStack(tasks: ExecutionTask[], strategy: StackBuildStrategy): ExecutionTask[] {
    switch (strategy) {
      case 'dependency-order': {
        return this._orderByDependencies(tasks);
      }
      case 'complexity-first': {
        return this._orderByComplexity(tasks);
      }
      case 'file-impact': {
        return this._orderByFileImpact(tasks);
      }
      default: {
        const strategyName = strategy as string;
        logger.warn(`⚠️ Unknown stack build strategy: ${strategyName}, using dependency-order`);
        return this._orderByDependencies(tasks);
      }
    }
  }

  private async _buildStackIncremental(
    orderedTasks: ExecutionTask[],
    workdir: string,
    parentRef: string,
  ): Promise<StackInfo> {
    const branches: StackInfo['branches'] = [];
    const failedTasks: Array<{ reason: string; taskId: string }> = [];
    let currentParent = parentRef;

    for (const task of orderedTasks) {
      if (task.commitHash === undefined) {
        continue;
      }

      const desiredBranchName = `${this.config.branchPrefix}${task.id}`;
      let finalBranchName = desiredBranchName;

      try {
        // createBranchFromCommit now returns the actual branch name
        finalBranchName = await this.gitSpice.createBranchFromCommit(
          desiredBranchName,
          task.commitHash,
          currentParent,
          workdir,
        );
        if (finalBranchName !== desiredBranchName) {
          logger.info(
            `  ℹ️ Branch name was suffixed due to collision: ${desiredBranchName} → ${finalBranchName}`,
          );
        }
      } catch (error) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        logger.warn(
          `⚠️ git-spice failed to create branch ${desiredBranchName} for task ${task.id}: ${originalMessage}. Attempting fallback strategy...`,
        );
        const fallbackResult = await this._createBranchWithCherryPick({
          branchName: desiredBranchName,
          parentBranch: currentParent,
          task,
          workdir,
        });

        if (!fallbackResult.success) {
          const reason = fallbackResult.reason ?? originalMessage;
          failedTasks.push({ reason, taskId: task.id });
          logger.error(
            `❌ Failed to create branch ${desiredBranchName} for task ${task.id}: ${reason}`,
          );
          continue;
        }

        finalBranchName = fallbackResult.branchName ?? desiredBranchName;
      }

      branches.push({
        branchName: finalBranchName,
        commitHash: task.commitHash,
        taskId: task.id,
      });

      this.emit('branch_created', {
        type: 'branch_created',
        branchName: finalBranchName,
        taskId: task.id,
        timestamp: new Date(),
      } as StackEvent);

      currentParent = finalBranchName;
      logger.info(`✅ Created branch ${finalBranchName} for task ${task.id}`);
    }

    return {
      branches,
      parentRef,
      strategy: 'dependency-order',
      totalTasks: orderedTasks.length,
      ...(failedTasks.length > 0 ? { failedTasks } : {}),
    };
  }

  private async _createBranchWithCherryPick({
    branchName,
    parentBranch,
    task,
    workdir,
  }: {
    branchName: string;
    parentBranch: string;
    task: ExecutionTask;
    workdir: string;
  }): Promise<BranchCreationResult> {
    const git = new GitWrapper(workdir);
    let finalBranchName = branchName;

    try {
      await git.checkout(parentBranch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already used by worktree')) {
        return { success: false, reason: `Failed to checkout ${parentBranch}: ${message}` };
      }
    }

    try {
      if (await git.branchExists(finalBranchName)) {
        const uniqueSuffix = Date.now().toString(36);
        finalBranchName = `${finalBranchName}-${uniqueSuffix}`;
        logger.warn(`⚠️ Branch ${branchName} already exists, using ${finalBranchName} instead`);
      }

      await execa(
        'gs',
        ['branch', 'create', finalBranchName, '--message', `Create branch for task ${task.id}`],
        {
          cwd: workdir,
          timeout: 10_000,
        },
      );

      await git.checkout(finalBranchName);

      const applyResult = await this._applyCommitWithConflictHandling({
        branchName: finalBranchName,
        git,
        task,
        workdir,
      });

      if (!applyResult.success) {
        await this._cleanupFailedBranch(git, finalBranchName, parentBranch);
        const failureResult: BranchCreationResult = {
          success: false,
          branchName: finalBranchName,
        };
        if (applyResult.reason !== undefined) {
          failureResult.reason = applyResult.reason;
        }
        return failureResult;
      }

      return { success: true, branchName: finalBranchName };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this._cleanupFailedBranch(git, finalBranchName, parentBranch);
      return {
        success: false,
        branchName: finalBranchName,
        reason,
      };
    }
  }

  private async _applyCommitWithConflictHandling({
    branchName,
    git,
    task,
    workdir,
  }: {
    branchName: string;
    git: GitWrapper;
    task: ExecutionTask;
    workdir: string;
  }): Promise<CherryPickResult> {
    const { commitHash } = task;
    if (commitHash === undefined) {
      return { success: true };
    }

    try {
      await git.cherryPick(commitHash);
      return { success: true };
    } catch (error) {
      const resolutionResult = await this._resolveCherryPickConflict({
        branchName,
        error,
        git,
        task,
        workdir,
      });

      if (resolutionResult === null) {
        return { success: true };
      }

      return { success: false, reason: resolutionResult };
    }
  }

  private async _resolveCherryPickConflict({
    branchName,
    error,
    git,
    task,
    workdir,
  }: {
    branchName: string;
    error: unknown;
    git: GitWrapper;
    task: ExecutionTask;
    workdir: string;
  }): Promise<string | null> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.conflictResolutionService === undefined) {
      await this._safeCherryPickAbort(git);
      return errorMessage;
    }

    const status = await git.status();
    const conflictedFiles = status.conflicted ?? [];

    if (conflictedFiles.length === 0) {
      await this._safeCherryPickAbort(git);
      return errorMessage;
    }

    this.emit('conflict_detected', {
      type: 'conflict_detected',
      taskId: task.id,
      branchName,
      timestamp: new Date(),
    } as StackEvent);

    const conflictInfo: ConflictInfo = {
      taskId: task.id,
      conflictedFiles,
      resolution: this.conflictStrategy,
      timestamp: new Date(),
    };

    const resolved = await this.conflictResolutionService.resolveConflicts(conflictInfo, workdir);

    if (resolved) {
      try {
        await git.raw(['cherry-pick', '--continue']);
        this.emit('conflict_resolved', {
          type: 'conflict_resolved',
          taskId: task.id,
          branchName,
          timestamp: new Date(),
        } as StackEvent);
        return null;
      } catch (continueError) {
        const continueMessage =
          continueError instanceof Error ? continueError.message : String(continueError);
        await this._safeCherryPickAbort(git);
        return continueMessage;
      }
    }

    await this._safeCherryPickAbort(git);
    this.emit('conflict_resolved', {
      type: 'conflict_resolved',
      taskId: task.id,
      branchName,
      timestamp: new Date(),
    } as StackEvent);
    return `Could not resolve conflicts automatically (${conflictedFiles.join(', ')})`;
  }

  private async _safeCherryPickAbort(git: GitWrapper): Promise<void> {
    try {
      await git.raw(['cherry-pick', '--abort']);
    } catch {
      // Ignore if there is no cherry-pick in progress
    }
  }

  private async _cleanupFailedBranch(
    git: GitWrapper,
    branchName: string,
    parentBranch: string,
  ): Promise<void> {
    await this._safeCherryPickAbort(git);

    try {
      await git.checkout(parentBranch);
    } catch {
      // Ignore checkout failures during cleanup
    }

    try {
      if (await git.branchExists(branchName)) {
        await git.raw(['branch', '-D', branchName]);
      }
    } catch (deleteError) {
      logger.warn(
        `⚠️ Failed to delete temporary branch ${branchName}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
      );
    }
  }

  private _orderByDependencies(tasks: ExecutionTask[]): ExecutionTask[] {
    const ordered: ExecutionTask[] = [];
    const processed = new Set<string>();

    // Topological sort based on dependencies
    const visit = (task: ExecutionTask): void => {
      if (processed.has(task.id)) {
        return;
      }

      // Visit all dependencies first
      for (const depId of task.requires) {
        const dep = tasks.find((t) => t.id === depId);
        if (dep !== undefined && !processed.has(dep.id)) {
          visit(dep);
        }
      }

      ordered.push(task);
      processed.add(task.id);
    };

    for (const task of tasks) {
      visit(task);
    }

    return ordered;
  }

  private _orderByComplexity(tasks: ExecutionTask[]): ExecutionTask[] {
    // Order by estimated complexity (higher complexity first for easier review)
    return [...tasks].sort((a, b) => {
      const complexityA = this._estimateComplexity(a);
      const complexityB = this._estimateComplexity(b);
      return complexityB - complexityA;
    });
  }

  private _orderByFileImpact(tasks: ExecutionTask[]): ExecutionTask[] {
    // Order by number of files touched (fewer files first for easier review)
    return [...tasks].sort((a, b) => {
      return a.touches.length - b.touches.length;
    });
  }

  private _estimateComplexity(task: ExecutionTask): number {
    // Simple complexity estimation based on files touched and description length
    const fileCount = task.touches.length;
    const descriptionLength = task.description.length;

    return fileCount * 10 + descriptionLength / 10;
  }

  /**
   * Create branch using the new Spice-first workflow
   * This avoids cherry-picking by creating branches first with git-spice,
   * then worktrees, then committing
   */
  private async _createBranchSpiceFirst({
    branchName,
    parentBranch,
    workdir,
  }: {
    branchName: string;
    parentBranch: string;
    workdir: string;
  }): Promise<string> {
    try {
      // Use the new createStackBranch method for native git-spice stacking
      await this.gitSpice.createStackBranch(branchName, parentBranch, workdir);
      return branchName;
    } catch (error) {
      // Check if branch already exists and generate unique name
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already exists')) {
        const timestamp = Date.now().toString(36);
        const uniqueBranchName = `${branchName}-${timestamp}`;
        logger.info(`  ⚠️ Branch ${branchName} already exists, trying ${uniqueBranchName}`);
        await this.gitSpice.createStackBranch(uniqueBranchName, parentBranch, workdir);
        return uniqueBranchName;
      }
      throw error;
    }
  }

  /**
   * DEPRECATED: Create branch with retry logic for transient failures
   * This uses the old cherry-pick approach and should be replaced.
   * @deprecated Use _createBranchSpiceFirst instead
   */
  private async _createBranchWithRetry({
    branchName,
    commitHash,
    parentBranch,
    workdir,
    task,
  }: {
    branchName: string;
    commitHash: string;
    parentBranch: string;
    task: ExecutionTask;
    workdir: string;
  }): Promise<string | null> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // First attempt: use git-spice
        if (attempt === 1) {
          const actualBranchName = await this.gitSpice.createBranchFromCommit(
            branchName,
            commitHash,
            parentBranch,
            workdir,
          );
          return actualBranchName;
        }

        // Subsequent attempts: wait then retry
        logger.info(
          `🔄 Retrying branch creation for ${branchName} (attempt ${attempt}/${this.maxRetries})...`,
        );
        await this._delay(this.retryDelayMs * attempt); // Exponential backoff
        const actualBranchName = await this.gitSpice.createBranchFromCommit(
          branchName,
          commitHash,
          parentBranch,
          workdir,
        );
        return actualBranchName;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this._isRetryableError(lastError)) {
          // Non-retryable error, try fallback immediately
          logger.warn(`⚠️ Non-retryable error, trying fallback: ${lastError.message}`);
          break;
        }

        if (attempt < this.maxRetries) {
          logger.debug(`⚠️ Attempt ${attempt} failed: ${lastError.message}`);
        }
      }
    }

    // All retries failed, try fallback
    logger.warn(
      `⚠️ git-spice failed after ${this.maxRetries} attempts, using cherry-pick fallback: ${lastError?.message ?? 'Unknown error'}`,
    );

    const fallbackResult = await this._createBranchWithCherryPick({
      branchName,
      parentBranch,
      task,
      workdir,
    });

    return fallbackResult.success ? (fallbackResult.branchName ?? branchName) : null;
  }

  /**
   * Check if an error is retryable
   */
  private _isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable conditions
    if (
      message.includes('timeout') ||
      message.includes('enoent') ||
      message.includes('spawn') ||
      message.includes('lock') ||
      message.includes('another process') ||
      message.includes('resource temporarily unavailable')
    ) {
      return true;
    }

    // Non-retryable conditions
    if (
      message.includes('conflict') ||
      message.includes('commit not found') ||
      message.includes('branch already exists') ||
      message.includes('permission denied')
    ) {
      return false;
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Create a branch from a specific commit, optionally tracking a parent branch
   */
  async createBranchFromCommit(
    branchName: string,
    commitHash: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    await this.gitSpice.createBranchFromCommit(branchName, commitHash, parentBranch, workdir);
  }

  /**
   * Restack branches to ensure proper stacking relationships
   */
  async restack(workdir: string): Promise<void> {
    await this.gitSpice.restack(workdir);
  }

  async createStackBranch(
    branchName: string,
    parentBranch: string,
    workdir: string,
  ): Promise<void> {
    await this.gitSpice.createStackBranch(branchName, parentBranch, workdir);
  }

  async commitInStack(
    task: ExecutionTask,
    context: WorktreeContext,
    options: CommitOptions = {},
  ): Promise<string> {
    // Generate commit message
    const message =
      options.message ?? `Complete task ${task.id}: ${task.title}\n\n${task.description}`;

    // Use git-spice commit for proper stacking
    const commitOptions: { files?: string[]; noRestack?: boolean } = {
      noRestack: false, // Allow auto-restacking
    };

    // Handle includeAll option by staging all changes
    if (options.includeAll === true) {
      // Stage all changes in the worktree
      const git = new GitWrapper(context.worktreePath);
      await git.git.add('.');
      logger.info(`  📦 Staged all changes in ${context.worktreePath}`);
    } else if (options.files !== undefined) {
      commitOptions.files = options.files;
    }

    const commitHash = await this.gitSpice.commitInStack(
      message,
      context.worktreePath,
      commitOptions,
    );

    return commitHash;
  }

  /**
   * Update a branch to point to a specific commit
   */
  async updateBranchToCommit(
    branchName: string,
    commitHash: string,
    workdir: string,
  ): Promise<void> {
    const git = new GitWrapper(workdir);

    try {
      // Use git branch -f to force update the branch to point to the commit
      await git.git.raw(['branch', '-f', branchName, commitHash]);
      logger.info(`  ✅ Updated branch ${branchName} to commit ${commitHash.slice(0, 7)}`);
    } catch (error) {
      logger.error(`  ❌ Failed to update branch ${branchName}: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Delay for a specified number of milliseconds
   */
  private async _delay(ms: number): Promise<void> {
    await delay(ms);
  }
}
