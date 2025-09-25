import type {
  ExecuteModeHandler,
  ExecutionContext,
  ExecutionResult,
  TaskResult,
} from '@/core/execution/interfaces';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import type {
  OrchestratorTaskResult,
  TaskOrchestrator,
} from '@/services/orchestration/task-orchestrator';
import type { Task } from '@/types/decomposer';

import { logger } from '@/utils/logger';

export class ExecuteModeHandlerImpl implements ExecuteModeHandler {
  constructor(
    private readonly _orchestrator: TaskOrchestrator,
    private readonly _vcsEngine: VcsEngineService,
  ) {}

  async handle(tasks: Task[], context: ExecutionContext): Promise<ExecutionResult> {
    logger.info(`[chopstack] Executing ${tasks.length} tasks in execute mode`);

    const results: TaskResult[] = [];
    const branches: string[] = [];
    const commits: string[] = [];
    const startTime = Date.now();

    // Group tasks by dependency layers for proper execution order
    const layers = this._groupTasksIntoLayers(tasks);

    for (const layer of layers) {
      const layerResults = await this._executeLayer(layer, context);
      results.push(...layerResults);

      // Stop if any task failed and continueOnError is false
      if (!context.continueOnError && layerResults.some((r) => r.status === 'failure')) {
        break;
      }
    }

    return {
      tasks: results,
      totalDuration: Date.now() - startTime,
      branches,
      commits,
    };
  }

  private _groupTasksIntoLayers(tasks: Task[]): Task[][] {
    const layers: Task[][] = [];
    const completed = new Set<string>();

    while (completed.size < tasks.length) {
      const layer: Task[] = [];

      for (const task of tasks) {
        if (!completed.has(task.id)) {
          // Check if all dependencies are completed
          const canExecute = task.requires.every((dep) => completed.has(dep));
          if (canExecute) {
            layer.push(task);
          }
        }
      }

      if (layer.length === 0) {
        // Circular dependency or invalid graph
        break;
      }

      layers.push(layer);
      for (const task of layer) {
        completed.add(task.id);
      }
    }

    return layers;
  }

  private async _executeLayer(layer: Task[], context: ExecutionContext): Promise<TaskResult[]> {
    if (context.strategy === 'serial' || layer.length === 1) {
      return this._executeLayerSerially(layer, context);
    }
    return this._executeLayerInParallel(layer, context);
  }

  private async _executeLayerSerially(
    layer: Task[],
    context: ExecutionContext,
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const task of layer) {
      const result = await this._executeTask(task, context);
      results.push(result);

      if (result.status === 'failure' && !context.continueOnError) {
        break;
      }
    }

    return results;
  }

  private async _executeLayerInParallel(
    layer: Task[],
    context: ExecutionContext,
  ): Promise<TaskResult[]> {
    const promises = layer.map(async (task) => this._executeTask(task, context));
    return Promise.all(promises);
  }

  private async _executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const taskStart = Date.now();

    try {
      const result: OrchestratorTaskResult = await this._orchestrator.executeClaudeTask(
        task.id,
        task.title,
        task.agentPrompt,
        task.touches,
        context.cwd,
        'execute',
      );

      return {
        taskId: task.id,
        status: result.status === 'completed' ? 'success' : 'failure',
        duration: Date.now() - taskStart,
        ...(result.output !== undefined && { output: result.output }),
      };
    } catch (error) {
      return {
        taskId: task.id,
        status: 'failure',
        duration: Date.now() - taskStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
