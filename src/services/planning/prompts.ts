export const PromptBuilder = {
  buildDecompositionPrompt(spec: string): string {
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

IMPORTANT:
- Output ONLY the YAML plan wrapped in \`\`\`yaml code fence
- Always quote file paths that contain special characters like brackets [] or spaces
- Example: "packages/app/src/app/api/users/[id]/route.ts" (quoted because of [])
- Example: packages/app/src/services/user.service.ts (no quotes needed)

Generate the complete plan.yaml now.`;
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
