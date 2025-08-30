import { match } from 'ts-pattern';

import { isNonNullish } from '../utils/guards';

import type { Plan, PlanMetrics, Task, ValidationResult } from './decomposer';

export class PlanValidator {
  validatePlan(plan: Plan): ValidationResult {
    const conflictValidation = this.validateConflictFree(plan);
    const dependencyValidation = this.validateDependencies(plan);

    return match([conflictValidation.valid, dependencyValidation.valid])
      .with([true, true], () => ({ valid: true }))
      .otherwise(() => ({
        circularDependencies: dependencyValidation.circularDependencies,
        conflictingTasks: conflictValidation.conflictingTasks,
        conflicts: conflictValidation.conflicts,
        errors: [
          ...(conflictValidation.errors ?? []),
          ...(dependencyValidation.errors ?? []),
        ],
        valid: false,
      }));
  }

  validateConflictFree(plan: Plan): ValidationResult {
    const parallelGroups = this._getParallelGroups(plan);

    for (const group of parallelGroups) {
      const allFiles = group.flatMap((task) => [...task.touches, ...task.produces]);
      const duplicates = this._findDuplicates(allFiles);

      if (duplicates.length > 0) {
        return {
          conflicts: duplicates,
          conflictingTasks: group.filter((task) =>
            [...task.touches, ...task.produces].some((file) => duplicates.includes(file))
          ),
          valid: false,
        };
      }
    }

    return { valid: true };
  }

  validateDependencies(plan: Plan): ValidationResult {
    const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const task of plan.tasks) {
      if (!visited.has(task.id)) {
        const cycle = this._detectCycle(task.id, taskMap, visited, recursionStack);
        if (cycle.length > 0) {
          return {
            circularDependencies: cycle,
            errors: [`Circular dependency detected: ${cycle.join(' -> ')}`],
            valid: false,
          };
        }
      }
    }

    return { valid: true };
  }

  private _detectCycle(
    taskId: string,
    taskMap: Map<string, Task>,
    visited: Set<string>,
    recursionStack: Set<string>
  ): string[] {
    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (!isNonNullish(task)) {
      return [];
    }

    for (const depId of task.requires) {
      if (!visited.has(depId)) {
        const cycle = this._detectCycle(depId, taskMap, visited, recursionStack);
        if (cycle.length > 0) {
          return [taskId, ...cycle];
        }
      } else if (recursionStack.has(depId)) {
        return [taskId, depId];
      }
    }

    recursionStack.delete(taskId);
    return [];
  }

  private _getParallelGroups(plan: Plan): Task[][] {
    const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));
    const levels = new Map<string, number>();

    // Calculate dependency levels using topological sort
    const calculateLevel = (taskId: string, visited: Set<string>): number => {
      if (visited.has(taskId)) {
        return levels.get(taskId) ?? 0;
      }

      visited.add(taskId);
      const task = taskMap.get(taskId);
      if (!isNonNullish(task)) {
        return 0;
      }

      let maxDepLevel = -1;
      for (const depId of task.requires) {
        maxDepLevel = Math.max(maxDepLevel, calculateLevel(depId, visited));
      }

      const level = maxDepLevel + 1;
      levels.set(taskId, level);
      return level;
    };

    const visited = new Set<string>();
    for (const task of plan.tasks) {
      calculateLevel(task.id, visited);
    }

    // Group tasks by level
    const groups: Task[][] = [];
    const levelGroups = new Map<number, Task[]>();

    for (const task of plan.tasks) {
      const level = levels.get(task.id) ?? 0;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      const group = levelGroups.get(level);
      if (isNonNullish(group)) {
        group.push(task);
      }
    }

    // Convert to array of groups
    const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);
    for (const level of sortedLevels) {
      const group = levelGroups.get(level);
      if (isNonNullish(group)) {
        groups.push(group);
      }
    }

    return groups;
  }

  private _findDuplicates<T>(array: T[]): T[] {
    const seen = new Set<T>();
    const duplicates = new Set<T>();

    for (const item of array) {
      if (seen.has(item)) {
        duplicates.add(item);
      } else {
        seen.add(item);
      }
    }

    return [...duplicates];
  }

  calculateMetrics(plan: Plan): PlanMetrics {
    const parallelGroups = this._getParallelGroups(plan);
    const maxParallelization = Math.max(...parallelGroups.map((group) => group.length));
    const totalEstimatedLines = plan.tasks.reduce((sum, task) => sum + task.estimatedLines, 0);

    // Simple speedup calculation: serial time / parallel time
    const serialTime = plan.tasks.length;
    const parallelTime = parallelGroups.length;
    const estimatedSpeedup = parallelTime > 0 ? serialTime / parallelTime : 1;

    return {
      estimatedSpeedup,
      maxParallelization,
      taskCount: plan.tasks.length,
      totalEstimatedLines,
    };
  }
}