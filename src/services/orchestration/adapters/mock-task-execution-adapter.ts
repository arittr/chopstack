import type {
  OrchestratorTaskResult,
  StreamingUpdate,
  TaskExecutionAdapter,
  TaskExecutionRequest,
} from '@/services/orchestration/types';

import { isNonNullish } from '@/validation/guards';

/**
 * Mock task execution adapter for testing and agents without execution capability
 */
export class MockTaskExecutionAdapter implements TaskExecutionAdapter {
  private readonly runningTasks = new Set<string>();
  private readonly taskOutputs = new Map<string, string[]>();

  async executeTask(
    request: TaskExecutionRequest,
    emitUpdate: (update: StreamingUpdate) => void,
  ): Promise<OrchestratorTaskResult> {
    const { taskId, title, prompt, files, mode } = request;

    this.runningTasks.add(taskId);
    this.taskOutputs.set(taskId, []);

    // Emit start status
    emitUpdate({
      taskId,
      type: 'status',
      data: 'running',
      timestamp: new Date(),
    });

    // Simulate some output
    const mockOutput = [
      `[MOCK] Executing task: ${title}`,
      `[MOCK] Mode: ${mode}`,
      `[MOCK] Files: ${files.join(', ')}`,
      `[MOCK] Prompt length: ${prompt.length} characters`,
    ];

    for (const line of mockOutput) {
      this.taskOutputs.get(taskId)?.push(line);
      emitUpdate({
        taskId,
        type: 'stdout',
        data: `${line}\n`,
        timestamp: new Date(),
      });

      // Simulate processing time
      await new Promise((resolve) => global.setTimeout(resolve, 100));
    }

    // Check if task was stopped
    if (!this.runningTasks.has(taskId)) {
      const output = this.taskOutputs.get(taskId)?.join('\n');
      return {
        taskId,
        status: 'stopped' as const,
        duration: 400,
        ...(isNonNullish(output) && { output }),
        mode,
      };
    }

    // Simulate successful completion
    const output = this.taskOutputs.get(taskId)?.join('\n');
    const result: OrchestratorTaskResult = {
      taskId,
      status: 'completed',
      duration: mockOutput.length * 100,
      ...(output !== undefined && { output }),
      mode,
    };

    // Emit completion status
    emitUpdate({
      taskId,
      type: 'status',
      data: 'completed',
      timestamp: new Date(),
    });

    this.runningTasks.delete(taskId);
    return result;
  }

  stopTask(taskId: string): boolean {
    if (this.runningTasks.has(taskId)) {
      this.runningTasks.delete(taskId);
      return true;
    }
    return false;
  }

  getAllTaskStatuses(): Map<string, 'running' | 'stopped' | 'completed' | 'failed'> {
    const statuses = new Map<string, 'running' | 'stopped' | 'completed' | 'failed'>();
    for (const taskId of this.runningTasks) {
      statuses.set(taskId, 'running');
    }
    return statuses;
  }
}
