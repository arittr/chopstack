import { TaskOrchestrator } from '../mcp/orchestrator';

import { ExecutionEngine } from './execution-engine';
import { ExecutionMonitor } from './execution-monitor';
import { ExecutionPlanner } from './execution-planner';
import { StateManager } from './state-manager';
import { VcsEngine } from './vcs-engine';

export { ExecutionEngine, type ExecutionEngineDependencies } from './execution-engine';
export { ExecutionMonitor } from './execution-monitor';
export { ExecutionPlanner } from './execution-planner';
export { StateManager } from './state-manager';
export { VcsEngine, type WorktreeExecutionContext } from './vcs-engine';

/**
 * Creates an ExecutionEngine with default dependencies
 */
export function createExecutionEngine(): ExecutionEngine {
  return new ExecutionEngine({
    planner: new ExecutionPlanner(),
    stateManager: new StateManager(),
    monitor: new ExecutionMonitor(),
    orchestrator: new TaskOrchestrator(),
    vcsEngine: new VcsEngine(),
  });
}
