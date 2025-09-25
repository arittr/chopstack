import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { execa } from 'execa';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { type StreamingUpdate, TaskOrchestrator } from './orchestrator';

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

const CreateWorktreeSchema = z.object({
  taskId: z.string().describe('Task ID for naming the worktree'),
  branchName: z.string().describe('Name of the branch to create'),
  baseRef: z.string().describe('Git reference to branch from'),
});

const CreateStackBranchSchema = z.object({
  branchName: z.string().describe('Name of the branch to create'),
  parentBranch: z.string().optional().describe('Parent branch in the stack'),
});

const MergeParallelWorkSchema = z.object({
  branches: z.array(z.string()).describe('Branches to merge'),
  targetBranch: z.string().describe('Target branch to merge into'),
  strategy: z.enum(['merge', 'rebase']).describe('Merge strategy to use'),
});

type Worktree = {
  branch?: string;
  head?: string;
  path: string;
};

// Git workflow manager
class GitWorkflowManager {
  async createWorktree(
    params: z.infer<typeof CreateWorktreeSchema>,
  ): Promise<{ branchName: string; status: string; taskId: string; worktreePath: string }> {
    const { taskId, branchName, baseRef } = params;
    const worktreePath = path.join('.chopstack/shadows', taskId);

    // Ensure shadows directory exists
    await fs.mkdir('.chopstack/shadows', { recursive: true });

    // Remove existing worktree if it exists
    try {
      await execa('git', ['worktree', 'remove', worktreePath, '--force']);
    } catch {
      // Ignore errors if worktree doesn't exist
    }

    // Create worktree with new branch
    await execa('git', ['worktree', 'add', '-b', branchName, worktreePath, baseRef]);

    return {
      taskId,
      branchName,
      worktreePath,
      status: 'created',
    };
  }

  async createStackBranch(params: z.infer<typeof CreateStackBranchSchema>): Promise<{
    branchName: string;
    parentBranch: string | undefined;
    status: string;
    tool: string;
  }> {
    const { branchName, parentBranch } = params;

    // Use git-spice if available, otherwise fall back to git
    try {
      // Check if git-spice is available
      await execa('which', ['gs']);

      await (parentBranch !== undefined && parentBranch !== ''
        ? execa('gs', ['branch', 'create', branchName, '--parent', parentBranch])
        : execa('gs', ['branch', 'create', branchName]));
      return {
        branchName,
        parentBranch,
        status: 'created',
        tool: 'git-spice',
      };
    } catch {
      // Fall back to regular git
      const base = parentBranch ?? 'HEAD';
      await execa('git', ['checkout', '-b', branchName, base]);
      return {
        branchName,
        parentBranch,
        status: 'created',
        tool: 'git',
      };
    }
  }

  async mergeParallelWork(params: z.infer<typeof MergeParallelWorkSchema>): Promise<{
    results: Array<{ branch: string; error?: string; status: string }>;
    strategy: 'merge' | 'rebase';
    targetBranch: string;
  }> {
    const { branches, targetBranch, strategy } = params;

    // Checkout target branch
    await execa('git', ['checkout', targetBranch]);

    const results: Array<{ branch: string; error?: string; status: string }> = [];
    for (const branch of branches) {
      try {
        await (strategy === 'merge'
          ? execa('git', ['merge', branch, '--no-ff', '-m', `Merge ${branch} into ${targetBranch}`])
          : execa('git', ['rebase', branch]));
        results.push({
          branch,
          status: 'merged',
        });
      } catch (error) {
        results.push({
          branch,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      targetBranch,
      strategy,
      results,
    };
  }

  async cleanupWorktree(
    taskId: string,
  ): Promise<{ error?: string; status: string; taskId: string }> {
    const worktreePath = path.join('.chopstack/shadows', taskId);

    try {
      // Remove worktree
      await execa('git', ['worktree', 'remove', worktreePath, '--force']);
      return {
        taskId,
        status: 'cleaned',
      };
    } catch (error) {
      return {
        taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listWorktrees(): Promise<Worktree[]> {
    try {
      const { stdout } = await execa('git', ['worktree', 'list', '--porcelain']);
      const worktrees: Worktree[] = [];
      const lines = stdout.split('\n');

      let currentWorktree: Partial<Worktree> = {};
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path !== undefined) {
            worktrees.push(currentWorktree as Worktree);
          }
          currentWorktree = { path: line.slice(9) };
        } else if (line.startsWith('HEAD ')) {
          currentWorktree.head = line.slice(5);
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.slice(7);
        }
      }

      if (currentWorktree.path !== undefined) {
        worktrees.push(currentWorktree as Worktree);
      }

      return worktrees;
    } catch {
      return [];
    }
  }
}

// Create MCP server
const mcp = new FastMCP({
  name: 'chopstack-orchestrator',
  version: '1.0.0',
});
const orchestrator = new TaskOrchestrator();
const gitWorkflow = new GitWorkflowManager();

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
        const result = await orchestrator.executeClaudeTask(
          taskId,
          title,
          prompt,
          files,
          actualWorkdir,
        );

        // TODO: Implement commit changes using VcsEngine
        // if (result.status === 'completed') {
        //   await vcsEngine.commitTaskChanges(...);
        // }

        return JSON.stringify(result);
      }
      // Serial execution in current directory
      const result = await orchestrator.executeClaudeTask(taskId, title, prompt, files);

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
  name: 'create_worktree',
  description: 'Create a git worktree for parallel task execution',
  parameters: CreateWorktreeSchema,
  execute: async (params) => {
    return JSON.stringify(await gitWorkflow.createWorktree(params));
  },
});

mcp.addTool({
  name: 'create_stack_branch',
  description: 'Create a new branch in the git-spice stack',
  parameters: CreateStackBranchSchema,
  execute: async (params) => {
    return JSON.stringify(await gitWorkflow.createStackBranch(params));
  },
});

mcp.addTool({
  name: 'merge_parallel_work',
  description: 'Merge completed parallel branches back to the stack',
  parameters: MergeParallelWorkSchema,
  execute: async (params) => {
    return JSON.stringify(await gitWorkflow.mergeParallelWork(params));
  },
});

mcp.addTool({
  name: 'cleanup_worktree',
  description: 'Clean up a git worktree after task completion',
  parameters: z.object({
    taskId: z.string().describe('Task ID of the worktree to clean up'),
  }),
  execute: async (params) => {
    return JSON.stringify(await gitWorkflow.cleanupWorktree(params.taskId));
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

mcp.addTool({
  name: 'list_worktrees',
  description: 'List all git worktrees in the repository',
  parameters: z.object({}),
  execute: async () => {
    const worktrees = await gitWorkflow.listWorktrees();
    return JSON.stringify({ worktrees });
  },
});

// Export the server as named export
export { mcp };
