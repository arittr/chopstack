import { execa } from 'execa';

import type { VcsAnalysisService } from '@/core/vcs/domain-services';
import type { ExecutionTask } from '@/types/execution';

/**
 * Implementation of VcsAnalysisService domain interface
 * Handles analysis of repository and worktree requirements
 */
export class VcsAnalysisServiceImpl implements VcsAnalysisService {
  async analyzeWorktreeNeeds(
    tasks: ExecutionTask[],
    workdir: string,
  ): Promise<{
    estimatedDiskUsage: number;
    maxConcurrentTasks: number;
    parallelLayers: number;
    requiresWorktrees: boolean;
  }> {
    // Create execution layers based on dependencies
    const executionLayers = this.createExecutionLayers(tasks);
    const requiresWorktrees = executionLayers.some((layer) => layer.length > 1);
    const maxConcurrentTasks = Math.max(...executionLayers.map((layer) => layer.length), 1);

    // Estimate disk usage
    const estimatedDiskUsage = requiresWorktrees
      ? await this.estimateDiskUsage(workdir, maxConcurrentTasks)
      : 0;

    return {
      requiresWorktrees,
      parallelLayers: executionLayers.length,
      maxConcurrentTasks,
      estimatedDiskUsage,
    };
  }

  async estimateDiskUsage(workdir: string, taskCount: number): Promise<number> {
    if (taskCount === 0) {
      return 0;
    }

    try {
      // Use 'du' command to get repository size
      const { stdout } = await execa('du', ['-sk', '.'], { cwd: workdir });
      const repoSizeKb = Number.parseInt(stdout.split('\t')[0] ?? '0', 10);
      return repoSizeKb * taskCount; // KB
    } catch {
      // Fallback: estimate 100MB per worktree
      return 100_000 * taskCount; // KB
    }
  }

  createExecutionLayers(tasks: ExecutionTask[]): ExecutionTask[][] {
    const layers: ExecutionTask[][] = [];
    const processed = new Set<string>();

    // Build layers based on dependencies
    while (processed.size < tasks.length) {
      const currentLayer: ExecutionTask[] = [];

      // Find tasks whose dependencies are all satisfied
      for (const task of tasks) {
        if (processed.has(task.id)) {
          continue;
        }

        // Check if all dependencies are processed
        const dependenciesSatisfied = task.requires.every((depId) => processed.has(depId));
        if (dependenciesSatisfied) {
          currentLayer.push(task);
        }
      }

      // If no tasks can be processed, break circular dependencies
      if (currentLayer.length === 0) {
        const remaining = tasks.filter((task) => !processed.has(task.id));
        if (remaining.length > 0) {
          // Add the first remaining task to break the cycle
          const firstRemaining = remaining[0];
          if (firstRemaining !== undefined) {
            currentLayer.push(firstRemaining);
          }
        }
      }

      if (currentLayer.length === 0) {
        // Safety break - shouldn't happen if tasks array is valid
        break;
      }

      layers.push(currentLayer);

      // Mark current layer tasks as processed
      for (const task of currentLayer) {
        processed.add(task.id);
      }
    }

    return layers;
  }
}
