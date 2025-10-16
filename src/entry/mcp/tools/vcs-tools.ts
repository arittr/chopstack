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

import type { ConfigureVcsParams } from '@/entry/mcp/schemas/vcs-schemas';

import { ConfigureVcsSchema } from '@/entry/mcp/schemas/vcs-schemas';
import { VcsConfigServiceImpl } from '@/services/vcs/vcs-config';
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

  // TODO: Implement remaining tools (2-3, 2-4, 2-5)
  // - create_task_worktree
  // - integrate_task_stack
  // - cleanup_task_worktree
  // - list_task_worktrees
}
