import { z } from 'zod';

import type { PlanV2 } from './schemas-v2';

/**
 * Options for decompose operation
 *
 * @remarks
 * Configuration passed to the decompose method to control how
 * specifications are decomposed into tasks.
 *
 * @example
 * ```typescript
 * const options: DecomposeOptions = {
 *   specFile: 'dark-mode.md',
 *   agent: 'claude',
 *   maxRetries: 3,
 *   verbose: true,
 * };
 * ```
 */
export const decomposeOptionsSchema = z.object({
  specFile: z
    .string()
    .min(1, 'Specification file is required')
    .describe('Path to specification file'),
  agent: z
    .enum(['claude', 'codex', 'mock'])
    .default('claude')
    .describe('Agent to use for decomposition'),
  maxRetries: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe('Maximum number of retry attempts on failure'),
  verbose: z.boolean().default(false).describe('Enable verbose logging'),
  cwd: z.string().optional().describe('Working directory for decomposition'),
});

export type DecomposeOptions = z.infer<typeof decomposeOptionsSchema>;

/**
 * Result of task execution
 *
 * @remarks
 * Contains information about what was executed, which files were modified,
 * and any output or errors from the agent.
 *
 * @example
 * ```typescript
 * const result: TaskResult = {
 *   success: true,
 *   filesModified: ['src/types/theme.ts', 'src/types/__tests__/theme.test.ts'],
 *   output: 'Created theme types with light/dark/system modes',
 * };
 * ```
 */
export const taskResultSchema = z.object({
  success: z.boolean().describe('Whether the task executed successfully'),
  filesModified: z.array(z.string()).describe('List of files that were modified or created'),
  output: z.string().optional().describe('Agent output or execution log'),
  error: z.string().optional().describe('Error message if task failed'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional execution metadata'),
});

export type TaskResult = z.infer<typeof taskResultSchema>;

/**
 * Result of a single criterion validation
 *
 * @remarks
 * Contains the validation status of one acceptance criterion,
 * along with evidence supporting the pass/fail determination.
 *
 * @example
 * ```typescript
 * const criterionResult: CriterionResult = {
 *   criterion: 'Types exported for light/dark/system modes',
 *   passed: true,
 *   evidence: 'Found exports: ThemeMode, LightTheme, DarkTheme, SystemTheme in src/types/theme.ts',
 * };
 * ```
 */
export const criterionResultSchema = z.object({
  criterion: z.string().describe('The acceptance criterion being validated'),
  passed: z.boolean().describe('Whether the criterion was met'),
  evidence: z.string().optional().describe('Evidence supporting the pass/fail determination'),
});

export type CriterionResult = z.infer<typeof criterionResultSchema>;

/**
 * Result of validation against acceptance criteria
 *
 * @remarks
 * Aggregates results from all acceptance criteria checks,
 * indicating overall validation status.
 *
 * @example
 * ```typescript
 * const validationResult: ValidationResult = {
 *   passed: true,
 *   criteriaResults: [
 *     {
 *       criterion: 'Types exported for light/dark/system modes',
 *       passed: true,
 *       evidence: 'Found exports in theme.ts',
 *     },
 *     {
 *       criterion: 'ThemeContext type defined',
 *       passed: true,
 *       evidence: 'ThemeContext interface found',
 *     },
 *   ],
 * };
 * ```
 */
export const validationResultSchema = z.object({
  passed: z.boolean().describe('Whether all criteria passed'),
  criteriaResults: z
    .array(criterionResultSchema)
    .describe('Results for each individual acceptance criterion'),
  summary: z.string().optional().describe('Summary of validation results'),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

/**
 * Unified agent interface for multi-agent support
 *
 * @remarks
 * This interface defines the contract that all agent implementations
 * (Claude, Codex, Mock) must follow. It supports three core operations:
 *
 * 1. **decompose**: Transform specifications into structured task plans
 * 2. **execute**: Implement a single task with specific file changes
 * 3. **validate**: Verify implementation against acceptance criteria
 *
 * The interface is designed to be implementation-agnostic, allowing
 * different AI agents to be plugged in without changing the orchestration logic.
 *
 * @example
 * ```typescript
 * // Claude implementation
 * class ClaudeAgent implements Agent {
 *   async decompose(prompt: string, cwd: string, options: DecomposeOptions): Promise<PlanV2> {
 *     // Call Claude API to generate plan
 *     const response = await claudeAPI.generate(prompt);
 *     return parsePlanFromResponse(response);
 *   }
 *
 *   async execute(prompt: string, files: string[], cwd: string): Promise<TaskResult> {
 *     // Execute task using Claude
 *     const result = await claudeCLI.run(prompt, files, cwd);
 *     return { success: true, filesModified: files };
 *   }
 *
 *   async validate(prompt: string, criteria: string[], cwd: string): Promise<ValidationResult> {
 *     // Ask Claude to validate implementation
 *     const results = await claudeAPI.validate(prompt, criteria);
 *     return { passed: true, criteriaResults: results };
 *   }
 * }
 *
 * // Using the agent
 * const agent: Agent = new ClaudeAgent();
 *
 * // 1. Decompose specification
 * const plan = await agent.decompose(
 *   'Create dark mode feature',
 *   '/path/to/project',
 *   { specFile: 'dark-mode.md' }
 * );
 *
 * // 2. Execute a task
 * const result = await agent.execute(
 *   'Create theme types in src/types/theme.ts',
 *   ['src/types/theme.ts'],
 *   '/path/to/project'
 * );
 *
 * // 3. Validate implementation
 * const validation = await agent.validate(
 *   'Validate theme types implementation',
 *   [
 *     'Types exported for light/dark/system modes',
 *     'ThemeContext type defined',
 *   ],
 *   '/path/to/project'
 * );
 * ```
 */
export type Agent = {
  /**
   * Decompose a specification into a structured task plan
   *
   * @param prompt - Brief description or full specification content to decompose
   * @param cwd - Working directory for the project
   * @param options - Decomposition configuration options
   * @returns Promise resolving to a structured PlanV2 with phases and tasks
   *
   * @remarks
   * This method is responsible for:
   * - Analyzing the specification and codebase
   * - Breaking down requirements into tasks
   * - Organizing tasks into phases with dependencies
   * - Generating acceptance criteria and success metrics
   *
   * The agent should produce plans following architectural best practices:
   * - Layered ordering (DB → API → UI)
   * - Appropriate task granularity (50-200 LOC per task)
   * - Clear dependencies and phase boundaries
   * - Zero file conflicts
   *
   * @example
   * ```typescript
   * const plan = await agent.decompose(
   *   'Add dark mode toggle to application settings',
   *   '/Users/dev/my-app',
   *   {
   *     specFile: 'specs/dark-mode.md',
   *     agent: 'claude',
   *     maxRetries: 3,
   *     verbose: true,
   *   }
   * );
   *
   * console.log(`Generated plan with ${plan.tasks.length} tasks`);
   * console.log(`Organized into ${plan.phases?.length ?? 0} phases`);
   * ```
   */
  decompose(prompt: string, cwd: string, options: DecomposeOptions): Promise<PlanV2>;

  /**
   * Execute a single task by modifying/creating specified files
   *
   * @param prompt - Detailed task description with context and acceptance criteria
   * @param files - List of files to modify or create
   * @param cwd - Working directory for execution
   * @returns Promise resolving to execution result with modified files and status
   *
   * @remarks
   * This method is responsible for:
   * - Understanding the task requirements from the prompt
   * - Analyzing existing code in the target files
   * - Implementing the required changes
   * - Following project conventions and patterns
   * - Creating new files if needed
   *
   * The prompt should include:
   * - Task description and reasoning ("why" not just "what")
   * - Full specification context for architectural guidance
   * - Acceptance criteria to validate against
   * - Success metrics for quality benchmarks
   *
   * @example
   * ```typescript
   * const prompt = `
   * # Task: Create Theme Types
   *
   * Define TypeScript types for theme system.
   * Why: All theme features depend on these type definitions.
   *
   * ## Context from Original Specification
   * [Full specification content...]
   *
   * ## This Task's Scope
   * **Files to modify/create:**
   * - src/types/theme.ts
   *
   * **Acceptance Criteria:**
   * - Types exported for light/dark/system modes
   * - ThemeContext type defined
   * `;
   *
   * const result = await agent.execute(
   *   prompt,
   *   ['src/types/theme.ts'],
   *   '/Users/dev/my-app'
   * );
   *
   * if (result.success) {
   *   console.log(`Modified ${result.filesModified.length} files`);
   * }
   * ```
   */
  execute(prompt: string, files: string[], cwd: string): Promise<TaskResult>;

  /**
   * Validate implementation against acceptance criteria
   *
   * @param prompt - Validation context including what to check
   * @param criteria - List of acceptance criteria to validate
   * @param cwd - Working directory for validation
   * @returns Promise resolving to validation results for each criterion
   *
   * @remarks
   * This method is responsible for:
   * - Analyzing the implementation code
   * - Checking each acceptance criterion
   * - Gathering evidence for pass/fail decisions
   * - Assessing overall implementation quality
   *
   * The validation should be:
   * - Objective: Based on concrete evidence from code
   * - Comprehensive: Check all specified criteria
   * - Actionable: Provide clear evidence for failures
   * - Context-aware: Understand project patterns
   *
   * @example
   * ```typescript
   * const prompt = `
   * Validate the theme types implementation in src/types/theme.ts.
   *
   * Check if the implementation follows TypeScript best practices
   * and meets the specified requirements.
   * `;
   *
   * const validation = await agent.validate(
   *   prompt,
   *   [
   *     'Types exported for light/dark/system modes',
   *     'ThemeContext type defined',
   *     'Types use strict TypeScript with no any',
   *   ],
   *   '/Users/dev/my-app'
   * );
   *
   * if (!validation.passed) {
   *   const failed = validation.criteriaResults.filter(r => !r.passed);
   *   console.log(`Failed criteria: ${failed.length}`);
   *   failed.forEach(r => {
   *     console.log(`  - ${r.criterion}`);
   *     console.log(`    Evidence: ${r.evidence}`);
   *   });
   * }
   * ```
   */
  validate(prompt: string, criteria: string[], cwd: string): Promise<ValidationResult>;
};

/**
 * Agent type discriminator
 *
 * @remarks
 * Supported agent implementations:
 * - claude: Anthropic's Claude Code CLI
 * - codex: OpenAI Codex CLI
 * - mock: Mock agent for testing
 */
export type AgentType = 'claude' | 'codex' | 'mock';

/**
 * Agent factory function type
 *
 * @remarks
 * Used by agent services to instantiate agents of specific types.
 *
 * @example
 * ```typescript
 * const createAgent: AgentFactory = (type: AgentType): Agent => {
 *   switch (type) {
 *     case 'claude': return new ClaudeAgent();
 *     case 'codex': return new CodexAgent();
 *     case 'mock': return new MockAgent();
 *   }
 * };
 * ```
 */
export type AgentFactory = (type: AgentType) => Agent;

/**
 * Agent metadata for capability discovery
 *
 * @remarks
 * Provides information about what an agent can do,
 * useful for selecting the appropriate agent for a task.
 *
 * @example
 * ```typescript
 * const metadata: AgentMetadata = {
 *   type: 'claude',
 *   version: '1.0.0',
 *   capabilities: {
 *     supportsDecompose: true,
 *     supportsExecute: true,
 *     supportsValidate: true,
 *     maxContextTokens: 200000,
 *   },
 * };
 * ```
 */
export const agentMetadataSchema = z.object({
  type: z.enum(['claude', 'codex', 'mock']).describe('Agent type identifier'),
  version: z.string().optional().describe('Agent implementation version'),
  capabilities: z
    .object({
      supportsDecompose: z.boolean().describe('Can decompose specifications into plans'),
      supportsExecute: z.boolean().describe('Can execute individual tasks'),
      supportsValidate: z.boolean().describe('Can validate implementations'),
      maxContextTokens: z.number().optional().describe('Maximum context window in tokens'),
    })
    .describe('Agent capabilities'),
});

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;
