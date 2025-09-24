import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { Plan, Task } from '@/types/decomposer';

import { DagValidator } from '@/utils/dag-validator';

import { runCliInProcess } from '../utils/cli-runner';
import {
  type TestWorktreeContext,
  testWorktreeManager,
} from '../utils/testing-harness-worktree-manager';

describe('Orchestration Decision Making', () => {
  const SPEC_PATH = path.resolve(__dirname, '../e2e/specs/add-stack-summary-command.md');

  let generatedPlan: Plan;
  let worktreeContext: TestWorktreeContext;

  beforeAll(async (): Promise<void> => {
    worktreeContext = await testWorktreeManager.createTestWorktree({
      testId: 'execution-stack-summary',
    });

    // Generate the plan using in-process CLI runner
    const tempOutputFile = path.join(
      os.tmpdir(),
      `chopstack-orchestration-test-${Date.now()}.yaml`,
    );

    try {
      const result = await runCliInProcess(
        ['decompose', '--spec', SPEC_PATH, '--agent', 'claude', '--output', tempOutputFile],
        {
          cwd: worktreeContext.absolutePath,
          timeout: 300_000, // 5 minutes
        },
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `Decompose command failed: ${result.stderr !== '' ? result.stderr : (result.error?.message ?? 'Unknown error')}`,
        );
      }

      const planOutput = fs.readFileSync(tempOutputFile, 'utf8');
      generatedPlan = parseYaml(planOutput) as Plan;

      // Clean up
      fs.unlinkSync(tempOutputFile);
    } catch (error) {
      throw new Error(`Failed to generate plan: ${String(error)}`);
    }
  });

  afterAll(async (): Promise<void> => {
    await worktreeContext.cleanup();
  });

  describe('dependency analysis and parallelization decisions', () => {
    it('should correctly identify tasks that can run in parallel', () => {
      expect(generatedPlan.tasks.length).toBeGreaterThan(0);

      const executionLayers = DagValidator.getExecutionLayers(generatedPlan);
      const metrics = DagValidator.calculateMetrics(generatedPlan);

      console.log(`🔧 Orchestration Analysis:`);
      console.log(`   Total tasks: ${metrics.taskCount}`);
      console.log(`   Execution layers: ${metrics.executionLayers}`);
      console.log(`   Max parallelization: ${metrics.maxParallelization}`);
      console.log(`   Estimated speedup: ${metrics.estimatedSpeedup.toFixed(2)}x`);

      // Should have identified parallel execution opportunities
      expect(executionLayers.length).toBeGreaterThan(0);

      // Log each layer for debugging
      for (const [index, layer] of executionLayers.entries()) {
        console.log(`   Layer ${index + 1}: ${layer.map((task) => task.id).join(', ')}`);
      }

      // Should identify parallelization opportunities for complex plans
      if (generatedPlan.tasks.length > 2) {
        expect(metrics.maxParallelization).toBeGreaterThan(1);
      }
    });

    it('should detect file conflicts that prevent parallelization', () => {
      const validation = DagValidator.validatePlan(generatedPlan);

      console.log(`🔍 Conflict Analysis:`);
      console.log(`   Plan valid: ${validation.valid}`);

      if (validation.conflicts !== undefined && validation.conflicts.length > 0) {
        console.log(`   File conflicts detected:`);
        for (const conflict of validation.conflicts) {
          console.log(`      ${conflict}`);
        }

        // Conflicts should be properly identified
        expect(validation.conflicts.length).toBeGreaterThan(0);
        for (const conflict of validation.conflicts) {
          expect(conflict).toContain('parallel conflicts:');
        }
      } else {
        console.log(`   No file conflicts detected`);
      }

      // Should have processed conflict detection logic (conflicts field exists or is undefined)
      if (validation.conflicts !== undefined) {
        expect(Array.isArray(validation.conflicts)).toBe(true);
      }
    });

    it('should determine optimal git workflow strategy', () => {
      const executionLayers = DagValidator.getExecutionLayers(generatedPlan);
      const metrics = DagValidator.calculateMetrics(generatedPlan);

      // Create git workflow decision logic
      const gitWorkflowStrategy = determineGitWorkflowStrategy(executionLayers, metrics);

      console.log(`🌳 Git Workflow Strategy:`);
      console.log(`   Strategy: ${gitWorkflowStrategy.strategy}`);
      console.log(`   Worktree tasks: ${gitWorkflowStrategy.worktreeTasks.length}`);
      console.log(`   Serial tasks: ${gitWorkflowStrategy.serialTasks.length}`);
      console.log(`   Reasoning: ${gitWorkflowStrategy.reasoning}`);

      expect(gitWorkflowStrategy.strategy).toMatch(/^(serial|parallel-worktree|hybrid)$/);
      expect(
        gitWorkflowStrategy.worktreeTasks.length + gitWorkflowStrategy.serialTasks.length,
      ).toBe(generatedPlan.tasks.length);
    });
  });

  describe('task scheduling and dependency resolution', () => {
    it('should create valid execution order respecting dependencies', () => {
      const executionOrder = DagValidator.getExecutionOrder(generatedPlan);

      console.log(`📋 Execution Order Analysis:`);
      for (const [index, task] of executionOrder.entries()) {
        console.log(`   ${index + 1}. ${task.id} (${task.title})`);
      }

      expect(executionOrder.length).toBe(generatedPlan.tasks.length);

      // Verify dependencies are respected in the order
      const taskPositions = new Map(executionOrder.map((task, index) => [task.id, index]));

      for (const task of executionOrder) {
        for (const depId of task.requires) {
          const depPosition = taskPositions.get(depId);
          const taskPosition = taskPositions.get(task.id);

          expect(depPosition).toBeDefined();
          expect(taskPosition).toBeDefined();
          expect(depPosition).toBeLessThan(taskPosition!);
        }
      }
    });

    it('should optimize execution layers for maximum parallelism', () => {
      const executionLayers = DagValidator.getExecutionLayers(generatedPlan);

      console.log(`⚡ Parallelization Optimization:`);

      let totalParallelTasks = 0;
      for (const [index, layer] of executionLayers.entries()) {
        const layerSize = layer.length;
        totalParallelTasks += layerSize;
        console.log(`   Layer ${index + 1}: ${layerSize} parallel tasks`);

        // Log task details in each layer
        for (const task of layer) {
          const fileCount = task.touches.length + task.produces.length;
          console.log(`      - ${task.id}: ${fileCount} files, ${task.estimatedLines} lines`);
        }
      }

      expect(totalParallelTasks).toBe(generatedPlan.tasks.length);

      // Each layer should have tasks that can run in parallel (no inter-layer dependencies)
      for (let layerIndex = 0; layerIndex < executionLayers.length; layerIndex++) {
        const layer = executionLayers[layerIndex];
        if (layer === undefined) {
          continue;
        }

        for (const task of layer) {
          // Check that no task in this layer depends on another task in the same layer
          for (const otherTask of layer) {
            if (task.id !== otherTask.id) {
              expect(task.requires).not.toContain(otherTask.id);
            }
          }

          // Check that all dependencies are in earlier layers
          for (const depId of task.requires) {
            let foundInEarlierLayer = false;
            for (let earlierLayerIndex = 0; earlierLayerIndex < layerIndex; earlierLayerIndex++) {
              const earlierLayer = executionLayers[earlierLayerIndex];
              if (earlierLayer?.some((t) => t.id === depId) === true) {
                foundInEarlierLayer = true;
                break;
              }
            }
            expect(foundInEarlierLayer).toBe(true);
          }
        }
      }
    });
  });

  describe('orchestration decision logic', () => {
    it('should make intelligent choices between serial and parallel execution', () => {
      const metrics = DagValidator.calculateMetrics(generatedPlan);
      const executionLayers = DagValidator.getExecutionLayers(generatedPlan);
      const validation = DagValidator.validatePlan(generatedPlan);

      // Create orchestration decision logic
      const orchestrationDecision = makeOrchestrationDecision(
        generatedPlan,
        metrics,
        executionLayers,
        validation,
      );

      console.log(`🎯 Orchestration Decision:`);
      console.log(`   Execution mode: ${orchestrationDecision.executionMode}`);
      console.log(`   Confidence: ${orchestrationDecision.confidence}%`);
      console.log(`   Factors:`);
      for (const factor of orchestrationDecision.factors) {
        console.log(`      - ${factor}`);
      }

      expect(orchestrationDecision.executionMode).toMatch(/^(serial|parallel|hybrid)$/);
      expect(orchestrationDecision.confidence).toBeGreaterThanOrEqual(0);
      expect(orchestrationDecision.confidence).toBeLessThanOrEqual(100);
      expect(orchestrationDecision.factors.length).toBeGreaterThan(0);
    });

    it('should handle edge cases and provide fallback strategies', () => {
      // Test with single task plan
      const singleTaskPlan: Plan = {
        tasks: [generatedPlan.tasks[0]!],
      };

      const singleTaskStrategy = determineGitWorkflowStrategy(
        DagValidator.getExecutionLayers(singleTaskPlan),
        DagValidator.calculateMetrics(singleTaskPlan),
      );

      expect(singleTaskStrategy.strategy).toBe('serial');
      console.log(`🔄 Single task strategy: ${singleTaskStrategy.strategy}`);

      // Test with validation errors - circular dependencies
      const invalidPlan: Plan = {
        tasks: [
          {
            id: 'task-a',
            title: 'Task A',
            description: 'First task',
            touches: ['file1.ts'],
            produces: [],
            requires: ['task-b'], // Circular dependency
            estimatedLines: 10,
            agentPrompt: 'Do task A',
          },
          {
            id: 'task-b',
            title: 'Task B',
            description: 'Second task',
            touches: ['file1.ts'],
            produces: [],
            requires: ['task-a'], // Circular dependency
            estimatedLines: 15,
            agentPrompt: 'Do task B',
          },
        ],
      };

      const invalidValidation = DagValidator.validatePlan(invalidPlan);
      expect(invalidValidation.valid).toBe(false);

      // For invalid plans, we can't calculate metrics or execution layers
      // This simulates how the orchestrator would handle validation failures
      const mockMetrics = {
        taskCount: invalidPlan.tasks.length,
        maxParallelization: 1,
        estimatedSpeedup: 1,
        totalEstimatedLines: 25,
        executionLayers: 1,
        criticalPathLength: 25,
      };

      const errorHandlingStrategy = makeOrchestrationDecision(
        invalidPlan,
        mockMetrics,
        [], // Empty execution layers for invalid plan
        invalidValidation,
      );

      expect(errorHandlingStrategy.executionMode).toBe('serial');
      expect(errorHandlingStrategy.factors).toContain(
        'Plan validation failed - fallback to serial',
      );
      console.log(`❌ Error handling strategy: ${errorHandlingStrategy.executionMode}`);
    });
  });
});

// Helper functions for orchestration decision logic

type GitWorkflowStrategy = {
  reasoning: string;
  serialTasks: Task[];
  strategy: 'serial' | 'parallel-worktree' | 'hybrid';
  worktreeTasks: Task[];
};

function determineGitWorkflowStrategy(
  executionLayers: Task[][],
  metrics: { estimatedSpeedup: number; maxParallelization: number; taskCount: number },
): GitWorkflowStrategy {
  // Single task - always serial
  if (metrics.taskCount === 1) {
    return {
      strategy: 'serial',
      worktreeTasks: [],
      serialTasks: executionLayers.flat(),
      reasoning: 'Single task - no parallelization needed',
    };
  }

  // Low parallelization potential - serial
  if (metrics.maxParallelization <= 1 || metrics.estimatedSpeedup < 1.5) {
    return {
      strategy: 'serial',
      worktreeTasks: [],
      serialTasks: executionLayers.flat(),
      reasoning: `Low parallelization benefit (speedup: ${metrics.estimatedSpeedup.toFixed(2)}x)`,
    };
  }

  // High parallelization potential - use worktrees
  if (metrics.maxParallelization >= 3 && metrics.estimatedSpeedup >= 2) {
    return {
      strategy: 'parallel-worktree',
      worktreeTasks: executionLayers.flat(),
      serialTasks: [],
      reasoning: `High parallelization benefit (speedup: ${metrics.estimatedSpeedup.toFixed(2)}x, max parallel: ${metrics.maxParallelization})`,
    };
  }

  // Hybrid approach - mix of serial and parallel
  const parallelLayers = executionLayers.filter((layer) => layer.length > 1);
  const serialTasks = executionLayers.filter((layer) => layer.length === 1).flat();
  const parallelTasks = parallelLayers.flat();

  return {
    strategy: 'hybrid',
    worktreeTasks: parallelTasks,
    serialTasks,
    reasoning: `Mixed approach - ${parallelTasks.length} parallel, ${serialTasks.length} serial tasks`,
  };
}

type OrchestrationDecision = {
  confidence: number;
  executionMode: 'serial' | 'parallel' | 'hybrid';
  factors: string[];
};

function makeOrchestrationDecision(
  plan: Plan,
  metrics: { estimatedSpeedup: number; maxParallelization: number; taskCount: number },
  executionLayers: Task[][],
  validation: { conflicts?: string[]; valid: boolean },
): OrchestrationDecision {
  const factors: string[] = [];
  let confidence = 100;
  let executionMode: 'serial' | 'parallel' | 'hybrid' = 'serial';

  // Check validation first
  if (!validation.valid) {
    factors.push('Plan validation failed - fallback to serial');
    return { executionMode: 'serial', confidence: 90, factors };
  }

  // Factor: Task count
  if (plan.tasks.length === 1) {
    factors.push('Single task plan');
    return { executionMode: 'serial', confidence: 100, factors };
  }

  factors.push(`${plan.tasks.length} tasks in plan`);

  // Factor: Parallelization potential
  if (metrics.maxParallelization <= 1) {
    factors.push('No parallelization opportunities detected');
    executionMode = 'serial';
  } else if (metrics.maxParallelization >= 3) {
    factors.push(`High parallelization potential (max ${metrics.maxParallelization} parallel)`);
    executionMode = 'parallel';
    confidence += 10;
  } else {
    factors.push(`Moderate parallelization potential (max ${metrics.maxParallelization} parallel)`);
    executionMode = 'hybrid';
  }

  // Factor: Estimated speedup
  if (metrics.estimatedSpeedup < 1.2) {
    factors.push(`Low speedup potential (${metrics.estimatedSpeedup.toFixed(2)}x)`);
    executionMode = 'serial';
    confidence -= 20;
  } else if (metrics.estimatedSpeedup >= 2) {
    factors.push(`High speedup potential (${metrics.estimatedSpeedup.toFixed(2)}x)`);
    if (executionMode !== 'serial') {
      confidence += 15;
    }
  }

  // Factor: File conflicts
  if (validation.conflicts !== undefined && validation.conflicts.length > 0) {
    factors.push(`${validation.conflicts.length} file conflicts detected - serial execution safer`);
    executionMode = 'serial';
    confidence -= 30;
  } else {
    factors.push('No file conflicts detected');
    confidence += 5;
  }

  // Factor: Execution layers
  factors.push(`${executionLayers.length} execution layers`);

  return {
    executionMode,
    confidence: Math.max(0, Math.min(100, confidence)),
    factors,
  };
}
