/**
 * Stacked VCS Strategy
 *
 * Worktree-first approach: Creates git-spice stacked branches for each task.
 *
 * Flow:
 * 1. Create worktree from parent branch (main or previous task's branch)
 * 2. Execute task in worktree isolation
 * 3. Commit changes using git-spice (maintains parent relationship)
 * 4. Track branch with git-spice (creates/updates branch tracking)
 * 5. Clean up worktree (allows children to use the branch)
 *
 * Each task gets its own branch that builds on the previous task's branch,
 * creating a clean stack of changes perfect for review.
 */

import type { ExecutionTask } from '@/core/execution/types';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type {
  TaskCommitResult,
  VcsStrategy,
  VcsStrategyContext,
  WorktreeContext,
} from '@/core/vcs/vcs-strategy';
import type { TaskV2 } from '@/types/schemas-v2';

import { FileModificationValidator, ViolationReporter } from '@/services/vcs/validation';
import { logger } from '@/utils/global-logger';
import { isNonEmptyString, isNonNullish } from '@/validation/guards';

export class StackedVcsStrategy implements VcsStrategy {
  private readonly worktreeContexts: Map<string, WorktreeContext> = new Map();
  private readonly vcsEngine: VcsEngineService;
  private _taskOrder: string[] = [];
  private _branchStack: string[] = [];
  private _vcsContext!: VcsStrategyContext;

  // Track completed tasks
  private readonly completedTasks = new Set<string>();
  private _currentStackTip = '';

  // Unique run ID to prevent branch name collisions
  private readonly RUN_ID: string;

  // File modification validator
  private readonly validator: FileModificationValidator;
  private readonly violationReporter: ViolationReporter;
  private _allTasks: TaskV2[] = [];

  constructor(vcsEngine: VcsEngineService) {
    this.vcsEngine = vcsEngine;
    // Generate a short, unique run ID (timestamp-based)
    this.RUN_ID = Date.now().toString(36).slice(-6);
    this.validator = new FileModificationValidator();
    this.violationReporter = new ViolationReporter();
  }

  async initialize(tasks: TaskV2[], context: VcsStrategyContext): Promise<void> {
    logger.info(`[StackedVcsStrategy] Initializing for ${tasks.length} tasks`);
    logger.info(`  Working directory: ${context.cwd}`);
    logger.info(`  Base ref: ${context.baseRef ?? 'HEAD'}`);
    logger.info(`  Run ID: ${this.RUN_ID}`);

    // Clear state from any previous runs
    this.completedTasks.clear();
    this.worktreeContexts.clear();

    // Store VCS context and tasks for later use
    this._vcsContext = context;
    this._allTasks = tasks;

    // Initialize VCS engine
    await this.vcsEngine.initialize(context.cwd);

    // Pre-execution check: Verify working directory is clean
    const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
    const git = new GitWrapper(context.cwd);
    const status = await git.status();

    // Use isClean flag from simple-git which accurately checks all git state
    if (status.isClean === false) {
      // Collect all types of changes for error message
      const changes = [
        ...(status.staged ?? []).map((f) => `staged: ${f}`),
        ...status.modified.map((f) => `modified: ${f}`),
        ...status.added.map((f) => `added: ${f}`),
        ...status.deleted.map((f) => `deleted: ${f}`),
        ...status.untracked.map((f) => `untracked: ${f}`),
        ...(status.conflicted ?? []).map((f) => `conflicted: ${f}`),
        ...(status.notAdded ?? []).map((f) => `not added: ${f}`),
      ];

      logger.error(`❌ Working directory has uncommitted changes:`);
      for (const change of changes.slice(0, 10)) {
        logger.error(`  - ${change}`);
      }
      if (changes.length > 10) {
        logger.error(`  ... and ${changes.length - 10} more`);
      }
      throw new Error(
        `Working directory must be clean before starting stacked execution. Please commit or stash your changes first.`,
      );
    }

    logger.info(`  ✅ Working directory is clean`);

    // Initialize the stack state
    this.vcsEngine.initializeStackState(context.baseRef ?? 'main');

    // Determine task execution order based on dependencies
    this._taskOrder = this._determineTaskOrder(tasks);
    this._branchStack = [context.baseRef ?? 'main']; // Start with base branch
    this._currentStackTip = context.baseRef ?? 'main'; // Track the current tip of our stack

    logger.info(`  📋 Task order for stack: ${this._taskOrder.join(' → ')}`);
    logger.info(`  🎯 Initial stack tip: ${this._currentStackTip}`);

    // Initialize file modification validator
    this.validator.initialize(tasks, this._taskOrder);
    logger.info(`  ✅ File modification validator initialized`);
  }

  async prepareTaskExecutionContexts(
    tasks: ExecutionTask[],
    _context: VcsStrategyContext,
  ): Promise<Map<string, WorktreeContext>> {
    logger.info(
      `[StackedVcsStrategy] Preparing for dynamic worktree creation for ${tasks.length} tasks`,
    );

    // For stacked strategy, we don't create worktrees upfront
    // Instead, we create them dynamically when each task becomes ready to execute
    // This allows each task to build on the previous task's completed state

    this.worktreeContexts.clear();
    logger.info(`  ⏱️ Worktrees will be created just-in-time based on dependency completion`);

    // Ensure this is truly async
    await Promise.resolve();

    return this.worktreeContexts;
  }

  async prepareTaskExecution(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: VcsStrategyContext,
  ): Promise<WorktreeContext | null> {
    logger.info(`[StackedVcsStrategy] Preparing execution for task ${task.id}`);

    // Generate branch name with run ID to prevent collisions
    const branchName = `chopstack/${task.id}-${this.RUN_ID}`;

    // Determine the parent branch for worktree creation
    // Must match the tracking parent for git-spice ancestry checks
    // Use linear stacking logic: current stack tip, but ensure it's descended from dependencies
    let parentBranch = this._currentStackTip;

    // If task has dependencies, ensure parent is descended from all dependencies
    if (task.dependencies.length > 0) {
      // Find the last dependency (in case of multiple dependencies)
      const lastDependency = task.dependencies.at(-1);

      if (isNonNullish(lastDependency)) {
        // Check if dependency is in the branch stack (meaning it's been committed)
        const dependencyBranch = this._branchStack.find((b) =>
          b.includes(`/${lastDependency}-${this.RUN_ID}`),
        );

        if (isNonEmptyString(dependencyBranch)) {
          // Check if current stack tip is already descended from this dependency
          const stackTipIndex = this._branchStack.indexOf(this._currentStackTip);
          const depIndex = this._branchStack.indexOf(dependencyBranch);

          if (stackTipIndex > depIndex) {
            // Current stack tip is after dependency - use it for linear stacking
            // It contains all the dependency's changes plus any parallel tasks
            parentBranch = this._currentStackTip;
            logger.info(
              `  📍 Creating worktree from current stack tip: ${parentBranch} (includes ${dependencyBranch})`,
            );
          } else {
            // This is the first task to stack on this dependency
            parentBranch = dependencyBranch;
            logger.info(`  📍 Creating worktree from dependency branch: ${parentBranch}`);
          }
        } else {
          // Dependency not yet completed - shouldn't happen with correct execution order
          logger.warn(
            `  ⚠️ Dependency ${lastDependency} not yet completed, using current stack tip: ${parentBranch}`,
          );
        }
      }
    } else {
      // No dependencies: use current stack tip for linear stacking
      logger.info(`  📍 Creating worktree from current stack tip: ${parentBranch}`);
    }

    // WORKTREE-FIRST WORKFLOW: Create worktree from parent, execute, then commit & track
    logger.info(`  🏗️ Creating worktree for task ${task.id}`);

    try {
      // Create worktree directly from the parent branch
      // The branch will be created later by git-spice track after we commit

      // Get forbidden files for this task to prevent cross-task contamination
      const forbiddenFiles = this.validator.getForbiddenFiles(task);
      logger.info(`  🚫 Forbidden files for task ${task.id}: ${forbiddenFiles.length} files`);

      const worktreeTask = { ...executionTask, branchName, forbiddenFiles };

      const worktreeContext = await this.vcsEngine.createWorktreesForTasks(
        [worktreeTask],
        parentBranch, // Use parent branch as base for worktree
        context.cwd,
      );

      if (worktreeContext.length > 0) {
        const worktreeCtx = worktreeContext[0];
        if (isNonNullish(worktreeCtx)) {
          // Update the context with the correct branch name
          worktreeCtx.branchName = branchName;
          worktreeCtx.baseRef = parentBranch;

          this.worktreeContexts.set(task.id, worktreeCtx);
          logger.info(`  ✅ Created worktree: ${worktreeCtx.worktreePath}`);
          return worktreeCtx;
        }
      }
    } catch (error) {
      logger.error(`  ❌ Failed to create worktree for task ${task.id}: ${String(error)}`);
      throw new Error(`Cannot execute task ${task.id}: worktree creation failed. ${String(error)}`);
    }

    // This should never be reached
    throw new Error(`Failed to create worktree for task ${task.id}`);
  }

  async handleTaskCompletion(
    task: TaskV2,
    executionTask: ExecutionTask,
    context: WorktreeContext,
    _output?: string,
  ): Promise<TaskCommitResult> {
    logger.info(`[StackedVcsStrategy] Handling completion for task ${task.id}`);
    logger.info(`  Worktree: ${context.worktreePath}`);

    try {
      // PRE-COMMIT VALIDATION: Check file modifications before committing
      logger.info(`  🔍 Running pre-commit validation for task ${task.id}`);

      // Get git status to find modified files
      const { GitWrapper } = await import('@/adapters/vcs/git-wrapper');
      const git = new GitWrapper(context.absolutePath);
      const status = await git.status();

      // Collect all modified files (with type safety)
      const modifiedFiles: string[] = [];

      // Safely collect files from each category
      if (status.modified.length > 0) {
        modifiedFiles.push(...status.modified);
      }
      // Safely access arrays that might not exist
      if (status.added.length > 0) {
        modifiedFiles.push(...status.added);
      }
      // Staged files are optional in simple-git types
      const { staged } = status;
      if (staged !== undefined && Array.isArray(staged) && staged.length > 0) {
        modifiedFiles.push(...staged);
      }

      logger.info(`  📝 Modified files (${modifiedFiles.length}): ${modifiedFiles.join(', ')}`);

      // Run validation
      const validationResult = this.validator.validatePreCommit(task, modifiedFiles);

      // Check validation mode
      const validationMode = this._vcsContext.validation?.mode ?? 'strict';

      if (!validationResult.valid) {
        if (validationMode === 'strict') {
          // STRICT MODE: Fail the task
          const errorMessage = this.violationReporter.formatValidationError(validationResult, task);
          logger.error(errorMessage);

          return {
            taskId: task.id,
            error: 'File modification validation failed',
            branchName: context.branchName,
          };
        }
        // PERMISSIVE MODE: Log warning but continue
        const warningMessage = this.violationReporter.formatValidationWarning(
          validationResult,
          task,
        );
        logger.warn(warningMessage);
      } else if (validationResult.warnings.length > 0) {
        // Log warnings even if validation passed
        logger.warn(`⚠️ Task '${task.id}' validation warnings:`);
        for (const warning of validationResult.warnings) {
          logger.warn(`  - ${warning}`);
        }
      }

      // WORKTREE-FIRST WORKFLOW: Commit in worktree, then track with git-spice
      // The worktree was created in prepareTaskExecution from the parent branch,
      // now we commit the changes and track the branch

      logger.info(`  🌿 Committing task changes using git-spice in ${context.worktreePath}`);

      // Use git-spice commit - this creates the commit in the worktree
      // and makes it available in the main repo automatically
      const commitHash = await this.vcsEngine.commitInStack(executionTask, context, {
        generateMessage: true,
        includeAll: true,
      });

      // Check if there were any changes (empty string means no commit)
      if (commitHash === '') {
        logger.warn(`  ⚠️ Task ${task.id} had no changes, skipping branch tracking`);

        // Mark task as completed but without a commit
        this.completedTasks.add(task.id);

        // DEBUGGING: DO NOT clean up the worktree when there are no changes
        // This allows us to inspect what files Claude wrote and where
        logger.warn(
          `  🔍 DEBUGGING: Preserving worktree at ${context.absolutePath} for inspection`,
        );
        logger.warn(`  🔍 Check if files were written to worktree or main repo`);

        return {
          taskId: task.id,
          commitHash: '',
          branchName: context.branchName,
        };
      }

      logger.info(`  ✅ Created git-spice commit: ${commitHash.slice(0, 7)}`);

      // Store commit hash in execution task
      executionTask.commitHash = commitHash;

      // Mark task as completed
      this.completedTasks.add(task.id);

      // The branch name was already set in prepareTaskExecution
      const { branchName } = context;

      // Determine parent branch for tracking at COMPLETION time
      // This ensures we get the latest _currentStackTip for linear stacking
      const { dependencies } = task;
      let parentBranch = this._currentStackTip;

      // If task has dependencies, ensure parent is descended from all dependencies
      if (dependencies.length > 0) {
        const lastDependency = dependencies.at(-1);

        if (isNonNullish(lastDependency)) {
          // Find the dependency branch
          const dependencyBranch = this._branchStack.find((b) =>
            b.includes(`/${lastDependency}-${this.RUN_ID}`),
          );

          if (isNonEmptyString(dependencyBranch)) {
            // Check if current stack tip is already descended from this dependency
            const stackTipIndex = this._branchStack.indexOf(this._currentStackTip);
            const depIndex = this._branchStack.indexOf(dependencyBranch);

            if (stackTipIndex > depIndex) {
              // Current stack tip is after dependency - use it for linear stacking
              parentBranch = this._currentStackTip;
              logger.info(
                `  📍 Tracking with current stack tip: ${parentBranch} (descended from ${dependencyBranch})`,
              );
            } else {
              // This is the first task to stack on this dependency
              parentBranch = dependencyBranch;
              logger.info(`  📍 Tracking with dependency branch: ${parentBranch}`);
            }
          } else {
            // Dependency not yet stacked - use current stack tip
            logger.warn(
              `  ⚠️ Dependency ${lastDependency} not yet stacked, using current stack tip: ${parentBranch}`,
            );
          }
        }
      } else {
        // No dependencies: use current stack tip for linear stacking
        logger.info(`  📍 Tracking with current stack tip: ${parentBranch}`);
      }

      // Track the branch with git-spice in the main repo
      // git-spice track will create the branch if it doesn't exist
      const { cwd } = this._vcsContext;
      try {
        logger.info(`  🔗 Tracking branch ${branchName} with parent ${parentBranch}`);
        await this.vcsEngine.trackBranch(branchName, parentBranch, cwd);
        logger.info(`  ✅ Tracked git-spice branch ${branchName} with parent ${parentBranch}`);
      } catch (trackError) {
        // If tracking fails because parent doesn't exist (empty commit), fall back to base
        const errorMessage = String(trackError);
        if (errorMessage.includes('branch not tracked') || errorMessage.includes('not found')) {
          logger.warn(
            `  ⚠️ Parent branch ${parentBranch} not tracked, falling back to base branch`,
          );
          const { baseRef } = this._vcsContext;
          const fallbackParent = baseRef ?? 'main';
          await this.vcsEngine.trackBranch(branchName, fallbackParent, cwd);
          parentBranch = fallbackParent;
          logger.info(`  ✅ Tracked git-spice branch ${branchName} with parent ${parentBranch}`);
        } else {
          throw trackError;
        }
      }

      // Track the branch in our local stack state
      if (!this._branchStack.includes(branchName)) {
        this._branchStack.push(branchName);
        this._currentStackTip = branchName;
      }

      // Clean up this worktree now that it's committed and tracked
      // This allows child tasks to create worktrees from this branch
      const { id: taskId } = task;
      logger.info(`  🧹 Cleaning up worktree for completed task ${taskId}`);
      try {
        await this.vcsEngine.cleanupWorktrees([context]);
        logger.info(`  ✅ Cleaned up worktree for task ${taskId}`);
      } catch (cleanupError) {
        logger.warn(`  ⚠️ Failed to cleanup worktree: ${String(cleanupError)}`);
      }

      return {
        taskId,
        commitHash,
        branchName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  ❌ Failed to handle task ${task.id}: ${errorMessage}`);

      return {
        taskId: task.id,
        error: errorMessage,
      };
    }
  }

  async finalize(
    results: TaskCommitResult[],
    context: VcsStrategyContext,
  ): Promise<{ branches: string[]; commits: string[] }> {
    logger.info(`[StackedVcsStrategy] Finalizing with ${results.length} results`);

    // Tasks are now stacked immediately in handleTaskCompletion
    // No need to process a completion queue here

    const commits = results
      .filter((r): r is TaskCommitResult & { commitHash: string } => isNonEmptyString(r.commitHash))
      .map((r) => r.commitHash);

    // Exclude the base branch from the returned branches
    const branches = this._branchStack.slice(1);

    logger.info(`  📊 Stack created: ${this._branchStack.join(' → ')}`);
    logger.info(`  🌳 Branches: ${branches.length}`);
    logger.info(`  💾 Commits: ${commits.length}`);

    // After all branches are stacked, run restack to finalize
    if (branches.length > 0) {
      try {
        await this.vcsEngine.restack(context.cwd);
        logger.info(`  ✅ Successfully restacked all branches`);
      } catch (restackError) {
        logger.warn(`⚠️ Failed to restack branches: ${String(restackError)}`);
      }
    }

    return {
      branches,
      commits,
    };
  }

  async cleanup(): Promise<void> {
    logger.info(`[StackedVcsStrategy] Cleaning up ${this.worktreeContexts.size} worktrees`);

    if (this.worktreeContexts.size > 0) {
      try {
        const contexts = [...this.worktreeContexts.values()];
        await this.vcsEngine.cleanupWorktrees(contexts);
        logger.info(`  ✅ Cleaned up worktrees`);
      } catch (error) {
        logger.warn(`  ⚠️ Failed to cleanup worktrees: ${String(error)}`);
      }
    }
  }

  private _determineTaskOrder(tasks: TaskV2[]): string[] {
    const ordered: string[] = [];
    const remaining = new Set(tasks);
    const completed = new Set<string>();

    // Complexity values for sorting (XS to XL)
    const complexityOrder = { XS: 1, S: 2, M: 3, L: 4, XL: 5 };

    // Keep processing until all tasks are ordered
    while (remaining.size > 0) {
      const readyTasks = [...remaining].filter((task) =>
        task.dependencies.every((dep) => completed.has(dep)),
      );

      if (readyTasks.length === 0) {
        // Handle circular dependencies or missing dependencies
        const remainingIds = [...remaining].map((t) => t.id);
        logger.warn(
          `⚠️ Circular or missing dependencies detected for tasks: ${remainingIds.join(', ')}`,
        );
        // Add remaining tasks in arbitrary order
        ordered.push(...remainingIds);
        break;
      }

      // Sort ready tasks by complexity (simplest first)
      readyTasks.sort((a, b) => complexityOrder[a.complexity] - complexityOrder[b.complexity]);

      // Add the first ready task to the order
      const nextTask = readyTasks[0];
      if (isNonNullish(nextTask)) {
        ordered.push(nextTask.id);
        remaining.delete(nextTask);
        completed.add(nextTask.id);
      }
    }

    return ordered;
  }
}
