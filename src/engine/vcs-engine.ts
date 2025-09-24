import { EventEmitter } from 'node:events';

import { execa } from 'execa';
import { match } from 'ts-pattern';

import type { Plan } from '../types/decomposer';
import type { ExecutionTask, GitSpiceStackInfo } from '../types/execution';

import { logger } from '../utils/logger';
import { CommitMessageGenerator } from '../vcs/commit-message-generator';
import { ConflictResolver } from '../vcs/conflict-resolver';
import { GitWrapper } from '../vcs/git-wrapper';
import { StackBuilder } from '../vcs/stack-builder';
import { WorktreeManager } from '../vcs/worktree-manager';

export type VcsEngineOptions = {
  branchPrefix: string; // Default: 'chopstack/'
  cleanupOnFailure: boolean; // Default: false
  cleanupOnSuccess: boolean; // Default: true
  conflictStrategy: 'auto' | 'manual' | 'fail';
  shadowPath: string; // Default: '.chopstack/shadows'
  stackSubmission: {
    autoMerge: boolean;
    draft: boolean;
    enabled: boolean;
  };
};

export type CommitOptions = {
  files?: string[];
  generateMessage?: boolean;
  includeAll?: boolean;
  message?: string;
};

export type WorktreeExecutionContext = {
  absolutePath: string;
  baseRef: string;
  branchName: string;
  taskId: string;
  worktreePath: string;
};

/**
 * VcsEngine manages the complete flow from parallel task execution
 * in isolated worktrees to incremental git-spice stack creation
 */
export class VcsEngine extends EventEmitter {
  private readonly worktreeManager: WorktreeManager;
  private readonly stackBuilder: StackBuilder;
  private readonly conflictResolver: ConflictResolver;
  private readonly commitMessageGenerator: CommitMessageGenerator;
  private readonly options: VcsEngineOptions;

  constructor(options?: Partial<VcsEngineOptions>) {
    super();

    this.options = {
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
      ...options,
    };

    this.worktreeManager = new WorktreeManager(this.options);
    this.stackBuilder = new StackBuilder(this.options);
    this.conflictResolver = new ConflictResolver(this.options);
    this.commitMessageGenerator = new CommitMessageGenerator({
      logger: { warn: logger.warn.bind(logger) },
    });

    this._setupEventForwarding();
  }

  private _setupEventForwarding(): void {
    this.worktreeManager.on('worktree_created', (event) => {
      this.emit('worktree_created', event);
    });

    this.worktreeManager.on('worktree_cleanup', (event) => {
      this.emit('worktree_cleanup', event);
    });

    this.stackBuilder.on('branch_created', (event) => {
      this.emit('branch_created', event);
    });

    this.stackBuilder.on('stack_built', (event) => {
      this.emit('stack_built', event);
    });
  }

  /**
   * Analyze execution plan to determine worktree requirements
   */
  async analyzeWorktreeNeeds(
    plan: Plan,
    workdir: string,
  ): Promise<{
    estimatedDiskUsage: number;
    maxConcurrentTasks: number;
    parallelLayers: number;
    requiresWorktrees: boolean;
  }> {
    // Calculate if worktrees are needed (parallel tasks exist)
    const executionLayers = this._createExecutionLayers(plan);
    const requiresWorktrees = executionLayers.some((layer) => layer.length > 1);
    const maxConcurrentTasks = Math.max(...executionLayers.map((layer) => layer.length));

    // Estimate disk usage (rough calculation)
    let estimatedDiskUsage = 0;
    if (requiresWorktrees) {
      try {
        const { stdout } = await execa('du', ['-sk', '.'], { cwd: workdir });
        const repoSizeKb = Number.parseInt(stdout.split('\t')[0] ?? '0', 10);
        estimatedDiskUsage = repoSizeKb * maxConcurrentTasks; // KB
      } catch {
        estimatedDiskUsage = 100_000 * maxConcurrentTasks; // Fallback: 100MB per worktree
      }
    }

    return {
      requiresWorktrees,
      parallelLayers: executionLayers.length,
      maxConcurrentTasks,
      estimatedDiskUsage,
    };
  }

  /**
   * Create worktrees for all tasks that need them
   */
  async createWorktreesForLayer(
    tasks: ExecutionTask[],
    baseRef: string,
    workdir: string,
  ): Promise<WorktreeExecutionContext[]> {
    const worktreePromises = tasks.map(async (task) => {
      const branchName = `${this.options.branchPrefix}${task.id}`;
      const worktreePath = `${this.options.shadowPath}/${task.id}`;

      const context = await this.worktreeManager.createWorktree({
        taskId: task.id,
        branchName,
        worktreePath,
        baseRef,
        workdir,
      });

      // Map WorktreeContext to WorktreeExecutionContext
      return {
        taskId: context.taskId,
        branchName: context.branchName,
        baseRef: context.baseRef,
        worktreePath: context.worktreePath,
        absolutePath: context.absolutePath,
      };
    });

    return Promise.all(worktreePromises);
  }

  /**
   * Generate intelligent commit message based on task and changes
   */
  async generateCommitMessage(
    task: ExecutionTask,
    changes: { files?: string[]; output?: string },
    workdir: string,
  ): Promise<string> {
    return this.commitMessageGenerator.generateCommitMessage(task, {
      ...(changes.files !== undefined && { files: changes.files }),
      ...(changes.output !== undefined && { output: changes.output }),
      workdir,
    });
  }

  /**
   * Commit task changes in its worktree
   */
  async commitTaskChanges(
    task: ExecutionTask,
    context: WorktreeExecutionContext,
    options: CommitOptions = {},
  ): Promise<string> {
    const workdir = context.absolutePath;
    const git = new GitWrapper(workdir);

    // Generate commit message if not provided
    let commitMessage = options.message;
    if (commitMessage === undefined && options.generateMessage !== false) {
      const changes = await this._analyzeChanges(git, options.files);
      commitMessage = await this.generateCommitMessage(task, changes, workdir);
    }

    if (commitMessage === undefined) {
      throw new Error(`No commit message provided for task ${task.id}`);
    }

    // Stage files
    if (options.includeAll === true) {
      await git.add('.');
    } else if (options.files !== undefined && options.files.length > 0) {
      await git.add(options.files);
    }

    // Check if there are changes to commit
    const hasChanges = await git.hasChangesToCommit();
    if (!hasChanges) {
      throw new Error(`No changes to commit for task ${task.id}`);
    }

    // Create commit - simple-git handles message escaping
    const commitHash = await git.commit(commitMessage);

    logger.info(
      `📝 Committed task ${task.id}: ${commitHash.slice(0, 7)} - ${commitMessage.split('\n')[0]}`,
    );

    return commitHash;
  }

  /**
   * Build git-spice stack incrementally from completed tasks
   */
  async buildStackIncremental(
    completedTasks: ExecutionTask[],
    workdir: string,
    options: {
      parentRef?: string;
      strategy?: 'dependency-order' | 'complexity-first' | 'file-impact';
      submitStack?: boolean;
    } = {},
  ): Promise<GitSpiceStackInfo> {
    const stackInfo = await this.stackBuilder.buildIncremental(completedTasks, workdir, {
      parentRef: options.parentRef ?? 'main',
      strategy: options.strategy ?? 'dependency-order',
      conflictResolver: this.conflictResolver,
    });

    if (options.submitStack === true && this.options.stackSubmission.enabled) {
      const prUrls = await this.stackBuilder.submitStack(workdir);
      stackInfo.prUrls = prUrls;
    }

    return stackInfo;
  }

  /**
   * Clean up worktrees after execution
   */
  async cleanupWorktrees(
    contexts: WorktreeExecutionContext[],
    options: { preserveOnFailure?: boolean } = {},
  ): Promise<void> {
    const shouldCleanup = match(options)
      .with({ preserveOnFailure: true }, () => this.options.cleanupOnSuccess)
      .otherwise(() => this.options.cleanupOnSuccess || this.options.cleanupOnFailure);

    if (!shouldCleanup) {
      logger.info('🏗️ Preserving worktrees for debugging');
      return;
    }

    await this.worktreeManager.cleanupWorktrees(contexts.map((c) => c.taskId));
  }

  private async _analyzeChanges(
    git: GitWrapper,
    files?: string[],
  ): Promise<{ files: string[]; output?: string }> {
    if (files !== undefined) {
      return { files };
    }

    // Get list of changed files using GitWrapper
    const status = await git.status();
    const changedFiles = [...status.added, ...status.modified, ...status.deleted];

    return { files: changedFiles };
  }

  private _createExecutionLayers(plan: Plan): ExecutionTask[][] {
    // This is a simplified version - in real implementation, this would use
    // the ExecutionPlanner to create proper dependency-aware layers
    const tasks = plan.tasks.map((task) => ({
      ...task,
      state: 'pending' as const,
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
    }));

    // Group by dependencies (simplified)
    const layers: ExecutionTask[][] = [];
    const processed = new Set<string>();

    while (processed.size < tasks.length) {
      const currentLayer = tasks.filter(
        (task) => !processed.has(task.id) && task.requires.every((dep) => processed.has(dep)),
      );

      if (currentLayer.length === 0) {
        // Break circular dependencies or add remaining tasks
        const remaining = tasks.filter((task) => !processed.has(task.id));
        if (remaining.length > 0) {
          const firstRemaining = remaining[0];
          if (firstRemaining !== undefined) {
            layers.push([firstRemaining]);
            processed.add(firstRemaining.id);
          }
        }
      } else {
        layers.push(currentLayer);
        for (const task of currentLayer) {
          processed.add(task.id);
        }
      }
    }

    return layers;
  }
}
