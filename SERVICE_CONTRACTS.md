# Service Contracts and Interfaces

This document describes the service contracts and interfaces that define the clean architecture boundaries in chopstack.

## Architecture Overview

chopstack follows clean architecture principles with four main layers:

1. **Core Layer** (`src/core/`): Domain interfaces and business rules
2. **Services Layer** (`src/services/`): Business logic implementations
3. **Adapters Layer** (`src/adapters/`): External system integrations
4. **Entry Layer** (`src/entry/`): Application entry points

## Core Domain Interfaces

### Agent Interfaces (`src/core/agents/interfaces.ts`)

#### `AgentProvider`
The core agent interface for task decomposition:
- `decompose()`: Converts specifications into structured task plans
- `getCapabilities()`: Returns agent capabilities (context length, models, features)
- `getType()`: Returns agent type identifier ('claude' | 'codex' | 'mock')
- `isAvailable()`: Checks if agent is available for use

#### `AgentService`
Service for orchestrating multiple agents:
- `createAgent()`: Creates agent instances by type
- `getAgentWithFallback()`: Gets agent with fallback support
- `getAvailableAgents()`: Lists available agent types
- `validateAgent()`: Validates agent capabilities

### Execution Interfaces (`src/core/execution/interfaces.ts`)

#### `TaskExecutor`
Core interface for executing individual tasks:
- `execute()`: Executes a task with given context, returns TaskResult

#### `PlanGenerator`
Interface for generating execution plans:
- `generate()`: Generates plan from specification and options

#### `PlanValidator`
Interface for validating execution plans:
- `validate()`: Validates plan structure and dependencies

#### Mode Handlers
Specialized handlers for different execution modes:
- `PlanModeHandler`: Handles plan generation mode
- `ExecuteModeHandler`: Handles full task execution
- `ValidateModeHandler`: Handles plan validation

### VCS Interfaces (`src/core/vcs/interfaces.ts`)

#### `VcsProvider`
Core VCS operations interface:
- `commit()`: Creates commits with specified messages and files
- `createBranch()`: Creates new branches from base references
- `getCurrentBranch()`: Gets current active branch
- `getStatus()`: Returns repository status (staged, unstaged, untracked files)
- `switchBranch()`: Switches to specified branch

#### `VcsBackend`
Interface for specific VCS implementations (git-spice, graphite):
- `initialize()`: Initializes backend in repository
- `isAvailable()`: Checks backend availability
- `getStackInfo()`: Gets current stack information
- `submitStack()`: Submits stack for review

#### `StackProvider`
Interface for managing PR stacks:
- `createStack()`: Creates new PR stack
- `addBranch()`: Adds branch to current stack
- `getStackInfo()`: Gets stack information and branch hierarchy
- `restack()`: Rebases stack branches
- `submitStack()`: Submits stack for review

#### `VcsEngineService`
High-level VCS orchestration service:
- `analyzeWorktreeNeeds()`: Analyzes parallelization requirements
- `createWorktreesForTasks()`: Creates worktrees for parallel execution
- `commitTaskChanges()`: Commits task changes with metadata
- `buildStackFromTasks()`: Builds git-spice stacks from completed tasks
- `cleanupWorktrees()`: Cleans up temporary worktrees

### Configuration Interfaces (`src/core/config/interfaces.ts`)

#### `ExecutionConfig`
Configuration for task execution:
- Execution mode, strategy, and error handling
- Working directory and timeout settings
- Dry-run and verbosity flags

#### `VcsConfig`
Configuration for VCS operations:
- Provider selection (git, git-spice, graphite)
- Branch naming and auto-commit settings
- PR templates and submission options

#### `AgentConfig`
Configuration for AI agents:
- API credentials and endpoints
- Model selection and parameters
- Timeout and token limits

## Service Layer Implementations

### Agent Services (`src/services/agents/`)

#### `AgentService`
Implementation of the core AgentService interface:
- Creates and manages agent instances
- Provides fallback logic for agent selection
- Validates agent capabilities and availability

### Execution Services (`src/services/execution/`)

#### `ExecutionPlannerService`
Service for creating execution plans:
- Generates task execution plans
- Handles retries and error recovery
- Coordinates with agent services

#### `ExecutionOrchestrator`
Main orchestration service:
- Coordinates task execution across multiple modes
- Manages execution context and state
- Handles parallel vs serial execution strategies

#### `ExecutionMonitorService`
Service for monitoring task execution:
- Tracks task progress and status
- Collects execution metrics
- Handles error reporting and logging

### Planning Services (`src/services/planning/`)

#### `PlanGenerator`
Service for generating task plans:
- Decomposes specifications into task DAGs
- Validates task dependencies
- Estimates task complexity and parallelization

#### `ExecutionPlanAnalyzer`
Service for analyzing execution plans:
- Analyzes plan quality and completeness
- Estimates execution time and resource usage
- Provides recommendations for optimization

#### `PlanOutputter`
Service for formatting and outputting plans:
- Formats plans for different output types (YAML, JSON)
- Generates human-readable summaries
- Handles plan serialization and deserialization

### VCS Services (`src/services/vcs/`)

#### `VcsEngineService`
Implementation of high-level VCS orchestration:
- Coordinates worktree creation and cleanup
- Manages task commit workflow
- Handles git-spice stack creation

#### `WorktreeService`
Service for managing git worktrees:
- Creates isolated worktrees for parallel tasks
- Manages worktree lifecycle
- Handles worktree cleanup and synchronization

#### `CommitService`
Service for handling commits:
- Generates AI-powered commit messages
- Handles commit creation with metadata
- Manages commit signing and verification

#### `StackBuildService`
Service for building PR stacks:
- Creates git-spice stacks from task results
- Handles branch dependencies and ordering
- Manages stack submission and PR creation

## Adapter Layer

### Agent Adapters (`src/adapters/agents/`)

Concrete implementations of agent providers:
- **Claude**: Integration with Claude API
- **Codex**: Integration with OpenAI Codex
- **Mock**: Testing implementation for development

### VCS Adapters (`src/adapters/vcs/`)

Concrete implementations of VCS providers:
- **GitWrapper**: Standard git operations
- **GitSpiceBackend**: git-spice integration
- **CommitMessageGenerator**: AI-powered commit message generation

## Contract Validation

### Type Safety
- All interfaces use strict TypeScript types
- Zod schemas validate runtime data
- Comprehensive type guards prevent runtime errors

### Testing Strategy
- Unit tests validate interface contracts
- Integration tests verify service interactions
- E2E tests ensure complete workflow functionality

### Error Handling
- Standardized error types across all services
- Consistent error propagation patterns
- Graceful degradation for external service failures

## Usage Patterns

### Dependency Injection
Services are wired through the dependency injection container:
```typescript
// Core interfaces define contracts
import type { AgentService } from '@/core/agents/interfaces';

// Services implement the contracts
import { AgentServiceImpl } from '@/services/agents/agent-service';

// Container wires dependencies
container.register('AgentService', AgentServiceImpl);
```

### Service Composition
Services compose through well-defined interfaces:
```typescript
class ExecutionOrchestrator {
  constructor(
    private agentService: AgentService,
    private vcsEngine: VcsEngineService,
    private planGenerator: PlanGenerator
  ) {}
}
```

### Error Boundaries
Each service layer handles its specific error types:
- **Core**: Domain validation errors
- **Services**: Business logic errors
- **Adapters**: External system errors
- **Entry**: User input and presentation errors

This architecture ensures clean separation of concerns, testability, and maintainability while allowing for easy extension and modification of individual components.