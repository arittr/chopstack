/**
 * VCS MCP Tool Schemas
 *
 * Comprehensive Zod schemas for all 5 VCS MCP tools with validation,
 * TSDoc comments, and examples.
 */

import { z } from 'zod';

/**
 * VCS mode enumeration
 *
 * Defines the version control workflow to use:
 * - git-spice: Stacking workflow with gs CLI (requires binary)
 * - merge-commit: Simple merge workflow (requires only git)
 * - graphite: Graphite stacking workflow with gt CLI (stubbed)
 * - sapling: Sapling workflow with sl CLI (stubbed)
 */
export const VcsModeEnum = z.enum(['git-spice', 'merge-commit', 'graphite', 'sapling']);

/**
 * Schema for configure_vcs tool
 *
 * Validates VCS mode configuration and initializes backend
 *
 * Example (explicit mode):
 * ```json
 * {
 *   "mode": "git-spice",
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 *
 * Example (default mode):
 * ```json
 * {
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 */
export const ConfigureVcsSchema = z
  .object({
    mode: VcsModeEnum.optional().describe(
      'VCS mode to use. If omitted, defaults to merge-commit (requires only git).',
    ),
    trunk: z
      .string()
      .optional()
      .describe('Main branch name (default: main). Used as base for stack building.'),
    workdir: z
      .string()
      .min(1, 'Working directory path cannot be empty')
      .describe('Absolute path to working directory (repository root)'),
  })
  .strict();

/**
 * Schema for configure_vcs tool response
 *
 * Example success response:
 * ```json
 * {
 *   "status": "success",
 *   "mode": "git-spice",
 *   "available": true,
 *   "capabilities": {
 *     "supportsStacking": true,
 *     "supportsParallel": true
 *   }
 * }
 * ```
 *
 * Example failure response:
 * ```json
 * {
 *   "status": "failed",
 *   "mode": "git-spice",
 *   "available": false,
 *   "error": "VCS tool 'gs' not found. Install git-spice: brew install abhinav/git-spice/git-spice"
 * }
 * ```
 */
export const ConfigureVcsResponseSchema = z.object({
  available: z.boolean().optional(),
  capabilities: z
    .object({
      supportsParallel: z.boolean(),
      supportsStacking: z.boolean(),
    })
    .optional(),
  error: z.string().optional(),
  mode: VcsModeEnum.optional(),
  status: z.enum(['success', 'failed']),
});

/**
 * Schema for create_task_worktree tool
 *
 * Creates isolated worktree for task execution with unique branch
 *
 * Example:
 * ```json
 * {
 *   "taskId": "task-1-implement-auth",
 *   "baseRef": "main",
 *   "workdir": "/Users/dev/project",
 *   "task": {
 *     "name": "Implement authentication",
 *     "files": ["src/auth/login.ts", "src/auth/session.ts"]
 *   }
 * }
 * ```
 */
export const CreateWorktreeSchema = z
  .object({
    baseRef: z
      .string()
      .min(1, 'Base reference cannot be empty')
      .describe('Git reference to branch from (e.g., main, HEAD, feature-branch)'),
    task: z
      .object({
        files: z.array(z.string()).optional().describe('List of files modified by task'),
        name: z.string().describe('Human-readable task name'),
      })
      .optional()
      .describe('Optional task metadata for context'),
    taskId: z
      .string()
      .min(1, 'Task ID cannot be empty')
      .regex(/^[\da-z-]+$/, 'Task ID must be lowercase alphanumeric with hyphens')
      .describe('Unique task identifier (used in branch name)'),
    workdir: z
      .string()
      .optional()
      .describe('Working directory path (defaults to current directory)'),
  })
  .strict();

/**
 * Schema for create_task_worktree tool response
 *
 * Example success response:
 * ```json
 * {
 *   "status": "success",
 *   "taskId": "task-1-implement-auth",
 *   "path": ".chopstack/shadows/task-1-implement-auth",
 *   "absolutePath": "/Users/dev/project/.chopstack/shadows/task-1-implement-auth",
 *   "branch": "task/task-1-implement-auth",
 *   "baseRef": "main"
 * }
 * ```
 *
 * Example failure response:
 * ```json
 * {
 *   "status": "failed",
 *   "taskId": "task-1-implement-auth",
 *   "error": "Branch 'task/task-1-implement-auth' already exists. Clean up with: git worktree remove .chopstack/shadows/task-1-implement-auth"
 * }
 * ```
 */
export const CreateWorktreeResponseSchema = z.object({
  absolutePath: z.string().optional().describe('Absolute worktree path'),
  baseRef: z.string().optional().describe('Base git reference'),
  branch: z.string().optional().describe('Created branch name'),
  error: z.string().optional(),
  path: z.string().optional().describe('Relative worktree path'),
  status: z.enum(['success', 'failed']),
  taskId: z.string(),
});

/**
 * Schema for integrate_task_stack tool
 *
 * Integrates completed task branches into stack based on VCS mode
 *
 * Example (sequential stack):
 * ```json
 * {
 *   "tasks": [
 *     {"id": "task-1", "name": "Setup types", "branchName": "task/task-1"}
 *   ],
 *   "targetBranch": "main",
 *   "submit": false,
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 *
 * Example (parallel stack):
 * ```json
 * {
 *   "tasks": [
 *     {"id": "task-2a", "name": "Component A", "branchName": "task/task-2a"},
 *     {"id": "task-2b", "name": "Component B", "branchName": "task/task-2b"}
 *   ],
 *   "targetBranch": "main",
 *   "submit": true,
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 */
export const IntegrateStackSchema = z
  .object({
    submit: z
      .boolean()
      .optional()
      .default(false)
      .describe('Submit stack for review (create PRs). Default: false'),
    targetBranch: z
      .string()
      .min(1, 'Target branch cannot be empty')
      .describe('Target branch for integration (usually main or trunk)'),
    tasks: z
      .array(
        z.object({
          branchName: z
            .string()
            .optional()
            .describe('Branch name (auto-derived from task ID if omitted)'),
          id: z.string().min(1, 'Task ID cannot be empty').describe('Task identifier'),
          name: z.string().min(1, 'Task name cannot be empty').describe('Human-readable task name'),
        }),
      )
      .min(1, 'Must integrate at least one task')
      .describe('Completed tasks to integrate into stack'),
    workdir: z
      .string()
      .optional()
      .describe('Working directory path (defaults to current directory)'),
  })
  .strict();

/**
 * Schema for integrate_task_stack tool response
 *
 * Example success response (no conflicts):
 * ```json
 * {
 *   "status": "success",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [],
 *   "prUrls": []
 * }
 * ```
 *
 * Example success response (with PRs):
 * ```json
 * {
 *   "status": "success",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [],
 *   "prUrls": ["https://github.com/org/repo/pull/123", "https://github.com/org/repo/pull/124"]
 * }
 * ```
 *
 * Example failure response (conflicts):
 * ```json
 * {
 *   "status": "failed",
 *   "branches": ["task/task-1", "task/task-2"],
 *   "conflicts": [
 *     {
 *       "taskId": "task-2",
 *       "files": ["src/auth/login.ts", "src/auth/session.ts"],
 *       "resolution": "Fix conflicts in worktree .chopstack/shadows/task-2, then retry"
 *     }
 *   ],
 *   "error": "Integration failed due to merge conflicts in 1 task(s)"
 * }
 * ```
 */
export const IntegrateStackResponseSchema = z.object({
  branches: z.array(z.string()).describe('Integrated branch names'),
  conflicts: z
    .array(
      z.object({
        files: z.array(z.string()),
        resolution: z.string(),
        taskId: z.string(),
      }),
    )
    .optional()
    .describe('Merge conflicts detected'),
  error: z.string().optional(),
  prUrls: z.array(z.string()).optional().describe('Created PR URLs (if submit=true)'),
  status: z.enum(['success', 'failed']),
});

/**
 * Schema for cleanup_task_worktree tool
 *
 * Removes worktree from filesystem and optionally deletes branch
 *
 * Example (delete worktree and branch):
 * ```json
 * {
 *   "taskId": "task-1-implement-auth",
 *   "keepBranch": false,
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 *
 * Example (delete worktree, keep branch):
 * ```json
 * {
 *   "taskId": "task-1-implement-auth",
 *   "keepBranch": true,
 *   "workdir": "/Users/dev/project"
 * }
 * ```
 */
export const CleanupWorktreeSchema = z
  .object({
    keepBranch: z
      .boolean()
      .optional()
      .default(false)
      .describe('Preserve branch after cleanup (useful for git-spice stacks). Default: false'),
    taskId: z
      .string()
      .min(1, 'Task ID cannot be empty')
      .describe('Task ID to cleanup (matches create_task_worktree taskId)'),
    workdir: z
      .string()
      .optional()
      .describe('Working directory path (defaults to current directory)'),
  })
  .strict();

/**
 * Schema for cleanup_task_worktree tool response
 *
 * Example success response:
 * ```json
 * {
 *   "status": "success",
 *   "taskId": "task-1-implement-auth",
 *   "cleaned": true,
 *   "branchDeleted": true
 * }
 * ```
 *
 * Example failure response:
 * ```json
 * {
 *   "status": "failed",
 *   "taskId": "task-1-implement-auth",
 *   "cleaned": false,
 *   "error": "Worktree not found: .chopstack/shadows/task-1-implement-auth"
 * }
 * ```
 */
export const CleanupWorktreeResponseSchema = z.object({
  branchDeleted: z.boolean().optional(),
  cleaned: z.boolean(),
  error: z.string().optional(),
  status: z.enum(['success', 'failed']),
  taskId: z.string(),
});

/**
 * Schema for list_task_worktrees tool
 *
 * Lists all active chopstack worktrees for repository
 *
 * Example:
 * ```json
 * {
 *   "workdir": "/Users/dev/project",
 *   "includeOrphaned": true
 * }
 * ```
 */
export const ListWorktreesSchema = z
  .object({
    includeOrphaned: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include orphaned worktrees from crashed runs. Default: false'),
    workdir: z
      .string()
      .optional()
      .describe('Working directory path (defaults to current directory)'),
  })
  .strict();

/**
 * Schema for list_task_worktrees tool response
 *
 * Example response:
 * ```json
 * {
 *   "status": "success",
 *   "worktrees": [
 *     {
 *       "taskId": "task-1-implement-auth",
 *       "path": ".chopstack/shadows/task-1-implement-auth",
 *       "absolutePath": "/Users/dev/project/.chopstack/shadows/task-1-implement-auth",
 *       "branch": "task/task-1-implement-auth",
 *       "baseRef": "main",
 *       "created": "2025-10-16T10:30:00Z",
 *       "status": "active"
 *     }
 *   ]
 * }
 * ```
 */
export const ListWorktreesResponseSchema = z.object({
  error: z.string().optional(),
  status: z.enum(['success', 'failed']),
  worktrees: z
    .array(
      z.object({
        absolutePath: z.string().describe('Absolute worktree path'),
        baseRef: z.string(),
        branch: z.string(),
        created: z.string().describe('ISO 8601 timestamp'),
        path: z.string().describe('Relative worktree path'),
        status: z.enum(['active', 'orphaned']).optional(),
        taskId: z.string(),
      }),
    )
    .optional(),
});

/**
 * Type inference helpers
 *
 * Usage:
 * ```typescript
 * import type { ConfigureVcsParams, CreateWorktreeResponse } from './vcs-schemas';
 *
 * function configureCli(params: ConfigureVcsParams) { ... }
 * ```
 */
export type CleanupWorktreeParams = z.infer<typeof CleanupWorktreeSchema>;
export type CleanupWorktreeResponse = z.infer<typeof CleanupWorktreeResponseSchema>;

export type ConfigureVcsParams = z.infer<typeof ConfigureVcsSchema>;
export type ConfigureVcsResponse = z.infer<typeof ConfigureVcsResponseSchema>;

export type CreateWorktreeParams = z.infer<typeof CreateWorktreeSchema>;
export type CreateWorktreeResponse = z.infer<typeof CreateWorktreeResponseSchema>;

export type IntegrateStackParams = z.infer<typeof IntegrateStackSchema>;
export type IntegrateStackResponse = z.infer<typeof IntegrateStackResponseSchema>;

export type ListWorktreesParams = z.infer<typeof ListWorktreesSchema>;
export type ListWorktreesResponse = z.infer<typeof ListWorktreesResponseSchema>;
