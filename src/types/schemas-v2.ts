import { z } from 'zod';

/**
 * T-shirt size complexity for task estimation
 *
 * @remarks
 * - XS (< 1h): Too small, should be folded into related tasks
 * - S (1-2h): Small, well-defined tasks - good for quick wins
 * - M (2-4h): Sweet spot - target size for most tasks
 * - L (4-8h): Large but manageable - use sparingly
 * - XL (> 8h): Too large - must be split into smaller tasks
 *
 * @example
 * ```typescript
 * const task: TaskV2 = {
 *   id: 'create-types',
 *   name: 'Create Theme Types',
 *   complexity: 'M', // Medium-sized task (2-4 hours)
 *   // ... other fields
 * };
 * ```
 */
export const complexitySchema = z
  .enum(['XS', 'S', 'M', 'L', 'XL'])
  .describe('T-shirt size complexity estimation for tasks');

export type Complexity = z.infer<typeof complexitySchema>;

/**
 * Phase execution strategy
 *
 * @remarks
 * - sequential: Tasks execute one at a time in order
 * - parallel: Tasks execute concurrently in separate worktrees
 *
 * @example
 * ```typescript
 * const setupPhase: Phase = {
 *   id: 'phase-setup',
 *   name: 'Setup Phase',
 *   strategy: 'sequential', // Types must be created before context
 *   tasks: ['create-types', 'create-context'],
 *   requires: [],
 * };
 * ```
 */
export const phaseStrategySchema = z
  .enum(['sequential', 'parallel'])
  .describe('Phase execution strategy');

export type PhaseStrategy = z.infer<typeof phaseStrategySchema>;

/**
 * Phase definition with strategy, tasks, and dependencies
 *
 * @remarks
 * Phases organize tasks into logical execution units with clear dependencies.
 * Each phase has an execution strategy (sequential or parallel) that determines
 * how tasks within the phase are executed.
 *
 * @example
 * ```typescript
 * const implementationPhase: Phase = {
 *   id: 'phase-implementation',
 *   name: 'Implementation Phase',
 *   strategy: 'parallel',
 *   tasks: ['theme-provider', 'toggle-button', 'update-styles'],
 *   requires: ['phase-setup'], // Depends on setup phase completing first
 * };
 * ```
 */
export const phaseSchema = z.object({
  id: z
    .string()
    .regex(/^[\da-z-]+$/, 'Phase ID must be kebab-case')
    .describe('Unique kebab-case identifier for the phase'),
  name: z.string().min(1, 'Phase name is required').describe('Human-readable phase name'),
  strategy: phaseStrategySchema.describe('Execution strategy for tasks in this phase'),
  tasks: z
    .array(z.string())
    .min(1, 'Phase must contain at least one task')
    .describe('List of task IDs belonging to this phase'),
  requires: z
    .array(z.string())
    .default([])
    .describe('List of phase IDs that must complete before this phase'),
});

export type Phase = z.infer<typeof phaseSchema>;

/**
 * Enhanced task definition for v2
 *
 * @remarks
 * Key changes from v1:
 * - title → name
 * - touches + produces → files
 * - requires → dependencies
 * - estimatedLines → complexity (T-shirt sizes)
 * - Added: acceptance_criteria array
 *
 * @example
 * ```typescript
 * const task: TaskV2 = {
 *   id: 'create-theme-types',
 *   name: 'Create Theme Types',
 *   complexity: 'S',
 *   description: 'Define TypeScript types for theme system.\nWhy: All theme features depend on these type definitions.',
 *   files: ['src/types/theme.ts'],
 *   acceptance_criteria: [
 *     'Types exported for light/dark/system modes',
 *     'ThemeContext type defined',
 *   ],
 *   dependencies: [],
 * };
 * ```
 */
export const taskV2Schema = z.object({
  id: z
    .string()
    .regex(/^[\da-z-]+$/, 'Task ID must be kebab-case')
    .describe('Unique kebab-case identifier for the task'),
  name: z.string().min(1, 'Task name is required').describe('Short descriptive task name'),
  complexity: complexitySchema.describe('T-shirt size complexity estimate (XS|S|M|L|XL)'),
  description: z
    .string()
    .min(50, 'Description should be at least 50 characters for clarity')
    .describe('Detailed description of what needs to be done and why'),
  files: z
    .array(z.string())
    .min(1, 'Task must specify at least one file')
    .describe('List of files to modify or create'),
  acceptanceCriteria: z
    .array(z.string())
    .default([])
    .describe('List of testable acceptance criteria for this task'),
  dependencies: z.array(z.string()).default([]).describe('List of task IDs this task depends on'),
  phase: z.string().optional().describe('Phase membership (optional, for flat task lists)'),
});

export type TaskV2 = z.infer<typeof taskV2Schema>;

/**
 * Success metrics for plan validation
 *
 * @remarks
 * Success metrics define both quantitative (measurable) and qualitative
 * (subjective) goals for the implementation. These are used in validation
 * mode to assess whether the implementation meets expectations.
 *
 * @example
 * ```typescript
 * const metrics: SuccessMetrics = {
 *   quantitative: [
 *     'Test coverage: 100% for theme components',
 *     'Performance: <50ms theme switch time',
 *     'Bundle size: <5KB gzipped',
 *   ],
 *   qualitative: [
 *     'Smooth visual transitions',
 *     'Accessible theme controls (ARIA)',
 *     'Clear documentation',
 *   ],
 * };
 * ```
 */
export const successMetricsSchema = z.object({
  quantitative: z
    .array(z.string())
    .default([])
    .describe('Measurable success metrics (performance, coverage, size, etc.)'),
  qualitative: z
    .array(z.string())
    .default([])
    .describe('Qualitative success goals (UX, accessibility, clarity, etc.)'),
});

export type SuccessMetrics = z.infer<typeof successMetricsSchema>;

/**
 * Plan execution strategy
 *
 * @remarks
 * - sequential: All tasks execute one at a time
 * - parallel: Tasks execute concurrently based on dependencies
 * - phased-parallel: Tasks grouped into phases with mixed strategies
 */
export const planStrategySchema = z
  .enum(['sequential', 'parallel', 'phased-parallel'])
  .describe('Overall plan execution strategy');

export type PlanStrategy = z.infer<typeof planStrategySchema>;

/**
 * Complete plan with phases (v2)
 *
 * @remarks
 * The v2 plan structure introduces phases for better organization and
 * execution control. Phases can be sequential or parallel, and tasks
 * within phases inherit the phase's execution strategy.
 *
 * Cross-validation ensures:
 * - All phase tasks reference existing task IDs
 * - No orphaned tasks (if phases defined, all tasks must belong to a phase)
 *
 * @example
 * ```typescript
 * const plan: PlanV2 = {
 *   name: 'Dark Mode Implementation',
 *   description: 'Add dark mode toggle to application settings',
 *   strategy: 'phased-parallel',
 *   phases: [
 *     {
 *       id: 'phase-setup',
 *       name: 'Setup Phase',
 *       strategy: 'sequential',
 *       tasks: ['create-types', 'create-context'],
 *       requires: [],
 *     },
 *     {
 *       id: 'phase-implementation',
 *       name: 'Implementation Phase',
 *       strategy: 'parallel',
 *       tasks: ['theme-provider', 'toggle-button'],
 *       requires: ['phase-setup'],
 *     },
 *   ],
 *   tasks: [
 *     // ... task definitions
 *   ],
 *   success_metrics: {
 *     quantitative: ['Test coverage: 100%'],
 *     qualitative: ['Smooth transitions'],
 *   },
 * };
 * ```
 */
export const planSchemaV2 = z
  .object({
    name: z.string().min(1, 'Plan name is required').describe('Descriptive plan name'),
    description: z.string().optional().describe('Optional plan description'),
    specification: z.string().optional().describe('Path to specification file'),
    codebase: z.string().optional().describe('Path to codebase documentation file'),
    mode: z
      .enum(['plan', 'execute', 'validate'])
      .optional()
      .describe('Execution mode for the plan'),
    strategy: planStrategySchema.describe('Overall execution strategy'),
    phases: z
      .array(phaseSchema)
      .optional()
      .describe('Optional phase organization for phased-parallel strategy'),
    tasks: z
      .array(taskV2Schema)
      .min(1, 'Plan must contain at least one task')
      .describe('List of all tasks in the plan'),
    successMetrics: successMetricsSchema.optional().describe('Optional success metrics'),
  })
  .refine(
    (plan) => {
      // Validate phase → task references
      if (plan.phases !== undefined) {
        const phaseTaskIds = new Set(plan.phases.flatMap((p) => p.tasks));
        const taskIds = new Set(plan.tasks.map((t) => t.id));

        // Check that all phase tasks reference existing task IDs
        for (const phaseTaskId of phaseTaskIds) {
          if (!taskIds.has(phaseTaskId)) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: 'Phase tasks must reference existing task IDs',
    },
  )
  .refine(
    (plan) => {
      // Validate task ID uniqueness
      const taskIds = plan.tasks.map((t) => t.id);
      const uniqueIds = new Set(taskIds);
      return taskIds.length === uniqueIds.size;
    },
    {
      message: 'Task IDs must be unique',
    },
  )
  .refine(
    (plan) => {
      // Validate phase ID uniqueness
      if (plan.phases !== undefined) {
        const phaseIds = plan.phases.map((p) => p.id);
        const uniqueIds = new Set(phaseIds);
        return phaseIds.length === uniqueIds.size;
      }
      return true;
    },
    {
      message: 'Phase IDs must be unique',
    },
  )
  .refine(
    (plan) => {
      // Validate phase dependencies reference existing phases
      if (plan.phases !== undefined) {
        const phaseIds = new Set(plan.phases.map((p) => p.id));
        for (const phase of plan.phases) {
          for (const requiredPhaseId of phase.requires) {
            if (!phaseIds.has(requiredPhaseId)) {
              return false;
            }
          }
        }
      }
      return true;
    },
    {
      message: 'Phase dependencies must reference existing phase IDs',
    },
  );

export type PlanV2 = z.infer<typeof planSchemaV2>;

/**
 * Execution context for specification injection
 *
 * @remarks
 * The execution context carries the original specification content and
 * plan metadata to every task execution. This ensures agents have full
 * context about the feature being implemented, not just the individual
 * task description.
 *
 * @example
 * ```typescript
 * const context: ExecutionContext = {
 *   specContent: '# Feature: Dark Mode\n\n## Overview\n...',
 *   planMetadata: {
 *     name: 'Dark Mode Implementation',
 *     description: 'Add dark mode toggle to application settings',
 *     successMetrics: {
 *       quantitative: ['Test coverage: 100%'],
 *       qualitative: ['Smooth transitions'],
 *     },
 *   },
 * };
 * ```
 */
export const executionContextSchema = z.object({
  specContent: z.string().describe('Full markdown specification content'),
  planMetadata: z
    .object({
      name: z.string().describe('Plan name'),
      description: z.string().optional().describe('Plan description'),
      successMetrics: successMetricsSchema.optional().describe('Success metrics'),
    })
    .describe('Plan metadata for context'),
});

export type ExecutionContext = z.infer<typeof executionContextSchema>;
