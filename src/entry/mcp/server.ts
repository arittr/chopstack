import { execa } from 'execa';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

import {
  ClaudeCliTaskExecutionAdapter,
  type StreamingUpdate,
  TaskOrchestrator,
} from '@/services/orchestration';

import { registerVcsTools } from './tools/vcs-tools';

// Schema definitions
const ExecuteTaskSchema = z.object({
  taskId: z.string().describe('Unique identifier for the task'),
  title: z.string().describe('Human-readable task title'),
  prompt: z.string().describe('The prompt to send to Claude Code'),
  files: z.array(z.string()).describe('List of files relevant to this task'),
  strategy: z.enum(['serial', 'parallel']).describe('Execution strategy'),
  workdir: z.string().optional().describe('Working directory for parallel tasks'),
});

const ParallelTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  files: z.array(z.string()),
});

const ExecuteParallelTasksSchema = z.object({
  tasks: z.array(ParallelTaskSchema).describe('Array of tasks to execute in parallel'),
  baseRef: z.string().describe('Git reference to branch from'),
});

// Create MCP server
const mcp = new FastMCP({
  name: 'chopstack-orchestrator',
  version: '1.0.0',
});
const orchestrator = new TaskOrchestrator(new ClaudeCliTaskExecutionAdapter());

// Register VCS tools (they create their own VcsEngineService instances as needed)
registerVcsTools(mcp);

// Store streaming updates for retrieval
const taskUpdates: Map<string, StreamingUpdate[]> = new Map();

// Listen to orchestrator events
orchestrator.on('taskUpdate', (update: StreamingUpdate) => {
  if (!taskUpdates.has(update.taskId)) {
    taskUpdates.set(update.taskId, []);
  }
  taskUpdates.get(update.taskId)?.push(update);
});

// Register tools
mcp.addTool({
  name: 'execute_task',
  description: 'Execute a single task with git workflow (serial or parallel)',
  parameters: ExecuteTaskSchema,
  execute: async (params) => {
    const { taskId, title, prompt, files, strategy, workdir } = params;

    try {
      if (strategy === 'parallel') {
        // For parallel, ensure we have a worktree
        // TODO: Update to use VcsEngine instead of removed orchestrator methods
        const actualWorkdir = workdir ?? process.cwd();
        const result = await orchestrator.executeTask(taskId, title, prompt, files, actualWorkdir);

        // TODO: Implement commit changes using VcsEngine
        // if (result.status === 'completed') {
        //   await vcsEngine.commitTaskChanges(...);
        // }

        return JSON.stringify(result);
      }
      // Serial execution in current directory
      const result = await orchestrator.executeTask(taskId, title, prompt, files);

      // Commit changes for serial execution
      if (result.status === 'completed') {
        await execa('git', ['add', '-A']);
        await execa('git', ['commit', '-m', title]);
      }

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

mcp.addTool({
  name: 'execute_parallel_tasks',
  description: 'Execute multiple tasks in parallel using git worktrees',
  parameters: ExecuteParallelTasksSchema,
  // eslint-disable-next-line @typescript-eslint/require-await -- temporary stub
  execute: async () => {
    // TODO: Update to use VcsEngine for parallel execution
    // For now, return a message indicating this is disabled
    return JSON.stringify({
      message: 'Parallel execution temporarily disabled - needs VcsEngine integration',
    });
  },
});

mcp.addTool({
  name: 'list_running_tasks',
  description: 'List all currently running tasks',
  parameters: z.object({}),
  execute: async () => {
    // MCP tools must be async
    await Promise.resolve();

    const runningTasks = orchestrator.getRunningTasks();
    const statuses = orchestrator.getAllTaskStatuses();

    return JSON.stringify({
      running: runningTasks,
      allStatuses: Object.fromEntries(statuses),
    });
  },
});

mcp.addTool({
  name: 'stop_task',
  description: 'Stop a running task',
  parameters: z.object({
    taskId: z.string().describe('Task ID to stop'),
  }),
  execute: async (params) => {
    // MCP tools must be async
    await Promise.resolve();
    const stopped = orchestrator.stopTask(params.taskId);
    return JSON.stringify({
      taskId: params.taskId,
      stopped,
    });
  },
});

mcp.addTool({
  name: 'get_task_output',
  description: 'Get the output of a task',
  parameters: z.object({
    taskId: z.string().describe('Task ID to get output for'),
  }),
  execute: async (params) => {
    // MCP tools must be async
    await Promise.resolve();
    const output = orchestrator.getTaskOutput(params.taskId);
    const status = orchestrator.getTaskStatus(params.taskId);

    return JSON.stringify({
      taskId: params.taskId,
      status,
      output,
    });
  },
});

mcp.addTool({
  name: 'get_task_updates',
  description: 'Get streaming updates for a task',
  parameters: z.object({
    taskId: z.string().describe('Task ID to get updates for'),
    since: z.number().optional().describe('Timestamp to get updates since (milliseconds)'),
  }),
  execute: async (params) => {
    // MCP tools must be async
    await Promise.resolve();

    const updates = taskUpdates.get(params.taskId) ?? [];

    if (params.since !== undefined && params.since !== 0) {
      const sinceDate = new Date(params.since);
      return JSON.stringify({
        taskId: params.taskId,
        updates: updates.filter((u) => u.timestamp > sinceDate),
      });
    }

    return JSON.stringify({
      taskId: params.taskId,
      updates,
    });
  },
});

// Start the MCP server with stdio transport
void mcp.start({
  transportType: 'stdio',
});

// Export the server as named export
export { mcp };
