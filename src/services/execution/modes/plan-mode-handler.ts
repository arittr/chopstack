import type {
  ExecutionContext,
  PlanModeHandler,
  PlanModeResult,
  TaskResult,
} from '@/core/execution/interfaces';
import type { OrchestratorTaskResult, TaskOrchestrator } from '@/services/orchestration';
import type { TaskV2 } from '@/types/schemas-v2';

import { logger } from '@/utils/global-logger';
import { isNonNullish } from '@/validation/guards';

export class PlanModeHandlerImpl implements PlanModeHandler {
  constructor(private readonly _orchestrator: TaskOrchestrator) {}

  async handle(tasks: TaskV2[], context: ExecutionContext): Promise<PlanModeResult> {
    logger.info(`[chopstack] Executing ${tasks.length} tasks in plan mode`);

    const results: TaskResult[] = [];
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const skippedCount = 0;

    for (const task of tasks) {
      const taskStart = Date.now();

      try {
        // Generate agent prompt for v2 task
        const agentPrompt = this._generateAgentPrompt(task);

        const result: OrchestratorTaskResult = await this._orchestrator.executeTask(
          task.id,
          task.name,
          agentPrompt,
          task.files,
          context.cwd,
          'plan',
          context.agentType,
        );

        const taskResult: TaskResult = {
          taskId: task.id,
          status: result.status === 'completed' ? 'success' : 'failure',
          duration: Date.now() - taskStart,
          ...(isNonNullish(result.output) && { output: result.output }),
        };

        if (taskResult.status === 'success') {
          successCount++;
        } else {
          failureCount++;
        }

        results.push(taskResult);
      } catch (error) {
        const taskResult: TaskResult = {
          taskId: task.id,
          status: 'failure',
          duration: Date.now() - taskStart,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        failureCount++;
        results.push(taskResult);

        if (!context.continueOnError) {
          break;
        }
      }
    }

    return {
      tasks: results,
      totalDuration: Date.now() - startTime,
      successCount,
      failureCount,
      skippedCount,
    };
  }

  /**
   * Generate agent prompt for v2 task with acceptance criteria
   */
  private _generateAgentPrompt(task: TaskV2): string {
    let prompt = task.description;

    // Add acceptance criteria if present
    if (isNonNullish(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0) {
      prompt += '\n\n## Acceptance Criteria\n';
      for (const criterion of task.acceptanceCriteria) {
        prompt += `- ${criterion}\n`;
      }
    }

    // Add complexity information
    if (isNonNullish(task.complexity)) {
      prompt += `\n\n## Task Complexity: ${task.complexity}`;
    }

    return prompt;
  }
}
