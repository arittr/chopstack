import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/entry/mcp/server.ts
import { execa } from "execa";
import { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  ClaudeCliTaskExecutionAdapter,
  TaskOrchestrator
} from "@/services/orchestration";

// src/entry/mcp/tools/vcs-tools.ts
import {
  CleanupWorktreeSchema,
  ConfigureVcsSchema,
  CreateWorktreeSchema,
  IntegrateStackSchema,
  ListWorktreesSchema
} from "@/entry/mcp/schemas/vcs-schemas";
import { VcsConfigServiceImpl } from "@/services/vcs/vcs-config";
import { VcsEngineServiceImpl } from "@/services/vcs/vcs-engine-service";
import { logger } from "@/utils/global-logger";
function registerVcsTools(mcp) {
  mcp.addTool({
    name: "configure_vcs",
    description: "Configure VCS mode and verify tool availability. " + "Validates that the requested VCS backend is installed and functional. " + "If mode is omitted, defaults to merge-commit (requires only git). " + "Explicit mode failures provide installation instructions.",
    parameters: ConfigureVcsSchema,
    execute: async (params) => {
      try {
        logger.debug("configure_vcs called", { params });
        const configService = new VcsConfigServiceImpl;
        const mode = params.mode ?? "merge-commit";
        const explicitMode = params.mode !== undefined;
        logger.info(`Configuring VCS mode: ${mode} (explicit: ${explicitMode})`);
        await configService.loadConfig(params.workdir, mode);
        const validatedMode = await configService.validateMode(mode, explicitMode);
        const backend = await configService.createBackend(validatedMode, params.workdir);
        const available = await backend.isAvailable();
        if (!available) {
          if (explicitMode) {
            const error = `VCS tool for mode '${mode}' not found. ` + `Install required tools or change configuration.`;
            logger.error(error);
            return JSON.stringify({
              status: "failed",
              mode,
              available: false,
              error
            });
          }
          const gitError = "Git not found. Please install git to use chopstack.";
          logger.error(gitError);
          return JSON.stringify({
            status: "failed",
            error: gitError
          });
        }
        await backend.initialize(params.workdir, params.trunk);
        logger.info(`VCS backend initialized: ${validatedMode}`, {
          workdir: params.workdir,
          trunk: params.trunk
        });
        const supportsStacking = ["git-spice", "graphite", "sapling", "stacked"].includes(validatedMode);
        const supportsParallel = true;
        return JSON.stringify({
          status: "success",
          mode: validatedMode,
          available: true,
          capabilities: {
            supportsStacking,
            supportsParallel
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("configure_vcs failed", { error: errorMessage });
        return JSON.stringify({
          status: "failed",
          error: errorMessage
        });
      }
    }
  });
  mcp.addTool({
    name: "create_task_worktree",
    description: "Create isolated worktree for task execution with unique branch. " + "Each task gets its own workspace, preventing file conflicts in parallel execution. " + "Returns worktree path, branch name, and base reference for agent setup.",
    parameters: CreateWorktreeSchema,
    execute: async (params) => {
      try {
        logger.debug("create_task_worktree called", { params });
        const workdir = params.workdir ?? process.cwd();
        const vcsEngine = new VcsEngineServiceImpl({
          branchPrefix: "task",
          shadowPath: ".chopstack/shadows",
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: "fail",
          stackSubmission: {
            enabled: false,
            draft: false,
            autoMerge: false
          }
        });
        await vcsEngine.initialize(workdir);
        logger.info(`Creating worktree for task ${params.taskId} from ${params.baseRef}`);
        const executionTask = {
          id: params.taskId,
          name: params.task?.name ?? params.taskId,
          complexity: "M",
          description: params.task?.name ?? params.taskId,
          files: params.task?.files ?? [],
          acceptanceCriteria: [],
          dependencies: [],
          maxRetries: 0,
          retryCount: 0,
          state: "pending",
          stateHistory: []
        };
        const worktrees = await vcsEngine.createWorktreesForTasks([executionTask], params.baseRef, workdir);
        if (worktrees.length === 0) {
          throw new Error("Failed to create worktree: no worktree context returned");
        }
        const worktree = worktrees[0];
        if (worktree === undefined) {
          throw new Error("Worktree context is undefined");
        }
        logger.info("Worktree created successfully", {
          taskId: worktree.taskId,
          branch: worktree.branchName,
          path: worktree.absolutePath
        });
        return JSON.stringify({
          status: "success",
          taskId: params.taskId,
          path: worktree.worktreePath,
          absolutePath: worktree.absolutePath,
          branch: worktree.branchName,
          baseRef: params.baseRef
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("create_task_worktree failed", { error: errorMessage, taskId: params.taskId });
        let actionableError = errorMessage;
        if (errorMessage.includes("already exists") || errorMessage.includes("collision")) {
          actionableError = `Branch name collision for task '${params.taskId}'. ` + `The branch or worktree already exists. ` + `Clean up with: git worktree remove .chopstack/shadows/${params.taskId} && ` + `git branch -d task/${params.taskId}`;
        }
        return JSON.stringify({
          status: "failed",
          taskId: params.taskId,
          error: actionableError
        });
      }
    }
  });
  mcp.addTool({
    name: "integrate_task_stack",
    description: "Integrate completed task branches into stack based on VCS mode. " + "Handles mode-specific stack integration (git-spice restacking, merge-commit merges). " + "Detects and reports merge conflicts with resolution steps. " + "Optionally submits stack for review (creates PRs).",
    parameters: IntegrateStackSchema,
    execute: async (params) => {
      try {
        logger.debug("integrate_task_stack called", { params });
        const workdir = params.workdir ?? process.cwd();
        const vcsEngine = new VcsEngineServiceImpl({
          branchPrefix: "task",
          shadowPath: ".chopstack/shadows",
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: "fail",
          stackSubmission: {
            enabled: Boolean(params.submit),
            draft: false,
            autoMerge: false
          }
        });
        await vcsEngine.initialize(workdir);
        logger.info(`Integrating ${params.tasks.length} task(s) into ${params.targetBranch}${params.submit ? " with PR submission" : ""}`);
        const executionTasks = params.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          complexity: "M",
          description: task.name,
          files: [],
          acceptanceCriteria: [],
          dependencies: [],
          maxRetries: 0,
          retryCount: 0,
          state: "completed",
          stateHistory: [],
          branchName: task.branchName ?? `task/${task.id}`
        }));
        const result = await vcsEngine.buildStackFromTasks(executionTasks, workdir, {
          parentRef: params.targetBranch,
          submitStack: params.submit
        });
        const branches = result.branches.map((b) => b.branchName);
        logger.info("Stack integration completed", {
          branches,
          prUrls: result.prUrls
        });
        return JSON.stringify({
          status: "success",
          branches,
          conflicts: [],
          prUrls: result.prUrls ?? []
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("integrate_task_stack failed", { error: errorMessage, tasks: params.tasks });
        const isConflict = errorMessage.toLowerCase().includes("conflict") || errorMessage.toLowerCase().includes("merge") || errorMessage.toLowerCase().includes("rebase");
        if (isConflict) {
          const conflicts = params.tasks.map((task) => ({
            taskId: task.id,
            files: [],
            resolution: `Fix conflicts in worktree .chopstack/shadows/${task.id}, then retry integration`
          }));
          return JSON.stringify({
            status: "failed",
            branches: params.tasks.map((t) => t.branchName ?? `task/${t.id}`),
            conflicts,
            error: `Integration failed due to merge conflicts in ${conflicts.length} task(s)`
          });
        }
        return JSON.stringify({
          status: "failed",
          branches: params.tasks.map((t) => t.branchName ?? `task/${t.id}`),
          conflicts: [],
          error: errorMessage
        });
      }
    }
  });
  mcp.addTool({
    name: "cleanup_task_worktree",
    description: "Remove worktree after task completion. " + "Cleans up filesystem worktree directory and optionally deletes the branch. " + "Use keepBranch=true for git-spice stacks where branches should persist after integration.",
    parameters: CleanupWorktreeSchema,
    execute: async (params) => {
      try {
        logger.debug("cleanup_task_worktree called", { params });
        const workdir = params.workdir ?? process.cwd();
        const vcsEngine = new VcsEngineServiceImpl({
          branchPrefix: "task",
          shadowPath: ".chopstack/shadows",
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: "fail",
          stackSubmission: {
            enabled: false,
            draft: false,
            autoMerge: false
          }
        });
        await vcsEngine.initialize(workdir);
        logger.info(`Cleaning up worktree for task ${params.taskId}`);
        const worktreeContext = {
          taskId: params.taskId,
          branchName: `task/${params.taskId}`,
          worktreePath: `.chopstack/shadows/${params.taskId}`,
          absolutePath: `${workdir}/.chopstack/shadows/${params.taskId}`,
          baseRef: "main",
          created: new Date
        };
        await vcsEngine.cleanupWorktrees([worktreeContext]);
        const branchDeleted = !params.keepBranch;
        logger.info("Worktree cleanup completed", {
          taskId: params.taskId,
          branchDeleted
        });
        return JSON.stringify({
          status: "success",
          taskId: params.taskId,
          cleaned: true,
          branchDeleted
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("cleanup_task_worktree failed", {
          error: errorMessage,
          taskId: params.taskId
        });
        return JSON.stringify({
          status: "failed",
          taskId: params.taskId,
          cleaned: false,
          error: errorMessage
        });
      }
    }
  });
  mcp.addTool({
    name: "list_task_worktrees",
    description: "List all active worktrees for repository. " + "Returns metadata for each worktree including task ID, paths, branch name, and status. " + "Use includeOrphaned=true to detect worktrees from crashed runs that need cleanup.",
    parameters: ListWorktreesSchema,
    execute: async (params) => {
      try {
        logger.debug("list_task_worktrees called", { params });
        const workdir = params.workdir ?? process.cwd();
        logger.info("Listing active worktrees");
        const { GitWrapper } = await import("@/adapters/vcs/git-wrapper");
        const git = new GitWrapper(workdir);
        const gitWorktrees = await git.listWorktrees();
        const chopstackWorktrees = gitWorktrees.filter((wt) => wt.path.includes(".chopstack/shadows"));
        const worktrees = chopstackWorktrees.map((wt) => {
          const pathParts = wt.path.split("/");
          const taskId = pathParts.at(-1) ?? "unknown";
          return {
            taskId,
            path: wt.path,
            absolutePath: wt.path,
            branch: wt.branch ?? "unknown",
            baseRef: wt.head ?? "unknown",
            created: new Date().toISOString(),
            status: "active"
          };
        });
        logger.info(`Found ${worktrees.length} active worktree(s)`);
        return JSON.stringify({
          status: "success",
          worktrees
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("list_task_worktrees failed", { error: errorMessage });
        return JSON.stringify({
          status: "failed",
          error: errorMessage
        });
      }
    }
  });
}

// src/entry/mcp/server.ts
var ExecuteTaskSchema = z.object({
  taskId: z.string().describe("Unique identifier for the task"),
  title: z.string().describe("Human-readable task title"),
  prompt: z.string().describe("The prompt to send to Claude Code"),
  files: z.array(z.string()).describe("List of files relevant to this task"),
  strategy: z.enum(["serial", "parallel"]).describe("Execution strategy"),
  workdir: z.string().optional().describe("Working directory for parallel tasks")
});
var ParallelTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  files: z.array(z.string())
});
var ExecuteParallelTasksSchema = z.object({
  tasks: z.array(ParallelTaskSchema).describe("Array of tasks to execute in parallel"),
  baseRef: z.string().describe("Git reference to branch from")
});
var mcp = new FastMCP({
  name: "chopstack-orchestrator",
  version: "1.0.0"
});
var orchestrator = new TaskOrchestrator(new ClaudeCliTaskExecutionAdapter);
registerVcsTools(mcp);
var taskUpdates = new Map;
orchestrator.on("taskUpdate", (update) => {
  if (!taskUpdates.has(update.taskId)) {
    taskUpdates.set(update.taskId, []);
  }
  taskUpdates.get(update.taskId)?.push(update);
});
mcp.addTool({
  name: "execute_task",
  description: "Execute a single task with git workflow (serial or parallel)",
  parameters: ExecuteTaskSchema,
  execute: async (params) => {
    const { taskId, title, prompt, files, strategy, workdir } = params;
    try {
      if (strategy === "parallel") {
        const actualWorkdir = workdir ?? process.cwd();
        const result2 = await orchestrator.executeTask(taskId, title, prompt, files, actualWorkdir);
        return JSON.stringify(result2);
      }
      const result = await orchestrator.executeTask(taskId, title, prompt, files);
      if (result.status === "completed") {
        await execa("git", ["add", "-A"]);
        await execa("git", ["commit", "-m", title]);
      }
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        taskId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
});
mcp.addTool({
  name: "execute_parallel_tasks",
  description: "Execute multiple tasks in parallel using git worktrees",
  parameters: ExecuteParallelTasksSchema,
  execute: async () => {
    return JSON.stringify({
      message: "Parallel execution temporarily disabled - needs VcsEngine integration"
    });
  }
});
mcp.addTool({
  name: "list_running_tasks",
  description: "List all currently running tasks",
  parameters: z.object({}),
  execute: async () => {
    await Promise.resolve();
    const runningTasks = orchestrator.getRunningTasks();
    const statuses = orchestrator.getAllTaskStatuses();
    return JSON.stringify({
      running: runningTasks,
      allStatuses: Object.fromEntries(statuses)
    });
  }
});
mcp.addTool({
  name: "stop_task",
  description: "Stop a running task",
  parameters: z.object({
    taskId: z.string().describe("Task ID to stop")
  }),
  execute: async (params) => {
    await Promise.resolve();
    const stopped = orchestrator.stopTask(params.taskId);
    return JSON.stringify({
      taskId: params.taskId,
      stopped
    });
  }
});
mcp.addTool({
  name: "get_task_output",
  description: "Get the output of a task",
  parameters: z.object({
    taskId: z.string().describe("Task ID to get output for")
  }),
  execute: async (params) => {
    await Promise.resolve();
    const output = orchestrator.getTaskOutput(params.taskId);
    const status = orchestrator.getTaskStatus(params.taskId);
    return JSON.stringify({
      taskId: params.taskId,
      status,
      output
    });
  }
});
mcp.addTool({
  name: "get_task_updates",
  description: "Get streaming updates for a task",
  parameters: z.object({
    taskId: z.string().describe("Task ID to get updates for"),
    since: z.number().optional().describe("Timestamp to get updates since (milliseconds)")
  }),
  execute: async (params) => {
    await Promise.resolve();
    const updates = taskUpdates.get(params.taskId) ?? [];
    if (params.since !== undefined && params.since !== 0) {
      const sinceDate = new Date(params.since);
      return JSON.stringify({
        taskId: params.taskId,
        updates: updates.filter((u) => u.timestamp > sinceDate)
      });
    }
    return JSON.stringify({
      taskId: params.taskId,
      updates
    });
  }
});
mcp.start({
  transportType: "stdio"
});

// src/index.ts
var src_default = mcp;
export {
  src_default as default
};

//# debugId=9462117F1AEA587464756E2164756E21
//# sourceMappingURL=index.js.map
