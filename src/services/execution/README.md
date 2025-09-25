# Execution Services - Modular Architecture

This directory contains the modular execution services that complement the existing `ExecutionEngine` with a more flexible, service-oriented architecture.

## Architecture Overview

The new modular execution services are designed using clean architecture principles:

```
┌─────────────────────────────────────────┐
│               Entry Layer               │
│  (CLI Commands, MCP Server, Tests)     │
└─────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────┐
│            Service Layer                │
│  ExecutionOrchestrator                  │
│  ExecutionPlannerService                │
│  ExecutionMonitorService                │
└─────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────┐
│            Strategy Layer               │
│  SerialExecutionStrategy                │
│  ParallelExecutionStrategy              │
│  WorktreeExecutionStrategy              │
│  ExecutionStrategyFactory               │
└─────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────┐
│              Core Layer                 │
│  Execution Interfaces                  │
│  Mode Handlers                         │
│  Task Transitions                      │
└─────────────────────────────────────────┘
```

## Components

### 1. ExecutionOrchestrator
- **Purpose**: Main coordinator for task execution lifecycle
- **Responsibilities**:
  - Mode-specific execution delegation
  - Event emission and coordination
  - Error handling and recovery
- **Location**: `execution-orchestrator.ts`

### 2. ExecutionPlannerService
- **Purpose**: Advanced execution planning with strategy selection
- **Features**:
  - Automatic strategy selection based on plan characteristics
  - Resource requirement estimation
  - Execution layer optimization
  - Plan validation and conflict detection
- **Location**: `execution-planner-service.ts`

### 3. ExecutionMonitorService
- **Purpose**: Real-time execution monitoring and progress tracking
- **Features**:
  - Real-time progress updates with ETA calculations
  - Comprehensive metrics collection
  - Event-driven architecture with EventEmitter
  - Configurable progress display and logging levels
- **Location**: `execution-monitor-service.ts`

### 4. Execution Strategies

#### SerialExecutionStrategy
- Executes tasks one by one in dependency order
- Uses topological sorting for proper task sequencing
- Optimal for simple, sequential workflows

#### ParallelExecutionStrategy
- Executes tasks in parallel by dependency layers
- Maximizes concurrency while respecting dependencies
- Best for independent tasks that can run simultaneously

#### WorktreeExecutionStrategy
- Advanced git worktree-based execution for file conflict isolation
- Creates separate worktrees for conflicting tasks
- Integrates with VCS engine for automatic stack building
- Ideal for complex parallel execution with file conflicts

### 5. ExecutionStrategyFactory
- **Purpose**: Strategy selection and management
- **Features**:
  - Automatic strategy selection based on plan and context
  - Strategy registration and customization
  - Execution time estimation comparison
  - Fallback strategy selection

## Usage Examples

### Basic Usage with Existing ExecutionEngine

The modular services are designed to complement the existing `ExecutionEngine`:

```typescript
import {
  ExecutionPlannerServiceImpl,
  ExecutionMonitorServiceImpl,
  executionStrategyFactory
} from '@/services/execution';

// The existing ExecutionEngine can optionally use these services
const plannerService = new ExecutionPlannerServiceImpl();
const monitorService = new ExecutionMonitorServiceImpl();

// Get strategy recommendations
const estimates = executionStrategyFactory.getExecutionEstimates(plan, context);
console.log('Strategy options:', estimates);

// Enhanced planning
const executionPlan = await plannerService.createExecutionPlan(plan, options);
```

### Standalone Usage

For new implementations that want to use the modular architecture:

```typescript
import {
  ExecutionOrchestrator,
  ExecutionPlannerServiceImpl,
  ExecutionMonitorServiceImpl
} from '@/services/execution';

const orchestrator = new ExecutionOrchestrator({
  taskOrchestrator: new TaskOrchestrator(),
  vcsEngine: vcsEngineService,
});

const result = await orchestrator.execute(plan, options);
```

### Custom Strategy Registration

```typescript
import { executionStrategyFactory } from '@/services/execution';

// Register a custom strategy
class CustomExecutionStrategy extends BaseExecutionStrategy {
  constructor() {
    super('custom');
  }

  canHandle(plan: ExecutionPlan, context: ExecutionContext): boolean {
    return context.strategy === 'custom';
  }

  async execute(plan, context, dependencies) {
    // Custom execution logic
  }
}

executionStrategyFactory.registerStrategy(new CustomExecutionStrategy());
```

## Integration Path

The modular services are designed for gradual adoption:

1. **Phase 1**: Use services alongside existing ExecutionEngine for enhanced planning and monitoring
2. **Phase 2**: Migrate specific execution modes to use the modular orchestrator
3. **Phase 3**: Full migration to modular architecture (optional)

## Benefits

### Separation of Concerns
- Each service has a single, well-defined responsibility
- Clear interfaces between components
- Easy to test and maintain

### Extensibility
- Strategy pattern allows easy addition of new execution strategies
- Plugin architecture for custom monitoring and planning
- Event-driven design enables flexible integration

### Testability
- Dependency injection enables easy mocking
- Small, focused components are easier to unit test
- Clear contracts between services

### Performance
- Optimized execution strategies for different scenarios
- Resource-aware planning and estimation
- Real-time monitoring with configurable overhead

## Migration Notes

The existing `ExecutionEngine` remains fully functional. The modular services can be adopted incrementally:

- Start by using `ExecutionPlannerService` for enhanced planning
- Add `ExecutionMonitorService` for better progress tracking
- Experiment with different execution strategies via `ExecutionStrategyFactory`
- Consider full migration to `ExecutionOrchestrator` for new features

This approach ensures backward compatibility while providing a path to a more flexible and maintainable architecture.