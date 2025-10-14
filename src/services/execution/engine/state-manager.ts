import { match, P } from 'ts-pattern';

import type { ExecutionTask, TaskState, TaskStateTransition } from '@/core/execution/types';

type StateTransitionRule = {
  condition?: (task: ExecutionTask) => boolean;
  from: TaskState;
  to: TaskState;
};

export class StateManager {
  private static readonly VALID_TRANSITIONS: StateTransitionRule[] = [
    { from: 'pending', to: 'ready' },
    { from: 'pending', to: 'blocked' },
    { from: 'ready', to: 'queued' },
    { from: 'queued', to: 'running' },
    { from: 'running', to: 'completed' },
    { from: 'running', to: 'failed' },
    { from: 'failed', to: 'queued' }, // Retry
    { from: 'blocked', to: 'ready' },
    { from: 'blocked', to: 'skipped' },
    { from: 'ready', to: 'skipped' },
    { from: 'queued', to: 'skipped' },
  ];

  isValidTransition(from: TaskState, to: TaskState): boolean {
    return StateManager.VALID_TRANSITIONS.some((rule) => rule.from === from && rule.to === to);
  }

  transitionTask(task: ExecutionTask, newState: TaskState, reason?: string): ExecutionTask {
    if (!this.isValidTransition(task.state, newState)) {
      throw new Error(
        `Invalid state transition from ${task.state} to ${newState} for task ${task.id}`,
      );
    }

    const transition: TaskStateTransition = {
      from: task.state,
      to: newState,
      timestamp: new Date(),
      reason,
    };

    task.state = newState;
    task.stateHistory.push(transition);

    return this._applyStateEffects(task, newState);
  }

  private _applyStateEffects(task: ExecutionTask, state: TaskState): ExecutionTask {
    return match(state)
      .with('running', () => {
        task.startTime = new Date();
        return task;
      })
      .with(P.union('completed', 'skipped'), () => {
        task.endTime = new Date();
        if (task.startTime !== undefined) {
          task.duration = task.endTime.getTime() - task.startTime.getTime();
        }
        return task;
      })
      .with('failed', () => {
        task.endTime = new Date();
        if (task.startTime !== undefined) {
          task.duration = task.endTime.getTime() - task.startTime.getTime();
        }
        task.retryCount++;
        return task;
      })
      .otherwise(() => task);
  }

  canRetry(task: ExecutionTask): boolean {
    return task.state === 'failed' && task.retryCount < task.maxRetries;
  }

  shouldSkip(task: ExecutionTask, dependencies: Map<string, ExecutionTask>): boolean {
    const hasFailedDependency = task.dependencies.some((depId) => {
      const dep = dependencies.get(depId);
      return dep?.state === 'failed' || dep?.state === 'skipped';
    });

    return hasFailedDependency;
  }

  getTasksByState(tasks: Map<string, ExecutionTask>, state: TaskState): ExecutionTask[] {
    return [...tasks.values()].filter((task) => task.state === state);
  }

  updateDependentTasks(taskId: string, tasks: Map<string, ExecutionTask>): ExecutionTask[] {
    const updatedTasks: ExecutionTask[] = [];
    const completedTask = tasks.get(taskId);

    if (completedTask === undefined) {
      return updatedTasks;
    }

    for (const task of tasks.values()) {
      if (!task.dependencies.includes(taskId)) {
        continue;
      }

      const allDependenciesCompleted = task.dependencies.every((depId) => {
        const dep = tasks.get(depId);
        return dep?.state === 'completed';
      });

      const shouldSkipTask = this.shouldSkip(task, tasks);

      match({ allDependenciesCompleted, shouldSkipTask, currentState: task.state })
        .with(
          { shouldSkipTask: true, currentState: P.union('pending', 'blocked', 'ready') },
          () => {
            this.transitionTask(task, 'skipped', 'Dependency failed or skipped');
            updatedTasks.push(task);
          },
        )
        .with(
          { allDependenciesCompleted: true, currentState: P.union('pending', 'blocked') },
          () => {
            this.transitionTask(task, 'ready', 'All dependencies completed');
            updatedTasks.push(task);
          },
        )
        .with({ allDependenciesCompleted: false, currentState: 'pending' }, () => {
          const hasRunningDependency = task.dependencies.some((depId) => {
            const dep = tasks.get(depId);
            return dep?.state === 'running' || dep?.state === 'queued';
          });

          if (hasRunningDependency) {
            this.transitionTask(task, 'blocked', 'Waiting for dependencies');
            updatedTasks.push(task);
          }
        })
        .otherwise(() => {});
    }

    return updatedTasks;
  }

  getExecutionStats(tasks: Map<string, ExecutionTask>): Record<TaskState, number> {
    const stats: Record<TaskState, number> = {
      pending: 0,
      ready: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
    };

    for (const task of tasks.values()) {
      stats[task.state]++;
    }

    return stats;
  }

  isTerminalState(state: TaskState): boolean {
    return ['completed', 'failed', 'skipped'].includes(state);
  }

  isExecutableState(state: TaskState): boolean {
    return ['ready', 'queued'].includes(state);
  }

  calculateProgress(tasks: Map<string, ExecutionTask>): {
    completed: number;
    percentage: number;
    total: number;
  } {
    const total = tasks.size;
    const completed = [...tasks.values()].filter((task) => this.isTerminalState(task.state)).length;

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  getStateHistory(task: ExecutionTask): TaskStateTransition[] {
    return task.stateHistory;
  }

  getLastTransition(task: ExecutionTask): TaskStateTransition | undefined {
    return task.stateHistory.at(-1);
  }

  resetTask(task: ExecutionTask): ExecutionTask {
    const oldState = task.state;
    task.state = 'pending';
    task.stateHistory = [
      {
        from: oldState,
        to: 'pending',
        timestamp: new Date(),
        reason: 'Task reset',
      },
    ];
    delete task.startTime;
    delete task.endTime;
    delete task.duration;
    delete task.output;
    delete task.error;
    delete task.exitCode;
    task.retryCount = 0;

    return task;
  }

  batchTransition(tasks: ExecutionTask[], newState: TaskState, reason?: string): ExecutionTask[] {
    return tasks.map((task) => this.transitionTask(task, newState, reason));
  }
}
