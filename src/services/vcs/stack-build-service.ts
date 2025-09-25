import { EventEmitter } from 'node:events';

import type { StackBuildService, StackBuildStrategy, StackInfo } from '@/core/vcs/domain-services';
import type { ExecutionTask } from '@/types/execution';

import { GitSpiceBackend } from '@/adapters/vcs/git-spice/backend';
import { logger } from '@/utils/logger';

export type StackEvent = {
  branchName?: string;
  stackInfo?: StackInfo;
  taskId?: string;
  timestamp: Date;
  type: 'branch_created' | 'stack_built' | 'conflict_detected' | 'conflict_resolved';
};

export type StackBuildServiceConfig = {
  branchPrefix: string;
  parentRef: string;
  stackSubmissionEnabled: boolean;
};

/**
 * Implementation of StackBuildService domain interface
 * Handles git-spice stack creation and management
 */
export class StackBuildServiceImpl extends EventEmitter implements StackBuildService {
  private readonly gitSpice: GitSpiceBackend;
  private readonly config: StackBuildServiceConfig;

  constructor(config: StackBuildServiceConfig) {
    super();
    this.config = config;
    this.gitSpice = new GitSpiceBackend();
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

    this.emit('stack_built', {
      type: 'stack_built',
      stackInfo,
      timestamp: new Date(),
    } as StackEvent);

    logger.info(`✅ Stack built successfully with ${stackInfo.branches.length} branches`);
    return stackInfo;
  }

  async submitStack(workdir: string): Promise<string[]> {
    if (!this.config.stackSubmissionEnabled) {
      throw new Error('Stack submission is not enabled');
    }

    logger.info('📤 Submitting git-spice stack for review...');

    try {
      const prUrls = await this.gitSpice.submitStack(workdir);
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
      return {
        branches: gitSpiceInfo.branches.map((branch) => ({
          branchName: branch.name,
          taskId: branch.taskId,
          commitHash: branch.commitHash,
        })),
        parentRef: gitSpiceInfo.stackRoot !== '' ? gitSpiceInfo.stackRoot : this.config.parentRef,
        strategy: 'dependency-order',
        totalTasks: gitSpiceInfo.branches.length,
        prUrls: gitSpiceInfo.prUrls ?? undefined,
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
    let currentParent = parentRef;

    for (const task of orderedTasks) {
      if (task.commitHash === undefined) {
        continue;
      }

      const branchName = `${this.config.branchPrefix}${task.id}`;

      try {
        // Create branch for this task's commit
        await this.gitSpice.createBranchFromCommit(
          branchName,
          task.commitHash,
          currentParent,
          workdir,
        );

        branches.push({
          branchName,
          commitHash: task.commitHash,
          taskId: task.id,
        });

        this.emit('branch_created', {
          type: 'branch_created',
          branchName,
          taskId: task.id,
          timestamp: new Date(),
        } as StackEvent);

        // Next branch will be based on this one
        currentParent = branchName;

        logger.info(`✅ Created branch ${branchName} for task ${task.id}`);
      } catch (error) {
        logger.error(
          `❌ Failed to create branch ${branchName} for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    return {
      branches,
      parentRef,
      strategy: 'dependency-order', // This is determined by the ordering
      totalTasks: orderedTasks.length,
    };
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
}
