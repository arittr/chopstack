# Audit: MCP Server Architecture

**Date**: 2025-10-16
**Purpose**: Understand MCP server structure for adding VCS tools
**Related Spec**: simplify-arch-from-cli

## Audit Scope
Analysis of MCP server implementation and tool patterns to inform the design of new VCS tools that will expose the VcsEngineService to Claude through MCP.

## Methodology
- Code review of `src/entry/mcp/`
- FastMCP usage analysis (v3.16.0)
- Tool registration pattern review
- Zod schema assessment
- VCS service API surface analysis

## Findings

### Summary
- **Existing Tools**: 11 tools registered
- **Tool Categories**:
  - Task Execution (2): `execute_task`, `execute_parallel_tasks`
  - Git Workflow (3): `create_worktree`, `create_stack_branch`, `merge_parallel_work`
  - Worktree Management (2): `cleanup_worktree`, `list_worktrees`
  - Task Monitoring (4): `list_running_tasks`, `stop_task`, `get_task_output`, `get_task_updates`
- **Schema Patterns**: Zod schemas with `.describe()` for parameter documentation
- **Server Configuration**: FastMCP v3.16.0 with named export pattern

### Detailed Findings

#### MCP Server Structure

**Entry Point**: `src/index.ts` → `src/entry/mcp/server.ts`
- Default export from `src/index.ts` (FastMCP requirement)
- Named export `mcp` from server.ts
- Server instantiation: `new FastMCP({ name, version })`

**Tool Registration Pattern**:
```typescript
mcp.addTool({
  name: 'tool_name',
  description: 'Human-readable description',
  parameters: ZodSchema,
  execute: async (params) => {
    // Implementation
    return JSON.stringify(result);
  },
});
```

**Key Observations**:
- All tools return JSON.stringify() strings
- All execute functions are async (FastMCP requirement)
- Empty parameter schemas use `z.object({})`
- Parameters use Zod `.describe()` for MCP client documentation

**Error Handling**:
- Try-catch blocks with structured error responses
- Return JSON with status/error fields
- No uncaught exception propagation

**Session Management**:
- Global singletons: TaskOrchestrator, GitWorkflowManager
- State management via Map for task updates
- Event listener setup at module level

#### Existing Tools Analysis

**Tool: execute_task**
- **Purpose**: Execute a single task with optional git workflow
- **Parameters**: taskId, title, prompt, files, strategy (serial/parallel), workdir (optional)
- **Schema**: ExecuteTaskSchema (defined inline in server.ts, also in schemas/execute-task.ts)
- **Implementation**: Calls TaskOrchestrator.executeTask(), commits for serial strategy
- **Pattern**: Business logic in orchestrator, tool acts as adapter
- **Note**: Has TODO comments for VcsEngine integration

**Tool: execute_parallel_tasks**
- **Purpose**: Execute multiple tasks in parallel using worktrees
- **Parameters**: tasks (array), baseRef
- **Schema**: ExecuteParallelTasksSchema
- **Implementation**: Currently disabled (stubbed with TODO)
- **Pattern**: Placeholder for future VcsEngine integration

**Tool: create_worktree**
- **Purpose**: Create a git worktree for parallel task execution
- **Parameters**: taskId, branchName, baseRef
- **Schema**: CreateWorktreeSchema
- **Implementation**: GitWorkflowManager.createWorktree()
- **Pattern**: Thin wrapper around workflow manager

**Tool: create_stack_branch**
- **Purpose**: Create a new branch in git-spice stack
- **Parameters**: branchName, parentBranch (optional)
- **Schema**: CreateStackBranchSchema
- **Implementation**: GitWorkflowManager.createStackBranch() with git-spice fallback
- **Pattern**: Tool selection logic (gs vs git)

**Tool: merge_parallel_work**
- **Purpose**: Merge completed parallel branches
- **Parameters**: branches (array), targetBranch, strategy (merge/rebase)
- **Schema**: MergeParallelWorkSchema
- **Implementation**: GitWorkflowManager.mergeParallelWork()
- **Pattern**: Loop with error collection

**Tool: cleanup_worktree**
- **Purpose**: Clean up a worktree after task completion
- **Parameters**: taskId
- **Schema**: Inline `z.object({ taskId: z.string() })`
- **Implementation**: GitWorkflowManager.cleanupWorktree()
- **Pattern**: Simple parameter extraction

**Tool: list_worktrees**
- **Purpose**: List all git worktrees in repository
- **Parameters**: None (empty object)
- **Schema**: `z.object({})`
- **Implementation**: GitWorkflowManager.listWorktrees() with porcelain parsing
- **Pattern**: Read-only query

**Tool: list_running_tasks**
- **Purpose**: List all currently running tasks
- **Parameters**: None
- **Schema**: `z.object({})`
- **Implementation**: TaskOrchestrator queries
- **Pattern**: Read-only query with state aggregation

**Tool: stop_task**
- **Purpose**: Stop a running task
- **Parameters**: taskId
- **Schema**: Inline with taskId
- **Implementation**: TaskOrchestrator.stopTask()
- **Pattern**: Command with boolean result

**Tool: get_task_output**
- **Purpose**: Get output and status of a task
- **Parameters**: taskId
- **Schema**: Inline with taskId
- **Implementation**: TaskOrchestrator queries
- **Pattern**: Read-only query with aggregation

**Tool: get_task_updates**
- **Purpose**: Get streaming updates for a task
- **Parameters**: taskId, since (optional timestamp)
- **Schema**: Inline with optional since
- **Implementation**: Map lookup with filtering
- **Pattern**: Event log retrieval with temporal filtering

#### FastMCP Usage

**Framework Features Used**:
- FastMCP class instantiation
- `addTool()` method for tool registration
- Standard Schema support (Zod)
- Named export pattern for server instance

**Standard Schema Integration**: Yes
- All parameters use Zod schemas
- `.describe()` for parameter documentation visible to MCP clients
- Type inference via `z.infer<typeof Schema>`

**Tool Definition Pattern**:
```typescript
// Schema definition (can be inline or imported)
const MySchema = z.object({
  param1: z.string().describe('Description for Claude'),
  param2: z.number().optional().describe('Optional param'),
});

// Tool registration
mcp.addTool({
  name: 'tool_name',
  description: 'What this tool does',
  parameters: MySchema,
  execute: async (params) => {
    const result = await someService.operation(params);
    return JSON.stringify(result);
  },
});
```

#### Current Architecture Issues

**GitWorkflowManager Class**:
- Embedded in server.ts (lines 60-209)
- Direct `execa` calls to git commands
- Duplicates VCS logic that exists in `src/services/vcs/`
- No integration with VcsEngineService
- Examples:
  - `createWorktree()`: duplicates WorktreeService
  - `createStackBranch()`: duplicates StackBuildService.createStackBranch()
  - `listWorktrees()`: duplicates functionality

**Integration Gap**:
- MCP server has NO access to VcsEngineService
- TODOs in execute_task (lines 241, 246) acknowledge this
- execute_parallel_tasks is stubbed (line 277-283)

**Schema Organization**:
- Some schemas in `src/entry/mcp/schemas/`
- Some schemas inline in server.ts
- Inconsistent organization

## Analysis

### Tool Organization

**Current Organization**:
- All tools in single `server.ts` file (418 lines)
- Helper class (GitWorkflowManager) embedded in same file
- Schema files separate but not consistently used
- Global singletons instantiated at module level

**Best Practices Identified**:
1. **Thin MCP tool adapters**: Tools should call domain services, not implement business logic
2. **Consistent JSON responses**: All tools return JSON.stringify()
3. **Async requirement**: All execute functions must be async (FastMCP)
4. **Schema descriptions**: Use `.describe()` for MCP client documentation
5. **Error handling**: Structured error responses with status/error fields

**Suggested Structure for VCS Tools**:
```
src/entry/mcp/
├── server.ts                    # Main server setup, tool registration
├── tools/
│   ├── vcs-tools.ts            # VCS tool definitions
│   ├── task-tools.ts           # Task execution tools
│   └── monitoring-tools.ts     # Task monitoring tools
├── schemas/
│   ├── vcs-schemas.ts          # VCS parameter schemas
│   ├── task-schemas.ts         # Task parameter schemas
│   └── monitoring-schemas.ts   # Monitoring parameter schemas
└── README.md                    # MCP server documentation
```

### Parameter Validation

**Zod Schema Patterns Identified**:

1. **Simple required parameters**:
```typescript
z.object({
  taskId: z.string().describe('Unique task identifier'),
  branchName: z.string().describe('Name of the branch'),
})
```

2. **Optional parameters**:
```typescript
z.object({
  workdir: z.string().optional().describe('Working directory'),
  parentBranch: z.string().optional().describe('Parent branch in stack'),
})
```

3. **Enum parameters**:
```typescript
z.object({
  strategy: z.enum(['serial', 'parallel']).describe('Execution strategy'),
})
```

4. **Array parameters**:
```typescript
z.object({
  branches: z.array(z.string()).describe('Branches to merge'),
  files: z.array(z.string()).describe('Files to commit'),
})
```

5. **Nested objects**:
```typescript
z.object({
  tasks: z.array(ParallelTaskSchema).describe('Array of task objects'),
})
```

**Error Message Quality**:
- Zod provides automatic validation errors
- FastMCP handles schema validation before execute()
- Custom error messages in business logic use descriptive text

**Recommendations for VCS Tools**:
1. Use `.describe()` on every parameter
2. Use enums for constrained values (e.g., strategies)
3. Mark optional parameters with `.optional()`
4. Use nested schemas for complex parameters
5. Export schemas for reuse and testing

### Integration Points

**Where to Add VCS Tools**:

**Option 1: Inline in server.ts** (current pattern)
- Simple, everything in one place
- Gets unwieldy as tools grow
- Hard to test in isolation

**Option 2: Separate tools file** (recommended)
```typescript
// src/entry/mcp/tools/vcs-tools.ts
export function registerVcsTools(
  mcp: FastMCP,
  vcsEngine: VcsEngineService
): void {
  mcp.addTool({
    name: 'vcs_create_worktree',
    // ...
  });
  // ... more tools
}

// src/entry/mcp/server.ts
import { registerVcsTools } from './tools/vcs-tools';

const vcsEngine = new VcsEngineServiceImpl(config);
registerVcsTools(mcp, vcsEngine);
```

**How to Register Tools**:
1. Instantiate VcsEngineService in server.ts
2. Pass vcsEngine to tool registration functions
3. Tools call vcsEngine methods
4. Return JSON.stringify() responses

**Testing Approach**:
- **Unit tests**: Mock VcsEngineService, test MCP tool logic
- **Integration tests**: Real VcsEngineService, test end-to-end
- **Example pattern**:
```typescript
// vcs-tools.test.ts
const mockVcsEngine = {
  createWorktreesForTasks: vi.fn(),
  // ... other methods
};

const mcp = new FastMCP({ name: 'test' });
registerVcsTools(mcp, mockVcsEngine);

// Test tool behavior
```

## VCS Service API Surface Analysis

The VcsEngineService exposes 16 core methods that should be considered for MCP tool exposure:

### Worktree Operations
- `createWorktreesForTasks(tasks, baseRef, workdir)` - Create worktrees for parallel execution
- `cleanupWorktrees(contexts)` - Clean up worktrees after execution

### Stack Operations
- `initializeStackState(parentRef)` - Initialize stack state for incremental building
- `addTaskToStack(task, workdir, worktreeContext?)` - Add single task to stack incrementally
- `buildStackFromTasks(tasks, workdir, options?)` - Build git-spice stack from completed tasks
- `createStackBranch(branchName, parentBranch, workdir)` - Create stack branch with parent tracking
- `restack(workdir)` - Restack branches to maintain relationships

### Commit Operations
- `commitTaskChanges(task, context, options?)` - Commit changes for completed task
- `commitInStack(task, context, options?)` - Stack-aware commit using VCS backend

### Branch Operations
- `createBranchFromCommit(branchName, commitHash, parentBranch, workdir)` - Create branch from specific commit
- `trackBranch(branchName, parentBranch, workdir)` - Track existing branch with VCS backend
- `updateBranchToCommit(branchName, commitHash, workdir)` - Update branch to point to commit
- `fetchWorktreeCommits(tasks, workdir)` - Fetch commits from worktrees to main repo

### Analysis & Query
- `analyzeWorktreeNeeds(tasks, workdir)` - Analyze worktree requirements
- `initialize(workdir)` - Initialize VCS engine
- `getDefaultParentRef()` - Get configured default parent branch

### Recommended MCP Tool Mapping

**High Priority** (immediately useful for Claude):
1. `vcs_create_worktrees` → createWorktreesForTasks
2. `vcs_cleanup_worktrees` → cleanupWorktrees
3. `vcs_create_stack_branch` → createStackBranch
4. `vcs_commit_task` → commitTaskChanges
5. `vcs_build_stack` → buildStackFromTasks
6. `vcs_analyze_needs` → analyzeWorktreeNeeds

**Medium Priority** (useful for advanced workflows):
7. `vcs_add_task_to_stack` → addTaskToStack
8. `vcs_restack` → restack
9. `vcs_track_branch` → trackBranch
10. `vcs_fetch_worktree_commits` → fetchWorktreeCommits

**Low Priority** (internal/utility):
11. `vcs_initialize` → initialize
12. `vcs_get_default_parent` → getDefaultParentRef

## Recommendations

### 1. VCS Tool Structure

**Create**: `src/entry/mcp/tools/vcs-tools.ts`

This file should:
- Export a `registerVcsTools(mcp, vcsEngine)` function
- Define 6-10 essential VCS tools
- Use schemas from `src/entry/mcp/schemas/vcs-schemas.ts`
- Follow thin adapter pattern (no business logic)

**Example structure**:
```typescript
import type { FastMCP } from 'fastmcp';
import type { VcsEngineService } from '@/core/vcs/interfaces';
import {
  CreateWorktreesSchema,
  CleanupWorktreesSchema,
  CreateStackBranchSchema,
  CommitTaskSchema,
  BuildStackSchema,
} from '../schemas/vcs-schemas';

export function registerVcsTools(
  mcp: FastMCP,
  vcsEngine: VcsEngineService
): void {
  // Worktree operations
  mcp.addTool({
    name: 'vcs_create_worktrees',
    description: 'Create git worktrees for parallel task execution',
    parameters: CreateWorktreesSchema,
    execute: async (params) => {
      const contexts = await vcsEngine.createWorktreesForTasks(
        params.tasks,
        params.baseRef,
        params.workdir
      );
      return JSON.stringify({ contexts });
    },
  });

  mcp.addTool({
    name: 'vcs_cleanup_worktrees',
    description: 'Clean up worktrees after task completion',
    parameters: CleanupWorktreesSchema,
    execute: async (params) => {
      await vcsEngine.cleanupWorktrees(params.contexts);
      return JSON.stringify({ status: 'cleaned', count: params.contexts.length });
    },
  });

  // Stack operations
  mcp.addTool({
    name: 'vcs_create_stack_branch',
    description: 'Create a stack branch with parent tracking using git-spice',
    parameters: CreateStackBranchSchema,
    execute: async (params) => {
      await vcsEngine.createStackBranch(
        params.branchName,
        params.parentBranch,
        params.workdir
      );
      return JSON.stringify({
        branchName: params.branchName,
        parentBranch: params.parentBranch,
        status: 'created',
      });
    },
  });

  mcp.addTool({
    name: 'vcs_build_stack',
    description: 'Build a git-spice stack from completed tasks',
    parameters: BuildStackSchema,
    execute: async (params) => {
      const result = await vcsEngine.buildStackFromTasks(
        params.tasks,
        params.workdir,
        {
          parentRef: params.parentRef,
          strategy: params.strategy,
          submitStack: params.submitStack,
        }
      );
      return JSON.stringify(result);
    },
  });

  // Commit operations
  mcp.addTool({
    name: 'vcs_commit_task',
    description: 'Commit changes for a completed task',
    parameters: CommitTaskSchema,
    execute: async (params) => {
      const commitHash = await vcsEngine.commitTaskChanges(
        params.task,
        params.context,
        {
          message: params.message,
          files: params.files,
        }
      );
      return JSON.stringify({
        taskId: params.task.id,
        commitHash,
        status: 'committed',
      });
    },
  });

  // Analysis
  mcp.addTool({
    name: 'vcs_analyze_needs',
    description: 'Analyze worktree requirements for parallel execution',
    parameters: z.object({
      tasks: z.array(ExecutionTaskSchema).describe('Tasks to analyze'),
      workdir: z.string().describe('Working directory'),
    }),
    execute: async (params) => {
      const analysis = await vcsEngine.analyzeWorktreeNeeds(
        params.tasks,
        params.workdir
      );
      return JSON.stringify(analysis);
    },
  });
}
```

### 2. Tool Naming Convention

Use `vcs_*` prefix for all VCS tools:
- `vcs_create_worktrees` (not `create_worktree`)
- `vcs_cleanup_worktrees` (not `cleanup_worktree`)
- `vcs_create_stack_branch` (replace `create_stack_branch`)
- `vcs_build_stack` (new)
- `vcs_commit_task` (new)
- `vcs_analyze_needs` (new)
- `vcs_restack` (new)
- `vcs_track_branch` (new)

Rationale:
- Clear namespace separation
- Avoids conflicts with existing tools
- Easy to discover in MCP client
- Consistent with MCP tool naming best practices

### 3. Schema Design

**Create**: `src/entry/mcp/schemas/vcs-schemas.ts`

Recommendations:
- Export all VCS-related schemas from one file
- Use descriptive `.describe()` on every field
- Share common sub-schemas (e.g., ExecutionTaskSchema, WorktreeContextSchema)
- Export TypeScript types via `z.infer<typeof Schema>`

**Example**:
```typescript
import { z } from 'zod';

// Common schemas
export const ExecutionTaskSchema = z.object({
  id: z.string().describe('Unique task identifier'),
  title: z.string().describe('Task title'),
  description: z.string().describe('Task description'),
  files: z.array(z.string()).describe('Files modified by task'),
  dependencies: z.array(z.string()).optional().describe('Task dependencies'),
  branchName: z.string().optional().describe('Branch name for task'),
  commitHash: z.string().optional().describe('Commit hash after completion'),
});

export const WorktreeContextSchema = z.object({
  taskId: z.string().describe('Task identifier'),
  branchName: z.string().describe('Branch name'),
  worktreePath: z.string().describe('Worktree path'),
  absolutePath: z.string().describe('Absolute worktree path'),
  baseRef: z.string().describe('Base git reference'),
  created: z.string().describe('ISO timestamp of creation'),
});

// Tool-specific schemas
export const CreateWorktreesSchema = z.object({
  tasks: z.array(ExecutionTaskSchema).describe('Tasks to create worktrees for'),
  baseRef: z.string().describe('Git reference to branch from (e.g., main, HEAD)'),
  workdir: z.string().describe('Working directory path'),
});

export const CleanupWorktreesSchema = z.object({
  contexts: z.array(WorktreeContextSchema).describe('Worktree contexts to clean up'),
});

export const CreateStackBranchSchema = z.object({
  branchName: z.string().describe('Name of the branch to create'),
  parentBranch: z.string().describe('Parent branch in the stack'),
  workdir: z.string().describe('Working directory path'),
});

export const CommitTaskSchema = z.object({
  task: ExecutionTaskSchema.describe('Task to commit'),
  context: WorktreeContextSchema.describe('Worktree context'),
  message: z.string().optional().describe('Commit message (auto-generated if omitted)'),
  files: z.array(z.string()).optional().describe('Specific files to commit'),
});

export const BuildStackSchema = z.object({
  tasks: z.array(ExecutionTaskSchema).describe('Completed tasks to build stack from'),
  workdir: z.string().describe('Working directory path'),
  parentRef: z.string().optional().describe('Parent branch (default: main)'),
  strategy: z.enum(['dependency-order', 'complexity-first', 'file-impact'])
    .optional()
    .describe('Stack building strategy'),
  submitStack: z.boolean().optional().describe('Submit stack for review (create PRs)'),
});

// Export types
export type CreateWorktreesParams = z.infer<typeof CreateWorktreesSchema>;
export type CleanupWorktreesParams = z.infer<typeof CleanupWorktreesSchema>;
export type CreateStackBranchParams = z.infer<typeof CreateStackBranchSchema>;
export type CommitTaskParams = z.infer<typeof CommitTaskSchema>;
export type BuildStackParams = z.infer<typeof BuildStackSchema>;
```

### 4. Error Handling

Follow existing pattern:
```typescript
execute: async (params) => {
  try {
    const result = await vcsEngine.someOperation(params);
    return JSON.stringify({
      status: 'success',
      ...result,
    });
  } catch (error) {
    return JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

**Additional recommendations**:
- Include error codes for programmatic handling
- Log errors using the service logger
- Return partial results when possible (e.g., some worktrees succeeded)

### 5. Testing Strategy

**Unit Tests** (`src/entry/mcp/tools/__tests__/vcs-tools.test.ts`):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { FastMCP } from 'fastmcp';
import { registerVcsTools } from '../vcs-tools';

describe('VCS MCP Tools', () => {
  const mockVcsEngine = {
    createWorktreesForTasks: vi.fn(),
    cleanupWorktrees: vi.fn(),
    createStackBranch: vi.fn(),
    commitTaskChanges: vi.fn(),
    buildStackFromTasks: vi.fn(),
    analyzeWorktreeNeeds: vi.fn(),
  };

  it('should register all VCS tools', () => {
    const mcp = new FastMCP({ name: 'test' });
    registerVcsTools(mcp, mockVcsEngine as any);

    // Verify tools are registered
    // FastMCP should expose registered tools for inspection
  });

  it('should call vcsEngine.createWorktreesForTasks with correct params', async () => {
    const mcp = new FastMCP({ name: 'test' });
    registerVcsTools(mcp, mockVcsEngine as any);

    mockVcsEngine.createWorktreesForTasks.mockResolvedValue([
      { taskId: 'task-1', worktreePath: '.chopstack/shadows/task-1' },
    ]);

    // Call tool through MCP
    // const result = await mcp.tools.vcs_create_worktrees.execute(...);

    expect(mockVcsEngine.createWorktreesForTasks).toHaveBeenCalledWith(
      expect.any(Array),
      'main',
      '/path/to/workdir'
    );
  });

  // ... more tests
});
```

**Integration Tests** (`src/entry/mcp/tools/__tests__/vcs-tools.integration.test.ts`):
- Use real VcsEngineService with real git operations
- Use test infrastructure (GitTestEnvironment)
- Verify end-to-end behavior

### 6. Migration Plan

**Phase 1: Create VCS Tools (1 task, M complexity)**
- Create `src/entry/mcp/schemas/vcs-schemas.ts`
- Create `src/entry/mcp/tools/vcs-tools.ts`
- Register 6 core VCS tools
- Add unit tests

**Phase 2: Integrate with Server (1 task, S complexity)**
- Instantiate VcsEngineService in `server.ts`
- Call `registerVcsTools(mcp, vcsEngine)`
- Remove GitWorkflowManager class
- Update existing tools to use vcsEngine

**Phase 3: Deprecate Old Tools (1 task, S complexity)**
- Mark old tools as deprecated in descriptions
- Update documentation
- Plan removal timeline

**Phase 4: Add Advanced Tools (1 task, M complexity)**
- Add medium-priority tools (restack, track_branch, etc.)
- Add integration tests
- Update MCP client documentation

## Task Implications

### Task Granularity
- **VCS Tool Creation**: M complexity (new file, 6 tools, schemas, tests)
- **Server Integration**: S complexity (instantiate service, call register function)
- **Old Tool Removal**: S complexity (delete code, update references)
- **Advanced Tools**: M complexity (4-5 additional tools with tests)

### Dependencies
1. **Prerequisite**: None - VcsEngineService is fully implemented
2. **Dependent**: MCP server integration (execute_task, execute_parallel_tasks)
3. **Dependent**: CLI simplification (removing duplicate VCS code)

### Testing Requirements
- **Unit tests**: Mock VcsEngineService, test tool registration and parameter mapping
- **Integration tests**: Real VcsEngineService, test end-to-end with git operations
- **No E2E tests needed**: MCP server testing is at integration level

### Risk Assessment
- **Low risk**: Well-defined interface (VcsEngineService exists)
- **Low risk**: Clear patterns from existing MCP tools
- **Medium risk**: Schema design must support ExecutionTask complexity
- **Low risk**: FastMCP handles validation automatically

## Next Steps

1. **Review this audit** with spec author
2. **Create tasks** in plan.yaml:
   - Task: Create VCS MCP schemas (`vcs-schemas.ts`)
   - Task: Create VCS MCP tools (`vcs-tools.ts`)
   - Task: Integrate VCS tools in MCP server
   - Task: Remove GitWorkflowManager from server.ts
   - Task: Add integration tests for VCS MCP tools
3. **Update spec** with tool naming and schema design decisions
4. **Proceed** with implementation following recommendations

## Conclusion

The MCP server architecture is well-structured and ready for VCS tool integration. The key insight is that **GitWorkflowManager duplicates VCS domain logic** and should be replaced with thin MCP tool adapters that call VcsEngineService methods.

**Key Success Factors**:
1. Follow thin adapter pattern (no business logic in MCP tools)
2. Use consistent `vcs_*` naming convention
3. Export comprehensive Zod schemas with descriptions
4. Maintain JSON.stringify() response pattern
5. Test with both unit and integration tests
6. Remove duplicate GitWorkflowManager code

This audit provides a clear roadmap for adding VCS tools to the MCP server with minimal risk and maximum consistency with existing patterns.
