import { EventEmitter } from 'node:events';

import type { VcsEngineOptions } from '@/engine/vcs-engine';
import type { ExecutionTask, GitSpiceStackInfo } from '@/types/execution';

import { logger } from '@/utils/logger';

import type { ConflictResolver } from './conflict-resolver';

import { GitSpiceBackend } from './git-spice';

export type StackBuildOptions = {
  conflictResolver: ConflictResolver;
  parentRef: string;
  strategy: 'dependency-order' | 'complexity-first' | 'file-impact';
};

export type StackEvent = {
  branchName?: string;
  stackInfo?: GitSpiceStackInfo;
  taskId?: string;
  timestamp: Date;
  type: 'branch_created' | 'stack_built' | 'conflict_detected' | 'conflict_resolved';
};

/**
 * StackBuilder handles incremental git-spice stack creation from completed tasks
 */
export class StackBuilder extends EventEmitter {
  private readonly gitSpice: GitSpiceBackend;
  private readonly options: VcsEngineOptions;

  constructor(options: VcsEngineOptions) {
    super();
    this.options = options;
    this.gitSpice = new GitSpiceBackend();
  }

  /**
   * Build git-spice stack incrementally from completed tasks
   */
  async buildIncremental(
    completedTasks: ExecutionTask[],
    workdir: string,
    options: StackBuildOptions,
  ): Promise<GitSpiceStackInfo> {
    logger.info(`🏗️ Building git-spice stack from ${completedTasks.length} completed tasks...`);

    // Filter tasks that have commits
    const tasksWithCommits = completedTasks.filter((task) => task.commitHash !== undefined);
    if (tasksWithCommits.length === 0) {
      throw new Error('No tasks with commits found for stack building');
    }

    // Order tasks based on strategy
    const orderedTasks = this._orderTasksForStack(tasksWithCommits, options.strategy);

    // Initialize git-spice if needed
    await this.gitSpice.initialize(workdir);

    // Build stack
    const stackInfo = await this.gitSpice.createStack(orderedTasks, workdir, options.parentRef);

    this.emit('stack_built', {
      type: 'stack_built',
      stackInfo,
      timestamp: new Date(),
    } as StackEvent);

    logger.info(`✅ Built git-spice stack with ${stackInfo.branches.length} branches`);
    return stackInfo;
  }

  /**
   * Submit stack to GitHub as pull requests
   */
  async submitStack(workdir: string): Promise<string[]> {
    logger.info('🚀 Submitting git-spice stack to GitHub...');

    const prUrls = await this.gitSpice.submitStack(workdir);

    logger.info(`✅ Created ${prUrls.length} pull requests`);
    return prUrls;
  }

  private _orderTasksForStack(
    tasks: ExecutionTask[],
    strategy: StackBuildOptions['strategy'],
  ): ExecutionTask[] {
    switch (strategy) {
      case 'dependency-order': {
        return this._orderByDependencies(tasks);
      }
      case 'complexity-first': {
        return tasks.sort((a, b) => {
          return a.estimatedLines - b.estimatedLines;
        });
      }
      case 'file-impact': {
        return tasks.sort(
          (a, b) => a.touches.length + a.produces.length - (b.touches.length + b.produces.length),
        );
      }
      default: {
        return tasks;
      }
    }
  }

  private _orderByDependencies(tasks: ExecutionTask[]): ExecutionTask[] {
    const ordered: ExecutionTask[] = [];
    const processed = new Set<string>();
    const taskMap = new Map(tasks.map((task) => [task.id, task]));

    const addTask = (task: ExecutionTask): void => {
      if (processed.has(task.id)) {
        return;
      }

      // Add dependencies first
      for (const depId of task.requires) {
        const depTask = taskMap.get(depId);
        if (depTask !== undefined && !processed.has(depId)) {
          addTask(depTask);
        }
      }

      ordered.push(task);
      processed.add(task.id);
    };

    for (const task of tasks) {
      addTask(task);
    }

    return ordered;
  }
}
