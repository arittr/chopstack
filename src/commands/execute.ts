import { readFile } from 'node:fs/promises';

import type { ExecuteCommandOptions, ExecutionOptions } from '../types/cli';
import type { Plan } from '../types/decomposer';

import { ExecutionEngine } from '../engine/execution-engine';
import { isNonEmptyString } from '../utils/guards';

export async function executeCommand(options: ExecuteCommandOptions): Promise<number> {
  try {
    if (!isNonEmptyString(options.plan)) {
      throw new Error('Plan file path is required');
    }

    console.log(`[chopstack] Loading plan from ${options.plan}...`);
    const planContent = await readFile(options.plan, 'utf8');
    const plan = JSON.parse(planContent) as Plan;

    const executionOptions: ExecutionOptions = {
      mode: options.mode,
      workdir: options.workdir ?? process.cwd(),
      strategy: options.strategy ?? 'parallel',
      gitSpice: options.gitSpice ?? false,
      continueOnError: options.continueOnError ?? false,
      timeout: options.timeout,
      retryAttempts: options.retryAttempts ?? 0,
      retryDelay: options.retryDelay ?? 5000,
    };

    if (options.verbose === true) {
      console.log(`[chopstack] Execution options:`, executionOptions);
      console.log(`[chopstack] Plan summary: ${plan.tasks.length} tasks`);
    }

    const engine = new ExecutionEngine();

    // Forward execution events to console if verbose
    if (options.verbose === true) {
      engine.on('execution_event', (event: { data: unknown; type: string }) => {
        console.log(`[chopstack] Event: ${event.type}`, event.data);
      });

      engine.on('task_update', (update: { status: string; taskId: string }) => {
        console.log(`[chopstack] Task ${update.taskId}: ${update.status}`);
      });
    }

    const result = await engine.execute(plan, executionOptions);

    if (options.verbose === true) {
      console.log(`[chopstack] Execution completed:`);
      console.log(`[chopstack]   Success: ${result.success}`);
      console.log(`[chopstack]   Tasks: ${result.tasksCompleted}/${result.tasksTotal} completed`);
      console.log(`[chopstack]   Duration: ${result.duration}ms`);
    }

    if (!result.success) {
      console.error(`[chopstack] Execution failed: ${result.error}`);
      return 1;
    }

    console.log(`[chopstack] Successfully executed ${result.tasksCompleted} tasks`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[chopstack] Error: ${message}`);
    return 1;
  }
}
