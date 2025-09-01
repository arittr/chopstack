export const PromptBuilder = {
  buildDecompositionPrompt(spec: string): string {
    return `Analyze this codebase and create a task breakdown for the following feature.
DO NOT MAKE ANY EDITS. Only output a plan.

FEATURE SPECIFICATION:
${spec}

Your task is to decompose this into parallelizable subtasks following these rules:
1. Tasks that can run in parallel MUST NOT modify the same files
2. If multiple tasks need to modify the same file, extract shared changes to a parent task
3. Prefer smaller, focused tasks (max ~200 lines of changes)
4. Respect architectural layers (database → API → UI)
5. Include all necessary tasks (types, tests, migrations, etc.)

Analyze the codebase structure and output a YAML plan:

\`\`\`yaml
tasks:
  - id: string (kebab-case, unique)
    title: string (short, descriptive)
    description: string (what needs to be done)
    touches: [list of existing files to modify]
    produces: [list of new files to create]
    requires: [list of task IDs this depends on]
    estimatedLines: number
    agentPrompt: string (specific prompt for implementing this task)
\`\`\`

IMPORTANT: 
- Output ONLY the YAML plan, no other text or edits
- Always quote file paths that contain special characters like brackets [] or spaces
- Example: "packages/app/src/app/api/users/[id]/route.ts" (quoted because of [])
- Example: packages/app/src/services/user.service.ts (no quotes needed)`;
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
