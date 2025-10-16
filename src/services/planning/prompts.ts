import { isNonEmptyString } from '@/validation/guards';

export const PromptBuilder = {
  buildDecompositionPrompt(spec: string, planOutputPath?: string): string {
    const outputInstruction = isNonEmptyString(planOutputPath)
      ? `IMPORTANT: You have permission to write files. Use the Write tool to create ${planOutputPath} with the complete plan structure. Do NOT use ExitPlanMode - write the file directly.`
      : `Output ONLY the YAML plan wrapped in \`\`\`yaml code fence`;

    return `ROLE: You are a task decomposition agent for chopstack v2.

YOUR JOB: Generate a phase-based plan.yaml with well-scoped tasks following chopstack v2 patterns.

SPECIFICATION:
${spec}

DECOMPOSITION REQUIREMENTS:

1. **Phase Organization**:
   - Group tasks into logical phases (setup → implementation → polish)
   - Identify sequential vs parallel opportunities
   - Ensure correct architectural ordering (DB → API → UI)

2. **Task Sizing** (T-Shirt Complexity):
   - XS (< 1h): Fold into related task
   - S (1-2h): Quick wins, well-defined
   - M (2-4h): TARGET SIZE - most tasks should be M
   - L (4-8h): Use sparingly, consider splitting
   - XL (> 8h): NEVER USE - must be split

3. **Task Quality**:
   - Clear description (why, not just what)
   - Explicit file list (no wildcards like \`src/**/*.ts\`)
   - Specific acceptance criteria
   - Minimal, logical dependencies only

4. **Phase Strategies**:
   - sequential: Tasks must run in order (dependencies, setup work)
   - parallel: Tasks can run simultaneously (independent work)

OUTPUT FORMAT: Generate valid plan.yaml following this structure:

\`\`\`yaml
name: {Plan Name}
description: |
  {Multi-line description}

mode: plan
strategy: phased-parallel

phases:
  # Phase 1: Foundation/Setup (usually sequential)
  - id: phase-1-foundation
    name: {Phase Name}
    strategy: sequential
    tasks:
      - task-1-1-{kebab-case-id}
      - task-1-2-{kebab-case-id}
    complexity: M + S = Medium Phase
    notes: |
      Why these tasks are grouped together.
      Why this strategy (sequential vs parallel).

  # Phase 2: Implementation (often parallel)
  - id: phase-2-implementation
    name: {Phase Name}
    strategy: parallel
    tasks:
      - task-2-1-{kebab-case-id}
      - task-2-2-{kebab-case-id}
      - task-2-3-{kebab-case-id}
    complexity: M + M + M = Large (parallelizable)
    requires: [phase-1-foundation]
    notes: |
      Why these tasks can run in parallel.

  # Phase 3: Polish/Validation (usually sequential)
  - id: phase-3-polish
    name: {Phase Name}
    strategy: sequential
    tasks:
      - task-3-1-{kebab-case-id}
    complexity: M = Medium
    requires: [phase-2-implementation]
    notes: |
      Final cleanup and validation.

tasks:
  - id: task-1-1-{kebab-case-id}
    name: {Task Name}
    complexity: M  # Target: most tasks should be M
    description: |
      Clear description explaining WHAT to do and WHY.

      Implementation approach:
      - Step 1
      - Step 2
      - Step 3

      Why this task exists and how it fits in the plan.
    files:
      - src/specific/file1.ts
      - src/specific/file2.ts
      # NO wildcards like src/**/*.ts
    dependencies:
      - task-1-0-prerequisite  # Only if truly required
    acceptance_criteria:
      - Specific criterion 1
      - Specific criterion 2
      - Specific criterion 3

  # More tasks...

success_metrics:
  quantitative:
    - Test coverage: 95%+
    - Performance: {specific metric}
  qualitative:
    - Code quality: {description}
    - User experience: {description}
\`\`\`

CRITICAL RULES:
- ✅ Most tasks should be M complexity
- ✅ Specific file paths (no wildcards)
- ✅ Clear acceptance criteria
- ✅ MUST include complete plan structure: name, description, mode, strategy, phases, tasks, success_metrics
- ❌ NEVER create XL tasks
- ❌ NEVER use vague file patterns
- ❌ NEVER create XS tasks (fold into related task)
- ❌ NEVER output just a tasks array - output the COMPLETE plan structure

IMPORTANT YAML FORMATTING RULES:

1. **Array Items**: Each array item must be on its own line starting with \`-\`
   ✅ CORRECT:
   acceptance_criteria:
     - Light theme variables defined in :root selector
     - Dark theme overrides defined in data-theme="dark" selector
     - Minimum variables: background, foreground, text, border, accent, muted

   ❌ WRONG (line wrapping in arrays causes parser errors):
   acceptance_criteria:
     - Light theme variables defined in :root selector
     - Dark theme overrides defined in '[data-theme="dark"]' selector
     - Minimum variables defined: background, foreground, text (primary/secondary),
       border, accent, muted  # Parser error: treats continuation as map key

2. **Quote Handling**:
   - Quote file paths with special characters: brackets [], spaces, colons
     - ✅ "packages/app/api/users/[id]/route.ts"
     - ✅ packages/app/services/user.service.ts (no special chars)
   - For strings with quotes, use opposite quote style or remove quotes:
     - ✅ data-theme="dark" (no outer quotes needed in most contexts)
     - ✅ '[data-theme="dark"]' (single wrapping double)
     - ❌ "[data-theme='dark']" (avoid if possible, confusing)

3. **Multi-line Content**: Use literal block scalar \`|\` for long text:
   description: |
     This is a multi-line description.
     It can contain "quotes" and [brackets] freely.
     Each line is preserved with newlines.

4. **Keep Array Items Concise**: If an item is too long, rephrase it to fit one line rather than wrapping

RULE: Always validate YAML syntax - array items must be complete on one line

ACTION REQUIRED:
${outputInstruction}`;
  },

  buildClaudeCodePrompt(specFile: string): string {
    return `Read the specification in ${specFile}.
Analyze the current codebase structure.
Create a conflict-free task breakdown.
Output only YAML, no edits.`;
  },

  buildAiderPrompt(specFile: string): string {
    return `/read ${specFile}

Create a task breakdown for implementing this specification.
Consider the repository structure and existing code.
Output a YAML plan with parallelizable tasks.
Do not make any edits, only output the plan.`;
  },
};
