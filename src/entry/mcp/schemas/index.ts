/**
 * MCP Schema Exports
 *
 * Central export point for all MCP tool schemas
 */

// Existing schemas
export * from './execute-task';

// Legacy git-workflow schemas (will be removed in Phase 2, Task 2-6)
// Not re-exported to avoid naming conflicts with new VCS schemas
// export * from './git-workflow';

// VCS schemas (new)
export * from './vcs-schemas';
