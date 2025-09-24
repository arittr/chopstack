import type { Graph } from '@dagrejs/graphlib';

import pkg from '@dagrejs/graphlib';

import type { Plan, PlanMetrics, Task } from '../types/decomposer';

import { PlanValidationError } from '../utils/errors';

const { alg, Graph: GraphConstructor } = pkg;

export type ValidationResult = {
  circularDependencies?: string[];
  conflicts?: string[];
  errors: string[];
  missingDependencies?: string[];
  orphanedTasks?: string[];
  valid: boolean;
};

/**
 * Enhanced DAG validator using graphlib for robust dependency analysis
 */
export class DagValidator {
  /**
   * Validate a plan using graphlib DAG analysis
   */
  static validatePlan(plan: Plan): ValidationResult {
    const errors: string[] = [];
    const conflicts: string[] = [];

    try {
      // Build the dependency graph
      const graph = this._buildDependencyGraph(plan.tasks);

      // Check for circular dependencies
      const cycles = this._detectCycles(graph);

      // Check for file conflicts
      const fileConflicts = this._detectFileConflicts(plan.tasks);

      // Check for missing dependencies
      const missingDeps = this._detectMissingDependencies(plan.tasks);

      // Check for orphaned tasks
      const orphaned = this._detectOrphanedTasks(graph, plan.tasks);

      // Validate task structure
      const taskErrors = this._validateTaskStructure(plan.tasks);

      errors.push(...taskErrors);
      conflicts.push(...fileConflicts);

      const result: ValidationResult = {
        valid:
          errors.length === 0 &&
          cycles.length === 0 &&
          fileConflicts.length === 0 &&
          missingDeps.length === 0,
        errors,
        ...(conflicts.length > 0 ? { conflicts } : {}),
        ...(cycles.length > 0 ? { circularDependencies: cycles } : {}),
        ...(orphaned.length > 0 ? { orphanedTasks: orphaned } : {}),
        ...(missingDeps.length > 0 ? { missingDependencies: missingDeps } : {}),
      };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown validation error';
      return {
        valid: false,
        errors: [`Validation failed: ${message}`],
      };
    }
  }

  /**
   * Calculate enhanced metrics using DAG analysis
   */
  static calculateMetrics(plan: Plan): PlanMetrics {
    const graph = this._buildDependencyGraph(plan.tasks);

    // Check if the graph has cycles before trying to calculate metrics
    const cycles = this._detectCycles(graph);
    if (cycles.length > 0) {
      // Return minimal metrics for invalid DAG
      return {
        taskCount: plan.tasks.length,
        maxParallelization: 1,
        estimatedSpeedup: 1,
        totalEstimatedLines: plan.tasks.reduce((sum, task) => sum + task.estimatedLines, 0),
        executionLayers: 1,
        criticalPathLength: plan.tasks.reduce((sum, task) => sum + task.estimatedLines, 0),
      };
    }

    // Get topological ordering to understand execution layers
    const topologicalOrder = alg.topsort(graph);
    const layers = this._calculateExecutionLayers(graph, topologicalOrder);

    // Calculate maximum parallelization (widest layer)
    const maxParallelization = Math.max(...layers.map((layer) => layer.length));

    // Calculate estimated speedup based on critical path
    const criticalPathLength = this._calculateCriticalPathLength(graph, plan.tasks);
    const totalSequentialTime = plan.tasks.reduce((sum, task) => sum + task.estimatedLines, 0);
    const estimatedSpeedup = totalSequentialTime / Math.max(criticalPathLength, 1);

    return {
      taskCount: plan.tasks.length,
      maxParallelization,
      estimatedSpeedup,
      totalEstimatedLines: totalSequentialTime,
      executionLayers: layers.length,
      criticalPathLength,
    };
  }

  /**
   * Get tasks in topological order for execution
   */
  static getExecutionOrder(plan: Plan): Task[] {
    const graph = this._buildDependencyGraph(plan.tasks);

    // Check for cycles before trying to get topological order
    const cycles = this._detectCycles(graph);
    if (cycles.length > 0) {
      // Return tasks in original order if there are cycles
      return plan.tasks;
    }

    const topologicalOrder = alg.topsort(graph);
    const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));

    return topologicalOrder.map((taskId) => {
      const task = taskMap.get(taskId);
      if (task === undefined) {
        throw new PlanValidationError(`Task not found: ${taskId}`);
      }
      return task;
    });
  }

  /**
   * Get tasks grouped by execution layers for parallel processing
   */
  static getExecutionLayers(plan: Plan): Task[][] {
    const graph = this._buildDependencyGraph(plan.tasks);

    // Check for cycles before trying to get topological order
    const cycles = this._detectCycles(graph);
    if (cycles.length > 0) {
      // Return all tasks in a single layer if there are cycles
      return [plan.tasks];
    }

    const topologicalOrder = alg.topsort(graph);
    const layers = this._calculateExecutionLayers(graph, topologicalOrder);
    const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));

    return layers.map((layer) =>
      layer.map((taskId) => {
        const task = taskMap.get(taskId);
        if (task === undefined) {
          throw new PlanValidationError(`Task not found: ${taskId}`);
        }
        return task;
      }),
    );
  }

  private static _buildDependencyGraph(tasks: Task[]): Graph {
    const graph = new GraphConstructor({ directed: true });

    // Add all tasks as nodes
    for (const task of tasks) {
      graph.setNode(task.id);
    }

    // Add dependencies as edges
    for (const task of tasks) {
      for (const depId of task.requires) {
        graph.setEdge(depId, task.id);
      }
    }

    return graph;
  }

  private static _detectCycles(graph: Graph): string[] {
    const cycles: string[] = [];

    try {
      // If topsort throws, there are cycles
      alg.topsort(graph);
    } catch {
      // Find strongly connected components to identify cycles
      const components = alg.tarjan(graph);
      for (const component of components) {
        if (component.length > 1) {
          cycles.push(component.join(' -> '));
        }
      }
    }

    return cycles;
  }

  private static _detectFileConflicts(tasks: Task[]): string[] {
    const fileToTasks = new Map<string, string[]>();
    const graph = this._buildDependencyGraph(tasks);

    // Group tasks by files they modify
    for (const task of tasks) {
      for (const file of task.touches) {
        if (!fileToTasks.has(file)) {
          fileToTasks.set(file, []);
        }
        const taskList = fileToTasks.get(file);
        if (taskList !== undefined) {
          taskList.push(task.id);
        }
      }
    }

    // Find files modified by multiple tasks that could run in parallel (true conflicts)
    const conflicts: string[] = [];
    for (const [file, taskIds] of fileToTasks) {
      if (taskIds.length > 1) {
        // Check if any pair of tasks could run in parallel
        const conflictingPairs: string[] = [];

        for (let index = 0; index < taskIds.length; index++) {
          for (let innerIndex = index + 1; innerIndex < taskIds.length; innerIndex++) {
            const taskA = taskIds[index] as string;
            const taskB = taskIds[innerIndex] as string;

            // Check if there's a dependency path between these tasks
            const hasPathAtoB = this._hasPath(graph, taskA, taskB);
            const hasPathBtoA = this._hasPath(graph, taskB, taskA);

            // If neither depends on the other, they could run in parallel - that's a conflict
            if (!hasPathAtoB && !hasPathBtoA) {
              conflictingPairs.push(`${taskA}, ${taskB}`);
            }
          }
        }

        if (conflictingPairs.length > 0) {
          conflicts.push(`${file} (parallel conflicts: ${conflictingPairs.join('; ')})`);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if there's a path from taskA to taskB in the graph
   */
  private static _hasPath(graph: Graph, taskA: string, taskB: string): boolean {
    // Use BFS to check if there's a path from taskA to taskB
    const visited = new Set<string>();
    const queue = [taskA];

    while (queue.length > 0) {
      const current = queue.shift() as string;

      if (current === taskB) {
        return true;
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      // Add all successors to the queue
      const outEdges = graph.outEdges(current);
      if (outEdges !== undefined) {
        for (const edge of outEdges) {
          queue.push(edge.w);
        }
      }
    }

    return false;
  }

  private static _detectMissingDependencies(tasks: Task[]): string[] {
    const taskIds = new Set(tasks.map((task) => task.id));
    const missing: string[] = [];

    for (const task of tasks) {
      for (const depId of task.requires) {
        if (!taskIds.has(depId)) {
          missing.push(`Task '${task.id}' depends on missing task '${depId}'`);
        }
      }
    }

    return missing;
  }

  private static _detectOrphanedTasks(graph: Graph, tasks: Task[]): string[] {
    const orphaned: string[] = [];

    for (const task of tasks) {
      const inEdges = graph.inEdges(task.id);
      const outEdges = graph.outEdges(task.id);
      const hasIncoming = (inEdges?.length ?? 0) > 0;
      const hasOutgoing = (outEdges?.length ?? 0) > 0;

      // Task is orphaned if it has no dependencies and nothing depends on it
      // (except if it's the only task)
      if (!hasIncoming && !hasOutgoing && tasks.length > 1) {
        orphaned.push(task.id);
      }
    }

    return orphaned;
  }

  private static _validateTaskStructure(tasks: Task[]): string[] {
    const errors: string[] = [];

    for (const task of tasks) {
      if (task.id.length === 0 || task.id.trim().length === 0) {
        errors.push('Task missing ID');
      }

      if (task.title.length === 0 || task.title.trim().length === 0) {
        errors.push(`Task '${task.id}' missing title`);
      }

      if (task.description.length === 0 || task.description.trim().length === 0) {
        errors.push(`Task '${task.id}' missing description`);
      }

      if (task.estimatedLines <= 0) {
        errors.push(`Task '${task.id}' has invalid estimated lines: ${task.estimatedLines}`);
      }

      if (task.agentPrompt.length === 0 || task.agentPrompt.trim().length === 0) {
        errors.push(`Task '${task.id}' missing agent prompt`);
      }
    }

    return errors;
  }

  private static _calculateExecutionLayers(graph: Graph, topologicalOrder: string[]): string[][] {
    const layers: string[][] = [];
    const processed = new Set<string>();

    for (const taskId of topologicalOrder) {
      // Find the earliest layer where this task can be placed
      let layerIndex = 0;

      const dependencies = graph.inEdges(taskId);
      if (dependencies === undefined) {
        continue;
      }
      for (const edge of dependencies) {
        const depTaskId = edge.v;
        // Find which layer the dependency is in
        for (const [index, layer] of layers.entries()) {
          if (layer.includes(depTaskId)) {
            layerIndex = Math.max(layerIndex, index + 1);
            break;
          }
        }
      }

      // Ensure we have enough layers
      while (layers.length <= layerIndex) {
        layers.push([]);
      }

      const targetLayer = layers[layerIndex] ?? (layers[layerIndex] = []);
      targetLayer.push(taskId);
      processed.add(taskId);
    }

    return layers;
  }

  private static _calculateCriticalPathLength(graph: Graph, tasks: Task[]): number {
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const memoized = new Map<string, number>();

    const calculatePath = (taskId: string): number => {
      if (memoized.has(taskId)) {
        return memoized.get(taskId) as number;
      }

      const task = taskMap.get(taskId);
      if (task === undefined) {
        return 0;
      }

      const dependencies = graph.inEdges(taskId);
      if (dependencies === undefined) {
        return task.estimatedLines;
      }
      let maxDepPath = 0;

      for (const edge of dependencies) {
        const depPath = calculatePath(String(edge.v));
        maxDepPath = Math.max(maxDepPath, depPath);
      }

      const totalPath = maxDepPath + task.estimatedLines;
      memoized.set(taskId, totalPath);
      return totalPath;
    };

    let criticalPath = 0;
    for (const task of tasks) {
      criticalPath = Math.max(criticalPath, calculatePath(task.id));
    }

    return criticalPath;
  }
}
