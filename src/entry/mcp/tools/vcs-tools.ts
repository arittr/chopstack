/**
 * VCS MCP Tools
 *
 * Exposes VCS operations through MCP tools for VCS-agnostic worktree management.
 * These tools provide primitives for:
 * - VCS mode configuration and validation
 * - Isolated worktree creation for parallel task execution
 * - Stack integration with mode-specific behavior
 * - Worktree cleanup and lifecycle management
 *
 * Design: Thin adapters that delegate to VCS domain services.
 * No business logic - all operations handled by VcsConfigService and VcsEngineService.
 */

import type { FastMCP } from 'fastmcp';

import type {
  ConfigureVcsParams,
  CreateWorktreeParams,
  IntegrateStackParams,
} from '@/entry/mcp/schemas/vcs-schemas';

import {
  ConfigureVcsSchema,
  CreateWorktreeSchema,
  IntegrateStackSchema,
} from '@/entry/mcp/schemas/vcs-schemas';
import { VcsConfigServiceImpl } from '@/services/vcs/vcs-config';
import { VcsEngineServiceImpl } from '@/services/vcs/vcs-engine-service';
import { logger } from '@/utils/global-logger';

/**
 * Register all VCS MCP tools with FastMCP server
 *
 * Registers 5 VCS tools:
 * 1. configure_vcs - VCS mode configuration and validation
 * 2. create_task_worktree - Isolated worktree creation
 * 3. integrate_task_stack - Mode-specific stack integration
 * 4. cleanup_task_worktree - Worktree cleanup
 * 5. list_task_worktrees - List active worktrees
 *
 * @param mcp - FastMCP server instance
 */
export function registerVcsTools(mcp: FastMCP): void {
  // Tool 1: Configure VCS mode
  mcp.addTool({
    name: 'configure_vcs',
    description:
      'Configure VCS mode and verify tool availability. ' +
      'Validates that the requested VCS backend is installed and functional. ' +
      'If mode is omitted, defaults to merge-commit (requires only git). ' +
      'Explicit mode failures provide installation instructions.',
    parameters: ConfigureVcsSchema,
    execute: async (params: ConfigureVcsParams) => {
      try {
        logger.debug('configure_vcs called', { params });

        // Create VCS config service
        const configService = new VcsConfigServiceImpl();

        // Use explicit mode or default to merge-commit
        const mode = params.mode ?? 'merge-commit';
        const explicitMode = params.mode !== undefined;

        logger.info(`Configuring VCS mode: ${mode} (explicit: ${explicitMode})`);

        // Load configuration (merges CLI params with file config)
        await configService.loadConfig(params.workdir, mode);

        // Validate mode availability
        const validatedMode = await configService.validateMode(mode, explicitMode);

        // Create and initialize backend
        const backend = await configService.createBackend(validatedMode, params.workdir);
        const available = await backend.isAvailable();

        if (!available) {
          // If explicit mode requested, fail immediately with installation instructions
          if (explicitMode) {
            const error =
              `VCS tool for mode '${mode}' not found. ` +
              `Install required tools or change configuration.`;

            logger.error(error);

            return JSON.stringify({
              status: 'failed',
              mode,
              available: false,
              error,
            });
          }

          // Default mode (merge-commit) should always be available if git exists
          const gitError = 'Git not found. Please install git to use chopstack.';
          logger.error(gitError);

          return JSON.stringify({
            status: 'failed',
            error: gitError,
          });
        }

        // Initialize backend with working directory and trunk
        await backend.initialize(params.workdir, params.trunk);

        logger.info(`VCS backend initialized: ${validatedMode}`, {
          workdir: params.workdir,
          trunk: params.trunk,
        });

        // Determine capabilities based on mode
        const supportsStacking = ['git-spice', 'graphite', 'sapling', 'stacked'].includes(
          validatedMode,
        );
        const supportsParallel = true; // All modes support parallel execution

        return JSON.stringify({
          status: 'success',
          mode: validatedMode,
          available: true,
          capabilities: {
            supportsStacking,
            supportsParallel,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('configure_vcs failed', { error: errorMessage });

        return JSON.stringify({
          status: 'failed',
          error: errorMessage,
        });
      }
    },
  });

  // Tool 2: Create task worktree
  mcp.addTool({
    name: 'create_task_worktree',
    description:
      'Create isolated worktree for task execution with unique branch. ' +
      'Each task gets its own workspace, preventing file conflicts in parallel execution. ' +
      'Returns worktree path, branch name, and base reference for agent setup.',
    parameters: CreateWorktreeSchema,
    execute: async (params: CreateWorktreeParams) => {
      try {
        logger.debug('create_task_worktree called', { params });

        // Get working directory (default to current directory)
        const workdir = params.workdir ?? process.cwd();

        // Create VCS engine service with default configuration
        const vcsEngine = new VcsEngineServiceImpl({
          branchPrefix: 'task',
          shadowPath: '.chopstack/shadows',
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: 'fail',
          stackSubmission: {
            enabled: false,
            draft: false,
            autoMerge: false,
          },
        });
        await vcsEngine.initialize(workdir);

        logger.info(`Creating worktree for task ${params.taskId} from ${params.baseRef}`);

        // Create minimal execution task structure for VcsEngineService
        const executionTask = {
          id: params.taskId,
          name: params.task?.name ?? params.taskId,
          complexity: 'M' as const,
          description: params.task?.name ?? params.taskId,
          files: params.task?.files ?? [],
          acceptanceCriteria: [],
          dependencies: [],
          maxRetries: 0,
          retryCount: 0,
          state: 'pending' as const,
          stateHistory: [],
        };

        // Create worktree using VcsEngineService
        const worktrees = await vcsEngine.createWorktreesForTasks(
          [executionTask],
          params.baseRef,
          workdir,
        );

        if (worktrees.length === 0) {
          throw new Error('Failed to create worktree: no worktree context returned');
        }

        const worktree = worktrees[0];

        if (worktree === undefined) {
          throw new Error('Worktree context is undefined');
        }

        logger.info('Worktree created successfully', {
          taskId: worktree.taskId,
          branch: worktree.branchName,
          path: worktree.absolutePath,
        });

        return JSON.stringify({
          status: 'success',
          taskId: params.taskId,
          path: worktree.worktreePath,
          absolutePath: worktree.absolutePath,
          branch: worktree.branchName,
          baseRef: params.baseRef,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('create_task_worktree failed', { error: errorMessage, taskId: params.taskId });

        // Check for common error patterns and provide actionable guidance
        let actionableError = errorMessage;
        if (errorMessage.includes('already exists') || errorMessage.includes('collision')) {
          actionableError =
            `Branch name collision for task '${params.taskId}'. ` +
            `The branch or worktree already exists. ` +
            `Clean up with: git worktree remove .chopstack/shadows/${params.taskId} && ` +
            `git branch -d task/${params.taskId}`;
        }

        return JSON.stringify({
          status: 'failed',
          taskId: params.taskId,
          error: actionableError,
        });
      }
    },
  });

  // Tool 3: Integrate task stack
  mcp.addTool({
    name: 'integrate_task_stack',
    description:
      'Integrate completed task branches into stack based on VCS mode. ' +
      'Handles mode-specific stack integration (git-spice restacking, merge-commit merges). ' +
      'Detects and reports merge conflicts with resolution steps. ' +
      'Optionally submits stack for review (creates PRs).',
    parameters: IntegrateStackSchema,
    execute: async (params: IntegrateStackParams) => {
      try {
        logger.debug('integrate_task_stack called', { params });

        // Get working directory (default to current directory)
        const workdir = params.workdir ?? process.cwd();

        // Create VCS engine service with default configuration
        const vcsEngine = new VcsEngineServiceImpl({
          branchPrefix: 'task',
          shadowPath: '.chopstack/shadows',
          cleanupOnSuccess: true,
          cleanupOnFailure: false,
          conflictStrategy: 'fail',
          stackSubmission: {
            enabled: Boolean(params.submit),
            draft: false,
            autoMerge: false,
          },
        });
        await vcsEngine.initialize(workdir);

        logger.info(
          `Integrating ${params.tasks.length} task(s) into ${params.targetBranch}${params.submit ? ' with PR submission' : ''}`,
        );

        // Convert task parameters to ExecutionTask structure
        const executionTasks = params.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          complexity: 'M' as const,
          description: task.name,
          files: [],
          acceptanceCriteria: [],
          dependencies: [],
          maxRetries: 0,
          retryCount: 0,
          state: 'completed' as const,
          stateHistory: [],
          branchName: task.branchName ?? `task/${task.id}`,
        }));

        // Build stack from tasks
        const result = await vcsEngine.buildStackFromTasks(executionTasks, workdir, {
          parentRef: params.targetBranch,
          submitStack: params.submit,
        });

        // Extract branch names from result
        const branches = result.branches.map((b) => b.branchName);

        logger.info('Stack integration completed', {
          branches,
          prUrls: result.prUrls,
        });

        return JSON.stringify({
          status: 'success',
          branches,
          conflicts: [],
          prUrls: result.prUrls ?? [],
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('integrate_task_stack failed', { error: errorMessage, tasks: params.tasks });

        // Check for conflict indicators
        const isConflict =
          errorMessage.toLowerCase().includes('conflict') ||
          errorMessage.toLowerCase().includes('merge') ||
          errorMessage.toLowerCase().includes('rebase');

        if (isConflict) {
          // Provide conflict resolution guidance
          const conflicts = params.tasks.map((task) => ({
            taskId: task.id,
            files: [],
            resolution: `Fix conflicts in worktree .chopstack/shadows/${task.id}, then retry integration`,
          }));

          return JSON.stringify({
            status: 'failed',
            branches: params.tasks.map((t) => t.branchName ?? `task/${t.id}`),
            conflicts,
            error: `Integration failed due to merge conflicts in ${conflicts.length} task(s)`,
          });
        }

        // Generic error response
        return JSON.stringify({
          status: 'failed',
          branches: params.tasks.map((t) => t.branchName ?? `task/${t.id}`),
          conflicts: [],
          error: errorMessage,
        });
      }
    },
  });

  // TODO: Implement remaining tools (2-5)
  // - cleanup_task_worktree
  // - list_task_worktrees
}
