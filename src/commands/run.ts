import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { RunCommandOptions } from '../types/cli';
import type { Plan } from '../types/decomposer';

import { createDecomposerAgent } from '../agents';
import { ExecutionEngine } from '../engine/execution-engine';
import { DagValidator } from '../utils/dag-validator';
import { isNonEmptyString } from '../utils/guards';
import { YamlPlanParser } from '../utils/yaml-parser';

export async function runCommand(options: RunCommandOptions): Promise<number> {
  try {
    const cwd = options.workdir ?? process.cwd();
    let plan: Plan;

    // Determine if we need to decompose a spec or load an existing plan
    if (isNonEmptyString(options.spec)) {
      console.log(`📄 Reading spec from: ${resolve(options.spec)}`);

      // Read and decompose the specification
      const specContent = await readFile(resolve(options.spec), 'utf8');
      console.log(`📄 Spec content length: ${specContent.length} characters`);

      const agent = await createDecomposerAgent(options.agent ?? 'claude');
      console.log(`🤖 Using agent: ${options.agent ?? 'claude'}`);
      console.log('🔍 Analyzing codebase and generating plan...');

      plan = await agent.decompose(specContent, cwd);
      console.log(`📋 Generated plan with ${plan.tasks.length} tasks`);
    } else if (isNonEmptyString(options.plan)) {
      console.log(`📋 Loading plan from: ${resolve(options.plan)}`);

      // Load existing plan file
      const planContent = await readFile(resolve(options.plan), 'utf8');

      // Determine format and parse
      const isYaml = options.plan.endsWith('.yaml') || options.plan.endsWith('.yml');
      if (isYaml) {
        plan = YamlPlanParser.parseAndValidatePlan({
          content: planContent,
          source: 'yaml',
        });
      } else {
        // Assume JSON
        const planData: unknown = JSON.parse(planContent);
        plan = YamlPlanParser.parseAndValidatePlan({
          content: JSON.stringify(planData),
          source: 'json',
        });
      }
      console.log(`📋 Loaded plan with ${plan.tasks.length} tasks`);
    } else {
      throw new Error('Either --spec or --plan must be provided');
    }

    // Validate the plan
    const validation = DagValidator.validatePlan(plan);

    if (!validation.valid) {
      console.error('❌ Plan validation failed:');
      for (const error of validation.errors) {
        console.error(`  Error: ${error}`);
      }
      return 1;
    }

    // Execute the plan using the execution engine
    const engine = new ExecutionEngine();
    console.log(`🚀 Starting execution in ${options.mode} mode with ${options.strategy} strategy`);

    const result = await engine.execute(plan, {
      mode: options.mode,
      strategy: options.strategy,
      workdir: cwd,
      gitSpice: options.gitSpice,
      continueOnError: options.continueOnError,
      timeout: options.timeout,
      retryAttempts: options.retryAttempts,
      verbose: options.verbose,
    });

    if (result.success) {
      console.log(`✅ Execution completed successfully`);
      console.log(
        `📊 Tasks: ${result.tasksCompleted}/${result.tasksTotal} completed, ${result.tasksFailed} failed, ${result.tasksSkipped} skipped`,
      );

      if (
        options.gitSpice === true &&
        result.gitBranches !== undefined &&
        result.gitBranches.length > 0
      ) {
        console.log('🌿 Git-spice stack created:');
        for (const branch of result.gitBranches) {
          console.log(`  └─ ${branch}`);
        }
        if (result.stackUrl !== undefined) {
          console.log(`🔗 Stack URL: ${result.stackUrl}`);
        }
        console.log("💡 Run 'gs stack submit' to create PRs");
      }

      return 0;
    }

    console.error(`❌ Execution failed: ${result.error ?? 'Unknown error'}`);
    console.error(
      `📊 Tasks: ${result.tasksCompleted}/${result.tasksTotal} completed, ${result.tasksFailed} failed`,
    );
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Run command failed: ${message}`);
    return 1;
  }
}
