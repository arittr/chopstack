# Chopstack v2.0.0 - Technical Implementation Guide

**Purpose**: Comprehensive technical documentation for implementing chopstack v2.0.0. This document provides all architectural details, component specifications, schemas, and implementation patterns needed by agents to build the system.

**Related**: See [spec.md](./spec.md) for user-facing requirements and goals.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Type System & Schemas](#type-system--schemas)
3. [CLI Interface Specifications](#cli-interface-specifications)
4. [Component Specifications](#component-specifications)
5. [Error Handling & Recovery](#error-handling--recovery)
6. [File Structure](#file-structure)
7. [Implementation Plan](#implementation-plan)
8. [Performance Considerations](#performance-considerations)
9. [Code Quality Standards](#code-quality-standards)

---

## Architecture Overview

### High-Level Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chopstack v2 Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Step 1: Specification Expansion             │  │
│  │                                                          │  │
│  │  Command: chopstack specify "add dark mode"             │  │
│  │                                                          │  │
│  │  ┌────────────────┐                                     │  │
│  │  │   Codebase     │  Scan architecture, patterns,       │  │
│  │  │   Analyzer     │  tech stack, file relationships     │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Spec Template │  Feature/Refactor/Bugfix templates  │  │
│  │  │    System      │  with variable injection           │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Agent: Expand │  Prompt: Generate rich spec         │  │
│  │  │  Specification │  Context: codebase analysis         │  │
│  │  └────────┬───────┘  Output: structured markdown        │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  Output: dark-mode.md (1000+ lines)                     │  │
│  │    - Overview & Background                              │  │
│  │    - Requirements (FR/NFR)                              │  │
│  │    - Architecture & Design                              │  │
│  │    - Acceptance Criteria                                │  │
│  │    - Success Metrics                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │             Step 2: Phase-Based Decomposition            │  │
│  │                                                          │  │
│  │  Command: chopstack decompose --spec dark-mode.md       │  │
│  │                                                          │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Parse Rich    │  Extract: requirements, design,     │  │
│  │  │  Spec          │  acceptance criteria, metrics       │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │  Agent: 5-Phase Decomposition Workflow        │    │  │
│  │  │                                                │    │  │
│  │  │  Phase 0: Codebase Analysis                   │    │  │
│  │  │    → Scan architecture, patterns, tech stack  │    │  │
│  │  │    → Gate: Can identify architecture?         │    │  │
│  │  │                                                │    │  │
│  │  │  Phase 1: Requirements Extraction             │    │  │
│  │  │    → Extract FR/NFR                           │    │  │
│  │  │    → List affected components, files          │    │  │
│  │  │    → Gate: All requirements clear?            │    │  │
│  │  │                                                │    │  │
│  │  │  Phase 2: Task Generation                     │    │  │
│  │  │    → Apply layered ordering (DB → API → UI)   │    │  │
│  │  │    → Create tasks (50-200 line sizing)        │    │  │
│  │  │    → Generate agentPrompts                    │    │  │
│  │  │    → Gate: All tasks have clear I/O?          │    │  │
│  │  │                                                │    │  │
│  │  │  Phase 3: Conflict Resolution                 │    │  │
│  │  │    → Run detection algorithm                  │    │  │
│  │  │    → Apply resolution strategies              │    │  │
│  │  │    → Re-validate until zero conflicts         │    │  │
│  │  │    → Gate: Zero file conflicts?               │    │  │
│  │  │                                                │    │  │
│  │  │  Phase 4: Validation                          │    │  │
│  │  │    → Check circular dependencies              │    │  │
│  │  │    → Verify requirement coverage              │    │  │
│  │  │    → Validate completeness                    │    │  │
│  │  │    → Gate: Pass all checks?                   │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Phase         │  Analyze task relationships,        │  │
│  │  │  Detection     │  detect natural phase boundaries,   │  │
│  │  │                │  group related tasks                │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  Output: dark-mode.plan.yaml                            │  │
│  │    - Phases with strategies                             │  │
│  │    - Tasks with rich metadata                           │  │
│  │    - Acceptance criteria                                │  │
│  │    - Success metrics                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │            Step 3: Phase-Aware Execution                 │  │
│  │                                                          │  │
│  │  Command: chopstack run --plan dark-mode.plan.yaml      │  │
│  │                                                          │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Parse Phases  │  Build phase DAG                    │  │
│  │  │  & Validate    │  Topological sort                   │  │
│  │  └────────┬───────┘  Validate structure                 │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │      Phase Execution Engine                    │    │  │
│  │  │                                                │    │  │
│  │  │  For each phase (in topological order):       │    │  │
│  │  │                                                │    │  │
│  │  │    If phase.strategy === 'sequential':        │    │  │
│  │  │      → Execute tasks one-by-one               │    │  │
│  │  │      → Single worktree                         │    │  │
│  │  │      → Commit after each task                  │    │  │
│  │  │                                                │    │  │
│  │  │    If phase.strategy === 'parallel':          │    │  │
│  │  │      → Build task DAG within phase            │    │  │
│  │  │      → Spawn worktrees for parallel tasks     │    │  │
│  │  │      → Execute concurrently                    │    │  │
│  │  │      → Merge branches, stack PRs              │    │  │
│  │  │                                                │    │  │
│  │  │    Emit phase transition events                │    │  │
│  │  │    Track phase progress                        │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Enhanced TUI  │  Phase tree view                    │  │
│  │  │                │  Progress per phase                 │  │
│  │  │                │  Strategy indicators                │  │
│  │  │                │  Transitions animated               │  │
│  │  └────────────────┘                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │              Step 4: Validation (Optional)               │  │
│  │                                                          │  │
│  │  Command: chopstack run --plan plan.yaml --validate     │  │
│  │                                                          │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Acceptance    │  For each criterion:                │  │
│  │  │  Criteria      │    → Prompt agent validation        │  │
│  │  │  Checker       │    → Score pass/fail                │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Success       │  Quantitative: run checks           │  │
│  │  │  Metrics       │  Qualitative: agent assessment      │  │
│  │  │  Validator     │  Aggregate results                  │  │
│  │  └────────┬───────┘                                     │  │
│  │           │                                              │  │
│  │           ▼                                              │  │
│  │  ┌────────────────┐                                     │  │
│  │  │  Validation    │  Format: criteria passed/failed     │  │
│  │  │  Report        │  Metrics: scores & targets          │  │
│  │  │  Generator     │  Overall: completion %              │  │
│  │  └────────────────┘  Next steps: actionable items       │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Context Injection Flow

**Critical**: The original specification MUST be passed to every agent execution for architectural context.

**CLI workflow:**
```bash
# Step 1: Generate rich specification
chopstack specify "add dark mode" --output dark-mode.md

# Step 2: Decompose with spec reference
chopstack decompose --spec dark-mode.md --output dark-mode.plan.yaml

# Step 3: Execute with spec context injection
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md
#                                         ^^^^^^^^^^^^^^^^^^^
#                                         Spec file passed here!
```

**Internal flow:**
```typescript
// run-v2.ts
export async function runCommand(options: RunOptions): Promise<void> {
  const plan = await loadPlan(options.planFile);
  const specContent = await loadSpec(options.specFile);  // NEW: Load spec

  // Create execution context with spec
  const context: ExecutionContext = {
    specContent,
    planMetadata: {
      name: plan.name,
      description: plan.description,
      successMetrics: plan.success_metrics,
    },
  };

  // Pass context to executor
  const executor = new PhaseExecutor(context);
  await executor.executePlan(plan);
}

// phase-executor.ts - When executing each task:
private async executeTask(task: TaskV2): Promise<TaskResult> {
  // Build enriched prompt with full spec context
  const prompt = this.buildTaskPromptWithContext(task);

  // Agent receives:
  // - Task description
  // - Full specification markdown
  // - Acceptance criteria
  // - Success metrics
  // - Architectural context

  return await this.agent.execute(prompt, task.files);
}
```

**Why this matters:**

Without spec context:
```
Agent prompt: "Create theme types in src/types/theme.ts"
Agent: *Creates generic theme types without project context*
Result: ❌ Types don't match project patterns, missing required fields
```

With spec context:
```
Agent prompt:
  Task: Create theme types

  Context from Original Specification:
  [Full dark-mode.md content including architecture, patterns, requirements]

  This Task's Scope:
  - Files: src/types/theme.ts
  - Acceptance Criteria:
    - Types exported for light/dark/system modes
    - ThemeContext type defined

  Success Metrics:
  - Test coverage: 100% for theme components
  - Performance: <50ms theme switch time

Agent: *Creates types following project architecture with required fields*
Result: ✅ Types match project patterns, include all requirements
```

---

## Type System & Schemas

### Phase Schema (v2)

```typescript
import { z } from 'zod';

// Phase schema
export const phaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  strategy: z.enum(['sequential', 'parallel']),
  tasks: z.array(z.string()).min(1),
  requires: z.array(z.string()).default([]),
  estimated_hours: z.number().positive(),
});

// Task schema
export const taskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  files: z.array(z.string()),
  acceptance_criteria: z.array(z.string()).default([]),
  estimated_hours: z.number().positive(),
  phase: z.string().optional(),  // Phase membership
  dependencies: z.array(z.string()).default([]),
});

// Success metrics schema
export const successMetricsSchema = z.object({
  quantitative: z.array(z.string()),
  qualitative: z.array(z.string()),
});

// Plan schema v2
export const planSchemaV2 = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  strategy: z.enum(['sequential', 'parallel', 'phased-parallel']),
  phases: z.array(phaseSchema).optional(),
  tasks: z.array(taskSchema).min(1),
  success_metrics: successMetricsSchema.optional(),
}).refine(
  (plan) => {
    // Validate phase → task references
    if (plan.phases) {
      const phaseTaskIds = new Set(plan.phases.flatMap(p => p.tasks));
      const taskIds = new Set(plan.tasks.map(t => t.id));

      for (const phaseTaskId of phaseTaskIds) {
        if (!taskIds.has(phaseTaskId)) {
          return false;
        }
      }
    }
    return true;
  },
  { message: 'Phase tasks must reference existing task IDs' }
);

// Infer TypeScript types
export type Phase = z.infer<typeof phaseSchema>;
export type TaskV2 = z.infer<typeof taskSchema>;
export type SuccessMetrics = z.infer<typeof successMetricsSchema>;
export type PlanV2 = z.infer<typeof planSchemaV2>;

// Execution context for spec injection
export type ExecutionContext = {
  specContent: string;           // Full markdown specification
  planMetadata: {
    name: string;
    description?: string;
    successMetrics?: SuccessMetrics;
  };
};
```

### Codebase Analysis Types

```typescript
/**
 * Flexible, agent-driven codebase analysis
 * Allows LLM to describe what it discovers without rigid classification
 */
export type CodebaseAnalysis = {
  // Structured markdown summary (most important!)
  summary: string;  // Agent's freeform analysis in markdown

  // Structured findings (agent decides what to include)
  findings: {
    techStack?: {
      languages?: string[];
      frameworks?: string[];
      runtimes?: string[];          // Plural - support polyglot
      buildTools?: string[];         // Plural - many projects use multiple
      dependencies?: string[];       // Key packages discovered
      [key: string]: unknown;        // Extensible for future discoveries
    };
    architecture?: {
      description?: string;          // Agent describes the pattern
      patterns?: string[];           // Multiple patterns allowed (e.g., "layered + DDD")
      directories?: Record<string, string>;  // path → purpose
      [key: string]: unknown;
    };
    conventions?: {
      naming?: Record<string, string>;  // category → convention
      testing?: Record<string, string>; // framework → pattern
      [key: string]: unknown;
    };
    codeMetrics?: {
      totalFiles?: number;
      linesOfCode?: number;
      complexity?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;  // Extensible top-level
  };

  // Agent's raw observations (qualitative insights)
  observations: string[];  // ["Uses React Context for global state", "Follows Airbnb style", ...]

  // Code examples discovered (for pattern matching)
  examples: {
    component?: string;      // Example component code
    test?: string;          // Example test code
    api?: string;           // Example API/route code
    utility?: string;       // Example utility/helper
    [key: string]: string | undefined;  // Extensible
  };

  // Related features found (for context)
  relatedFeatures: Array<{
    name: string;
    files: string[];
    description?: string;   // Agent describes similarity
    relevance?: string;     // Why this is related
  }>;
};
```

### Agent Interface

```typescript
/**
 * Unified agent interface for multi-agent support
 * Implementations: Claude, Aider, Mock
 */
export interface Agent {
  /**
   * Decompose specification into tasks
   */
  decompose(
    prompt: string,
    cwd: string,
    options: DecomposeOptions
  ): Promise<PlanV2>;

  /**
   * Execute a single task
   */
  execute(
    prompt: string,
    files: string[],
    cwd: string
  ): Promise<TaskResult>;

  /**
   * Validate implementation against criteria
   */
  validate(
    prompt: string,
    criteria: string[],
    cwd: string
  ): Promise<ValidationResult>;
}

export interface DecomposeOptions {
  specFile: string;
  agent?: string;          // 'claude' | 'aider' | 'mock'
  maxRetries?: number;
  verbose?: boolean;
}

export interface TaskResult {
  success: boolean;
  filesModified: string[];
  output?: string;
  error?: string;
}

export interface ValidationResult {
  passed: boolean;
  criteriaResults: Array<{
    criterion: string;
    passed: boolean;
    evidence?: string;
  }>;
}
```

### Validation Types

```typescript
/**
 * Project principles discovered from existing documentation
 * Leverages CLAUDE.md, .cursorrules, CONTRIBUTING.md instead of custom constitution
 */
export type ProjectPrinciples = {
  source: string;  // File where principles found (CLAUDE.md, .cursorrules, etc.)
  principles: Array<{
    category: string;        // e.g., "Code Style", "Architecture", "Testing"
    rule: string;           // The actual principle/rule
    examples?: string[];    // Code examples if provided
  }>;
};

/**
 * Cross-artifact validation finding
 * Severity-based categorization for prioritization
 */
export type ValidationFinding = {
  id: string;                    // Stable ID for tracking (hash of category + message)
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'duplication' | 'gap' | 'ambiguity' | 'inconsistency' | 'principle-violation';
  message: string;               // Human-readable description
  artifacts: string[];           // Files/tasks affected
  remediation?: string;          // How to fix
  relatedPrinciple?: string;     // Which principle violated (if applicable)
};

/**
 * Comprehensive validation report
 */
export type ValidationReport = {
  // Acceptance criteria results
  criteriaResults: Array<{
    criterion: string;
    passed: boolean;
    evidence?: string;           // Why it passed/failed
    taskId?: string;            // Which task this belongs to
  }>;

  // Success metrics assessment
  metrics: {
    quantitative: Array<{
      metric: string;
      target: string;            // Expected value
      actual: string;            // Measured value
      passed: boolean;
    }>;
    qualitative: Array<{
      goal: string;
      assessment: string;        // Agent's evaluation
      passed: boolean;
    }>;
  };

  // Cross-artifact findings
  crossArtifactFindings: ValidationFinding[];

  // Project principles violations
  principleViolations: Array<{
    principle: ProjectPrinciples['principles'][number];
    violations: Array<{
      file: string;
      line?: number;
      description: string;
      remediation: string;
    }>;
  }>;

  // Overall assessment
  overallCompletion: number;     // 0-100%
  criticalIssues: number;
  nextSteps: Array<{
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    action: string;
    reasoning: string;
  }>;
};
```

---

## CLI Interface Specifications

### Command Overview

```bash
chopstack <command> [options]

Commands:
  specify    Generate rich specification from brief description
  analyze    Validate specification completeness before decomposition
  decompose  Decompose specification into phase-based plan
  run        Execute phase-based plan with context injection
  validate   Validate implementation against criteria (alias for run --validate)
  stack      Generate stacked PRs from plan execution (v1 compatibility)

Options:
  --help, -h      Show help
  --version, -v   Show version number
  --verbose       Enable verbose logging
  --silent        Suppress output except errors
```

### 1. `chopstack specify`

**Purpose**: Transform brief description into rich, structured specification

**Syntax**:
```bash
chopstack specify <description> [options]
```

**Options**:
| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--output` | `-o` | string | `<feature-name>.md` | Output file path |
| `--template` | `-t` | enum | `feature` | Template type: `feature`, `refactor`, `bugfix` |
| `--cwd` | | string | `process.cwd()` | Target directory to analyze |
| `--agent` | `-a` | string | `claude` | Agent to use: `claude`, `aider`, `mock` |
| `--no-analysis` | | boolean | false | Skip codebase analysis |

**Examples**:
```bash
# Basic usage
chopstack specify "add dark mode"

# Custom output and template
chopstack specify "refactor auth service" --output auth-refactor.md --template refactor

# Target different directory
chopstack specify "add pagination" --cwd ../my-app

# Skip codebase analysis (faster, less context)
chopstack specify "fix button alignment" --no-analysis
```

**Output**: Rich markdown specification file

---

### 2. `chopstack analyze`

**Purpose**: Validate specification completeness before decomposition

**Syntax**:
```bash
chopstack analyze [options]
```

**Options**:
| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--spec` | `-s` | string | **required** | Specification file to analyze |
| `--codebase` | `-c` | string | | Optional technical implementation doc |
| `--output` | `-o` | string | `gap-report.md` | Gap report output file |
| `--threshold` | | number | 80 | Minimum completeness score to pass (0-100) |
| `--fail-on-gaps` | | boolean | false | Exit with error if gaps found |

**Examples**:
```bash
# Basic analysis
chopstack analyze --spec dark-mode.md

# Analyze both user spec and technical doc
chopstack analyze --spec dark-mode.md --codebase dark-mode-impl.md

# Fail if completeness < 90%
chopstack analyze --spec my-spec.md --threshold 90 --fail-on-gaps

# Custom output location
chopstack analyze --spec my-spec.md --output analysis/gaps.md
```

**Output**: Gap analysis report with completeness score, categorized gaps, and remediation steps

**Exit Codes**:
- `0`: Analysis complete (or completeness ≥ threshold)
- `1`: Gaps found (if `--fail-on-gaps` enabled)
- `2`: Error during analysis

---

### 3. `chopstack decompose`

**Purpose**: Decompose specification into phase-based task DAG

**Syntax**:
```bash
chopstack decompose [options]
```

**Options**:
| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--spec` | `-s` | string | **required** | Input specification file |
| `--output` | `-o` | string | `<spec-name>.plan.yaml` | Output plan file |
| `--agent` | `-a` | string | `claude` | Agent to use: `claude`, `aider`, `mock` |
| `--strategy` | | enum | `auto` | Plan strategy: `auto`, `sequential`, `parallel`, `phased-parallel` |
| `--max-task-size` | | number | 200 | Max lines of code per task |
| `--no-phases` | | boolean | false | Disable phase detection (flat task list) |

**Examples**:
```bash
# Basic usage
chopstack decompose --spec dark-mode.md

# Custom output and strategy
chopstack decompose --spec dark-mode.md --output my-plan.yaml --strategy phased-parallel

# Control task granularity
chopstack decompose --spec refactor.md --max-task-size 100

# Generate flat task list (v1 compatible)
chopstack decompose --spec feature.md --no-phases
```

**Output**: YAML plan file with phases and tasks

---

### 4. `chopstack run`

**Purpose**: Execute phase-based plan with context injection

**Syntax**:
```bash
chopstack run [options]
```

**Options**:
| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--plan` | `-p` | string | **required** | Input plan file |
| `--spec` | `-s` | string | | Specification file for context injection |
| `--mode` | `-m` | enum | `execute` | Execution mode: `plan`, `execute`, `validate` |
| `--agent` | `-a` | string | `claude` | Agent to use |
| `--strategy` | | enum | auto | VCS strategy: `auto`, `worktree`, `stacked` |
| `--validate` | | boolean | false | Run validation after execution |
| `--resume` | | boolean | false | Resume from last checkpoint |
| `--resume-from` | | string | | Resume from specific task ID |
| `--continue-on-error` | | boolean | false | Continue execution on task failure |
| `--partial-success` | | boolean | false | Commit successful tasks in failed phases |
| `--no-tui` | | boolean | false | Disable TUI, use plain output |

**Examples**:
```bash
# Basic execution with context injection
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md

# Plan mode only (no execution)
chopstack run --plan my-plan.yaml --mode plan

# Execute and validate
chopstack run --plan my-plan.yaml --spec my-spec.md --validate

# Resume from failure
chopstack run --plan my-plan.yaml --resume

# Resume from specific task
chopstack run --plan my-plan.yaml --resume-from task-5

# Continue on errors
chopstack run --plan my-plan.yaml --continue-on-error --partial-success
```

**Output**: Executed tasks, commits, optional validation report

---

### 5. `chopstack validate`

**Purpose**: Validate implementation against acceptance criteria (alias for `run --validate`)

**Syntax**:
```bash
chopstack validate [options]
```

**Options**: Same as `chopstack run --validate`

**Examples**:
```bash
# Validate implementation
chopstack validate --plan my-plan.yaml --spec my-spec.md

# Equivalent to:
chopstack run --plan my-plan.yaml --spec my-spec.md --validate
```

**Output**: Validation report with criteria results, metrics, violations

---

### 6. `chopstack stack` (v1 Compatibility)

**Purpose**: Generate stacked PRs from plan execution

**Syntax**:
```bash
chopstack stack [options]
```

**Options**:
| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--plan` | `-p` | string | **required** | Input plan file |
| `--base` | `-b` | string | `main` | Base branch |
| `--draft` | | boolean | false | Create draft PRs |

**Examples**:
```bash
# Generate stacked PRs
chopstack stack --plan my-plan.yaml

# From feature branch
chopstack stack --plan my-plan.yaml --base feature/auth
```

**Output**: Stacked pull requests

---

### Global Flags

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--cwd` | | string | `process.cwd()` | Working directory |
| `--verbose` | `-v` | boolean | false | Verbose logging |
| `--silent` | | boolean | false | Suppress all output except errors |
| `--no-color` | | boolean | false | Disable colored output |
| `--log-file` | | string | | Write logs to file |

---

## Component Specifications

### 1. Codebase Analyzer

**Module**: `src/services/analysis/codebase-analyzer.ts`

**Purpose**: Scans target codebase to provide rich, agent-friendly context for specification expansion.

**Input Contract**:
```typescript
interface AnalyzeOptions {
  cwd: string;                    // Target directory
  exclude?: string[];             // Patterns to exclude (node_modules, dist, etc.)
  maxFiles?: number;              // Limit files analyzed (default: 1000)
}
```

**Output Contract**: Returns `CodebaseAnalysis` (see Type System section)

**Scanning Strategy**:
1. **File Discovery**: Use glob patterns to find relevant files:
   - Source code: `**/*.{ts,tsx,js,jsx,py,java,go,rs}`
   - Config files: `package.json`, `tsconfig.json`, `*.config.{js,ts}`
   - Documentation: `README.md`, `CLAUDE.md`, `.cursorrules`

2. **Pattern Analysis**:
   - Directory structure analysis (detect src/, lib/, components/, etc.)
   - Import graph analysis (identify key dependencies)
   - Code example extraction (find representative patterns)

3. **Agent Prompt Template**:
   ```
   Analyze this codebase and provide a comprehensive analysis:

   File Structure:
   {fileTree}

   Key Files Analyzed:
   {filesList}

   Package Dependencies:
   {dependencies}

   Please provide:
   1. Tech stack identification (languages, frameworks, build tools)
   2. Architecture pattern description (layered, clean, DDD, etc.)
   3. Code conventions observed (naming, testing patterns)
   4. Related features similar to: {userIntent}
   5. Code examples that demonstrate project patterns

   Format as CodebaseAnalysis JSON.
   ```

**Error Handling**:
- Gracefully handle missing directories
- Skip unreadable files, log warnings
- Return partial analysis if some operations fail

---

### 2. Specification Templates

**Module**: `src/services/planning/templates/`

**Purpose**: Structured markdown templates with variable injection for consistent spec generation.

**Template Types**:

**Feature Template** (`feature-spec.md`):
```markdown
# Feature: {{featureName}}

## Overview
{{overview}}

## Background
{{codebaseContext}}

## Functional Requirements
{{#each functionalRequirements}}
- **FR{{@index}}**: {{this}}
{{/each}}

## Non-Functional Requirements
{{#each nonFunctionalRequirements}}
- **NFR{{@index}}**: {{this}}
{{/each}}

## Architecture

### Component Diagram
{{componentDiagram}}

### Data Flow
{{dataFlow}}

## Implementation Details
{{#each components}}
### {{name}}
**File**: {{file}}
**Purpose**: {{purpose}}
**Dependencies**: {{dependencies}}
{{/each}}

## Acceptance Criteria
{{#each acceptanceCriteria}}
- {{this}}
{{/each}}

## Success Metrics
### Quantitative
{{#each quantitativeMetrics}}
- {{this}}
{{/each}}

### Qualitative
{{#each qualitativeMetrics}}
- {{this}}
{{/each}}
```

**Refactor Template** (`refactor-spec.md`):
```markdown
# Refactor: {{refactorName}}

## Current State
{{currentState}}

## Problems
{{#each problems}}
- {{this}}
{{/each}}

## Desired State
{{desiredState}}

## Refactoring Strategy
{{strategy}}

## Affected Components
{{#each components}}
- **{{name}}**: {{impact}}
{{/each}}

## Migration Path
{{migrationPath}}

## Success Criteria
{{#each successCriteria}}
- {{this}}
{{/each}}
```

**Variable Injection**:
- Uses Handlebars syntax
- Variables populated from codebase analysis + agent expansion
- Template engine: `src/services/planning/template-engine.ts`

---

### 3. Decomposition Prompts v2

**Module**: `src/services/planning/prompts-v2.ts`

**Purpose**: 5-phase workflow prompts with quality gates for robust task decomposition.

**Phase 0: Codebase Analysis**
```typescript
const PHASE_0_PROMPT = `
You are analyzing a codebase to understand its architecture.

Codebase Context:
{codebaseAnalysis}

Task: Identify and describe:
1. Primary architecture pattern (layered, clean, microservices, etc.)
2. Technology stack (frameworks, libraries, tools)
3. Directory structure and purpose of each major directory
4. Code conventions and patterns observed
5. Related features similar to the requested change

Quality Gate: Can you clearly identify the architecture pattern? (YES/NO)
If NO, request additional file context.

Output Format: CodebaseAnalysis JSON
`;
```

**Phase 1: Requirements Extraction**
```typescript
const PHASE_1_PROMPT = `
Extract requirements from this specification:

Specification:
{specContent}

Codebase Architecture:
{codebaseAnalysis}

Task: Extract and list:
1. Functional Requirements (FR1, FR2, ...)
2. Non-Functional Requirements (NFR1, NFR2, ...)
3. Affected components and files
4. External dependencies needed

Quality Gate: Are all requirements clear and testable? (YES/NO)
If NO, refine ambiguous requirements.

Output Format: RequirementsAnalysis JSON
`;
```

**Phase 2: Task Generation**
```typescript
const PHASE_2_PROMPT = `
Generate tasks with layered architectural ordering.

Requirements:
{requirements}

Architecture:
{codebaseAnalysis}

Task Generation Rules:
1. Apply layered ordering: Database → API → Business Logic → UI
2. Size tasks to 50-200 lines of code changes
3. Each task must have clear input/output
4. Generate rich agentPrompt for each task (include context, why, acceptance criteria)
5. Specify exact files to modify/create

Quality Gate: Do all tasks have clear I/O and proper dependencies? (YES/NO)
If NO, refine task definitions.

Output Format: Task[] with dependencies
`;
```

**Phase 3: Conflict Resolution**
```typescript
const PHASE_3_PROMPT = `
Detect and resolve file conflicts using the algorithm:

Tasks:
{tasks}

Conflict Detection Algorithm:
1. Build file → tasks mapping
2. For each file F with tasks T1, T2, ..., Tn:
   a. If tasks are independent: Mark as parallel candidates
   b. If tasks have dependencies: Verify dependency order
   c. If tasks conflict: Apply resolution strategies:
      - Strategy 1: Sequential ordering (add dependency T1 → T2)
      - Strategy 2: File splitting (separate concerns into different files)
      - Strategy 3: Task merging (combine related changes)

Quality Gate: Zero file conflicts? (YES/NO)
If NO, re-run conflict resolution with different strategies.

Output Format: Updated Task[] with resolved conflicts
`;
```

**Phase 4: Validation**
```typescript
const PHASE_4_PROMPT = `
Validate task decomposition for completeness.

Tasks:
{tasks}

Requirements:
{requirements}

Validation Checks:
1. Circular dependency detection (run topological sort)
2. Requirement coverage (every FR/NFR mapped to tasks)
3. Completeness check (all affected files covered)
4. Acceptance criteria coverage (tasks fulfill criteria)

Quality Gate: Pass all validation checks? (YES/NO)
If NO, identify gaps and regenerate missing tasks.

Output Format: ValidationReport with pass/fail for each check
`;
```

**Retry Strategy**:
- Max 3 attempts per phase
- If quality gate fails, provide feedback to agent and retry
- Exponential backoff between retries (1s, 2s, 4s)

---

### 4. Phase Detection

**Module**: `src/services/planning/phase-detector.ts`

**Purpose**: Analyzes task relationships to detect natural phase boundaries and infer execution strategies.

**Algorithm**:

```typescript
export function detectPhases(tasks: TaskV2[]): Phase[] {
  // Step 1: Build dependency graph
  const graph = buildDependencyGraph(tasks);

  // Step 2: Identify strongly connected components (layers)
  const layers = topologicalLayers(graph);

  // Step 3: Detect phase boundaries using heuristics
  const phases: Phase[] = [];

  for (let i = 0; i < layers.length; i++) {
    const layerTasks = layers[i];

    // Heuristic 1: Layer type detection
    const layerType = detectLayerType(layerTasks);

    // Heuristic 2: Parallelization potential
    const canParallelize = layerTasks.every(t1 =>
      layerTasks.every(t2 =>
        t1 === t2 || !hasFileConflict(t1, t2)
      )
    );

    // Heuristic 3: Size threshold
    const isLargePhase = layerTasks.length >= 3;

    phases.push({
      id: `phase-${i}-${layerType}`,
      name: generatePhaseName(layerType, i),
      strategy: canParallelize && isLargePhase ? 'parallel' : 'sequential',
      tasks: layerTasks.map(t => t.id),
      requires: i > 0 ? [phases[i-1].id] : [],
      estimated_hours: sumEstimatedHours(layerTasks),
    });
  }

  return phases;
}

// Layer type detection based on file patterns
function detectLayerType(tasks: TaskV2[]): string {
  const files = tasks.flatMap(t => t.files);

  if (files.some(f => f.includes('/types/') || f.includes('/schema'))) {
    return 'setup';
  }
  if (files.some(f => f.includes('/db/') || f.includes('/models/'))) {
    return 'data';
  }
  if (files.some(f => f.includes('/api/') || f.includes('/routes/'))) {
    return 'api';
  }
  if (files.some(f => f.includes('/components/') || f.includes('/ui/'))) {
    return 'ui';
  }
  if (files.some(f => f.includes('/test'))) {
    return 'testing';
  }

  return 'implementation';
}
```

**Edge Cases**:
- Single task: Create single sequential phase
- No dependencies: Create single parallel phase
- Circular dependencies: Detect and error (should be caught in Phase 4 validation)

---

### 5. Phase Execution Engine

**Module**: `src/services/execution/phase-executor.ts`

**Purpose**: Executes phase-based plans with full context injection.

**Core Interface**:

```typescript
export class PhaseExecutor {
  constructor(
    private readonly context: ExecutionContext,
    private readonly agent: Agent,
    private readonly vcsStrategy: VCSStrategy
  ) {}

  async executePlan(plan: PlanV2): Promise<ExecutionResult> {
    // Step 1: Parse and validate phase DAG
    const phaseDAG = this.buildPhaseDAG(plan.phases || []);
    const sortedPhases = topologicalSort(phaseDAG);

    // Step 2: Execute phases in order
    for (const phase of sortedPhases) {
      await this.executePhase(phase, plan);
    }

    return { success: true, phases: sortedPhases };
  }

  private async executePhase(phase: Phase, plan: PlanV2): Promise<void> {
    const phaseTasks = plan.tasks.filter(t => phase.tasks.includes(t.id));

    if (phase.strategy === 'sequential') {
      await this.executeSequential(phaseTasks);
    } else {
      await this.executeParallel(phaseTasks);
    }
  }

  private async executeSequential(tasks: TaskV2[]): Promise<void> {
    for (const task of tasks) {
      await this.executeTask(task);
      await this.vcsStrategy.commit(task.id, task.name);
    }
  }

  private async executeParallel(tasks: TaskV2[]): Promise<void> {
    // Create worktree per task
    const worktrees = await Promise.all(
      tasks.map(t => this.vcsStrategy.createWorktree(t.id))
    );

    // Execute tasks concurrently
    const results = await Promise.all(
      tasks.map((task, i) => this.executeTask(task, worktrees[i].path))
    );

    // Merge branches in dependency order
    const taskDAG = buildDependencyGraph(tasks);
    const sortedTasks = topologicalSort(taskDAG);

    for (const task of sortedTasks) {
      await this.vcsStrategy.mergeBranch(task.id);
    }
  }

  private async executeTask(task: TaskV2, cwd?: string): Promise<TaskResult> {
    // Build enriched prompt with spec context
    const prompt = this.buildTaskPromptWithContext(task);

    // Execute with agent
    return await this.agent.execute(prompt, task.files, cwd || process.cwd());
  }

  private buildTaskPromptWithContext(task: TaskV2): string {
    return `
# Task: ${task.name}

${task.description}

## Context from Original Specification

${this.context.specContent}

## This Task's Scope

**Files to modify/create:**
${task.files.map(f => `- ${f}`).join('\n')}

**Acceptance Criteria:**
${task.acceptance_criteria.map(c => `- ${c}`).join('\n')}

## Overall Success Metrics

${this.context.planMetadata.successMetrics ? `
**Quantitative:**
${this.context.planMetadata.successMetrics.quantitative.map(m => `- ${m}`).join('\n')}

**Qualitative:**
${this.context.planMetadata.successMetrics.qualitative.map(m => `- ${m}`).join('\n')}
` : 'No success metrics defined.'}

---

Please implement this task following the architecture and patterns from the specification above.
Ensure your implementation satisfies the acceptance criteria and contributes to the overall success metrics.
    `.trim();
  }
}
```

**Worktree Management**:
- One worktree per parallel task
- Worktree naming: `chopstack-{taskId}`
- Automatic cleanup on success/failure

**Phase Transition Events**:
```typescript
eventBus.emitPhaseStart(phase.id, phase.name);
eventBus.emitPhaseProgress(phase.id, completedTasks, totalTasks);
eventBus.emitPhaseComplete(phase.id, duration);
```

---

### 6. Specification Analyzer

**Module**: `src/services/analysis/specification-analyzer.ts`

**Purpose**: Validate specification completeness BEFORE decomposition to catch gaps early.

**Input Contract**:
```typescript
interface AnalyzeOptions {
  specFile: string;           // Primary specification file
  codebaseFile?: string;      // Optional technical implementation doc
  outputFile?: string;        // Gap report output (default: gap-report.md)
}
```

**Output Contract**: Returns `AnalysisReport`

**Core Algorithm**:

```typescript
export class SpecificationAnalyzer {
  async analyze(options: AnalyzeOptions): Promise<AnalysisReport> {
    // Step 1: Parse specification documents
    const spec = await this.parseMarkdown(options.specFile);
    const codebase = options.codebaseFile
      ? await this.parseMarkdown(options.codebaseFile)
      : null;

    // Step 2: Detect structural gaps
    const structuralGaps = this.detectStructuralGaps(spec, codebase);

    // Step 3: Cross-artifact analysis
    const crossFindings = codebase
      ? this.analyzeCrossArtifacts(spec, codebase)
      : [];

    // Step 4: Completeness validation
    const completenessGaps = this.validateCompleteness(spec, codebase);

    // Step 5: Categorize by severity
    const allGaps = [...structuralGaps, ...crossFindings, ...completenessGaps];
    const categorized = this.categorizeBySeverity(allGaps);

    // Step 6: Generate remediation steps
    const remediation = this.generateRemediation(categorized);

    // Step 7: Calculate completeness score
    const completeness = this.calculateCompleteness(categorized);

    return {
      completeness,           // 0-100
      gaps: categorized,
      remediation,
      summary: this.generateSummary(categorized, completeness),
    };
  }

  // Detect missing required sections
  private detectStructuralGaps(
    spec: ParsedMarkdown,
    codebase?: ParsedMarkdown
  ): Gap[] {
    const gaps: Gap[] = [];

    // Required sections for user-facing spec
    const requiredSpecSections = [
      { name: 'overview', severity: 'CRITICAL' },
      { name: 'problem-statement', severity: 'CRITICAL' },
      { name: 'requirements', severity: 'CRITICAL' },
      { name: 'acceptance-criteria', severity: 'HIGH' },
      { name: 'success-metrics', severity: 'HIGH' },
      { name: 'user-workflow', severity: 'MEDIUM' },
    ];

    for (const section of requiredSpecSections) {
      if (!spec.sections[section.name]) {
        gaps.push({
          id: `gap-spec-${section.name}`,
          severity: section.severity as Severity,
          category: 'gap',
          message: `Missing required section: ${section.name}`,
          artifacts: [options.specFile],
          remediation: `Add ${section.name} section with detailed content`,
        });
      }
    }

    // Required sections for technical codebase doc
    if (codebase) {
      const requiredCodebaseSections = [
        { name: 'architecture', severity: 'CRITICAL' },
        { name: 'type-system', severity: 'CRITICAL' },
        { name: 'components', severity: 'CRITICAL' },
        { name: 'cli-interface', severity: 'HIGH' },
        { name: 'error-handling', severity: 'CRITICAL' },
        { name: 'performance', severity: 'MEDIUM' },
      ];

      for (const section of requiredCodebaseSections) {
        if (!codebase.sections[section.name]) {
          gaps.push({
            id: `gap-codebase-${section.name}`,
            severity: section.severity as Severity,
            category: 'gap',
            message: `Missing implementation detail: ${section.name}`,
            artifacts: [options.codebaseFile!],
            remediation: `Add ${section.name} section with algorithms, interfaces, and code examples`,
          });
        }
      }
    }

    return gaps;
  }

  // Cross-artifact analysis for duplication, ambiguity, inconsistency
  private analyzeCrossArtifacts(
    spec: ParsedMarkdown,
    codebase: ParsedMarkdown
  ): Gap[] {
    const findings: Gap[] = [];

    // Check for requirement → component mapping
    const requirements = this.extractRequirements(spec);
    const components = this.extractComponents(codebase);

    for (const req of requirements) {
      const mapped = components.some(c =>
        c.description.toLowerCase().includes(req.toLowerCase())
      );

      if (!mapped) {
        findings.push({
          id: `gap-unmapped-req-${req}`,
          severity: 'HIGH',
          category: 'gap',
          message: `Requirement "${req}" not mapped to any component`,
          artifacts: ['spec.md', 'codebase.md'],
          remediation: 'Add component specification for this requirement',
        });
      }
    }

    // Check for component → interface definitions
    for (const component of components) {
      if (!codebase.code.some(code => code.includes(`interface ${component.name}`))) {
        findings.push({
          id: `gap-no-interface-${component.name}`,
          severity: 'MEDIUM',
          category: 'gap',
          message: `Component "${component.name}" has no TypeScript interface defined`,
          artifacts: ['codebase.md'],
          remediation: `Add interface definition for ${component.name}`,
        });
      }
    }

    return findings;
  }

  // Validate completeness of key sections
  private validateCompleteness(
    spec: ParsedMarkdown,
    codebase?: ParsedMarkdown
  ): Gap[] {
    const gaps: Gap[] = [];

    // Validate acceptance criteria completeness
    const criteria = spec.sections['acceptance-criteria'];
    if (criteria && criteria.length < 3) {
      gaps.push({
        id: 'gap-insufficient-criteria',
        severity: 'MEDIUM',
        category: 'gap',
        message: 'Insufficient acceptance criteria (found: ${criteria.length}, recommended: ≥5)',
        artifacts: ['spec.md'],
        remediation: 'Add more specific, testable acceptance criteria',
      });
    }

    // Validate success metrics
    const metrics = spec.sections['success-metrics'];
    if (metrics && !metrics.includes('quantitative')) {
      gaps.push({
        id: 'gap-no-quantitative-metrics',
        severity: 'HIGH',
        category: 'gap',
        message: 'No quantitative success metrics defined',
        artifacts: ['spec.md'],
        remediation: 'Add measurable, quantitative success metrics (e.g., performance targets, coverage %)',
      });
    }

    return gaps;
  }

  // Calculate completeness score
  private calculateCompleteness(gaps: Gap[]): number {
    const weights = {
      CRITICAL: 25,
      HIGH: 10,
      MEDIUM: 5,
      LOW: 2,
    };

    const totalPossibleScore = 100;
    const deductions = gaps.reduce((sum, gap) =>
      sum + weights[gap.severity], 0
    );

    return Math.max(0, totalPossibleScore - deductions);
  }

  // Generate remediation steps
  private generateRemediation(gaps: Gap[]): RemediationStep[] {
    // Group gaps by severity
    const bySeverity = {
      CRITICAL: gaps.filter(g => g.severity === 'CRITICAL'),
      HIGH: gaps.filter(g => g.severity === 'HIGH'),
      MEDIUM: gaps.filter(g => g.severity === 'MEDIUM'),
      LOW: gaps.filter(g => g.severity === 'LOW'),
    };

    const steps: RemediationStep[] = [];

    // Critical gaps first
    bySeverity.CRITICAL.forEach((gap, i) => {
      steps.push({
        priority: 'CRITICAL',
        order: i + 1,
        action: gap.remediation || `Fix: ${gap.message}`,
        reasoning: `Critical gap prevents successful decomposition: ${gap.message}`,
        artifacts: gap.artifacts,
      });
    });

    // Then high priority
    bySeverity.HIGH.forEach((gap, i) => {
      steps.push({
        priority: 'HIGH',
        order: bySeverity.CRITICAL.length + i + 1,
        action: gap.remediation || `Fix: ${gap.message}`,
        reasoning: gap.message,
        artifacts: gap.artifacts,
      });
    });

    return steps;
  }

  // Generate markdown report
  async generateReport(report: AnalysisReport, outputFile: string): Promise<void> {
    const markdown = `
# Specification Analysis Report

**Completeness Score**: ${report.completeness}% ${report.completeness === 100 ? '✓' : ''}

${report.completeness < 100 ? `
## Issues Found

### Critical (${report.gaps.filter(g => g.severity === 'CRITICAL').length})
${report.gaps.filter(g => g.severity === 'CRITICAL').map(g => `
- **${g.id}**: ${g.message}
  - **Remediation**: ${g.remediation}
  - **Artifacts**: ${g.artifacts.join(', ')}
`).join('\n')}

### High Priority (${report.gaps.filter(g => g.severity === 'HIGH').length})
${report.gaps.filter(g => g.severity === 'HIGH').map(g => `
- **${g.id}**: ${g.message}
  - **Remediation**: ${g.remediation}
  - **Artifacts**: ${g.artifacts.join(', ')}
`).join('\n')}
` : ''}

## Remediation Steps

${report.remediation.map(step => `
${step.order}. **[${step.priority}]** ${step.action}
   - Reasoning: ${step.reasoning}
   - Files: ${step.artifacts.join(', ')}
`).join('\n')}

${report.completeness === 100 ? `
## ✓ Ready for Decomposition

The specification is complete and ready for task decomposition.
` : `
## Next Steps

1. Address CRITICAL gaps first (blocks decomposition)
2. Fix HIGH priority gaps (reduces quality)
3. Re-run analysis: \`chopstack analyze --spec <file>\`
`}
    `.trim();

    await fs.writeFile(outputFile, markdown);
  }
}

// Types
interface AnalysisReport {
  completeness: number;       // 0-100
  gaps: Gap[];
  remediation: RemediationStep[];
  summary: string;
}

interface Gap {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'gap' | 'duplication' | 'ambiguity' | 'inconsistency';
  message: string;
  artifacts: string[];
  remediation?: string;
}

interface RemediationStep {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  order: number;
  action: string;
  reasoning: string;
  artifacts: string[];
}

interface ParsedMarkdown {
  sections: Record<string, string>;
  code: string[];
  requirements: string[];
}
```

**Usage Example**:
```typescript
const analyzer = new SpecificationAnalyzer();

const report = await analyzer.analyze({
  specFile: 'dark-mode.md',
  codebaseFile: 'dark-mode-impl.md',
  outputFile: 'gap-report.md',
});

console.log(`Completeness: ${report.completeness}%`);
console.log(`Issues: ${report.gaps.length}`);

if (report.completeness === 100) {
  console.log('✓ Ready for decomposition');
} else {
  console.log('Fix gaps before decomposition:');
  report.remediation.forEach(step => {
    console.log(`  ${step.order}. [${step.priority}] ${step.action}`);
  });
}
```

---

### 7. Validation Engine

**Module**: `src/services/execution/validation-engine.ts`

**Purpose**: Comprehensive post-execution validation with cross-artifact analysis and principle checking.

**Core Algorithm**:

```typescript
export class ValidationEngine {
  async validate(plan: PlanV2, spec: string, cwd: string): Promise<ValidationReport> {
    // Step 1: Validate acceptance criteria
    const criteriaResults = await this.validateCriteria(plan, cwd);

    // Step 2: Assess success metrics
    const metrics = await this.assessMetrics(plan, cwd);

    // Step 3: Cross-artifact analysis
    const crossArtifactFindings = await this.analyzeCrossArtifacts(plan, spec);

    // Step 4: Project principles validation
    const principles = await this.discoverPrinciples(cwd);
    const principleViolations = await this.checkPrinciples(principles, cwd);

    // Step 5: Generate report
    return this.generateReport({
      criteriaResults,
      metrics,
      crossArtifactFindings,
      principleViolations,
    });
  }

  // Cross-artifact analysis algorithm
  private async analyzeCrossArtifacts(plan: PlanV2, spec: string): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];

    // Duplication detection
    const taskDescriptions = plan.tasks.map(t => t.description);
    for (let i = 0; i < taskDescriptions.length; i++) {
      for (let j = i + 1; j < taskDescriptions.length; j++) {
        const similarity = calculateSimilarity(taskDescriptions[i], taskDescriptions[j]);
        if (similarity > 0.8) {
          findings.push({
            id: `dup-${i}-${j}`,
            severity: 'MEDIUM',
            category: 'duplication',
            message: `Tasks ${i} and ${j} appear to duplicate work`,
            artifacts: [plan.tasks[i].id, plan.tasks[j].id],
            remediation: 'Consider merging these tasks or clarifying their distinct purposes',
          });
        }
      }
    }

    // Gap detection (requirements not mapped to tasks)
    const specRequirements = extractRequirements(spec);
    const taskCoverage = plan.tasks.flatMap(t => t.acceptance_criteria);

    for (const req of specRequirements) {
      if (!taskCoverage.some(c => c.includes(req))) {
        findings.push({
          id: `gap-${req}`,
          severity: 'HIGH',
          category: 'gap',
          message: `Requirement "${req}" not covered by any task`,
          artifacts: [spec],
          remediation: 'Add task to implement this requirement',
        });
      }
    }

    return findings;
  }

  // Project principles discovery
  private async discoverPrinciples(cwd: string): Promise<ProjectPrinciples[]> {
    const principleFiles = ['CLAUDE.md', '.cursorrules', 'CONTRIBUTING.md', '.github/CODING_STANDARDS.md'];
    const principles: ProjectPrinciples[] = [];

    for (const file of principleFiles) {
      const path = `${cwd}/${file}`;
      if (await fs.pathExists(path)) {
        const content = await fs.readFile(path, 'utf-8');
        principles.push({
          source: file,
          principles: this.extractPrinciplesFromMarkdown(content),
        });
      }
    }

    return principles;
  }

  // Severity calculation
  private calculateSeverity(violation: string, context: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Critical: Security, data loss, breaking changes
    if (violation.includes('security') || violation.includes('breaking')) {
      return 'CRITICAL';
    }

    // High: Architecture violations, missing tests
    if (violation.includes('architecture') || violation.includes('test')) {
      return 'HIGH';
    }

    // Medium: Code style, naming conventions
    if (violation.includes('style') || violation.includes('naming')) {
      return 'MEDIUM';
    }

    return 'LOW';
  }
}

```

---

## Error Handling & Recovery

### Task Failure Handling

**Retry Strategy**:
```typescript
interface RetryConfig {
  maxAttempts: 3;
  backoff: 'exponential';  // 1s, 2s, 4s
  retryableErrors: [
    'AGENT_TIMEOUT',
    'NETWORK_ERROR',
    'TRANSIENT_FAILURE'
  ];
  nonRetryableErrors: [
    'VALIDATION_ERROR',
    'FILE_NOT_FOUND',
    'PERMISSION_DENIED'
  ];
}
```

**Failure Recovery**:
1. **Task fails**: Log error, mark task as failed
2. **Check retry eligibility**: Transient error? Attempts remaining?
3. **Retry with backoff**: Wait exponentially, retry task
4. **Permanent failure**: If max attempts reached:
   - Mark task as failed
   - Emit failure event
   - Decision: Continue with remaining tasks OR abort phase

**Phase Failure Handling**:

**Sequential Phase**:
- Task fails → Abort remaining tasks in phase
- Emit phase failure event
- Options:
  - `--continue-on-error`: Skip failed task, continue with next
  - Default: Abort entire plan execution

**Parallel Phase**:
- Task fails → Other tasks continue execution
- Wait for all tasks to complete
- If any failed → Phase marked as failed
- Options:
  - `--partial-success`: Commit successful tasks, report failures
  - Default: Rollback entire phase (discard all worktrees)

### Worktree Cleanup

**Automatic Cleanup**:
```typescript
class WorktreeManager {
  async cleanupOnSuccess(taskId: string): Promise<void> {
    // 1. Merge branch to main
    await git.checkout('main');
    await git.merge(`chopstack-${taskId}`);

    // 2. Remove worktree
    await git.worktree.remove(`chopstack-${taskId}`);

    // 3. Delete branch
    await git.branch(['-D', `chopstack-${taskId}`]);
  }

  async cleanupOnFailure(taskId: string): Promise<void> {
    // 1. Remove worktree (without merging)
    await git.worktree.remove(`chopstack-${taskId}`, { force: true });

    // 2. Delete branch
    await git.branch(['-D', `chopstack-${taskId}`]);

    // 3. Log abandoned changes (for manual review)
    logger.warn(`Task ${taskId} failed. Changes discarded.`);
  }

  async emergencyCleanup(): Promise<void> {
    // Called on process termination (SIGINT, SIGTERM)
    const worktrees = await git.worktree.list();

    for (const wt of worktrees) {
      if (wt.branch.startsWith('chopstack-')) {
        await this.cleanupOnFailure(extractTaskId(wt.branch));
      }
    }
  }
}
```

**Cleanup Triggers**:
- Task success → `cleanupOnSuccess()`
- Task failure → `cleanupOnFailure()`
- Process exit → `emergencyCleanup()` (signal handler)
- Manual abort (Ctrl+C) → `emergencyCleanup()`

### Partial Success Handling

**Scenario**: Phase with 5 parallel tasks, 3 succeed, 2 fail

**Strategy 1: Rollback All (Default)**
```typescript
if (failedTasks.length > 0) {
  // Discard all worktrees (including successful ones)
  await Promise.all(allTasks.map(t => worktreeManager.cleanupOnFailure(t.id)));

  throw new PhaseExecutionError(`Phase failed: ${failedTasks.length} tasks failed`);
}
```

**Strategy 2: Partial Commit (with `--partial-success` flag)**
```typescript
if (failedTasks.length > 0) {
  // Commit successful tasks
  await Promise.all(
    successfulTasks.map(t => worktreeManager.cleanupOnSuccess(t.id))
  );

  // Discard failed tasks
  await Promise.all(
    failedTasks.map(t => worktreeManager.cleanupOnFailure(t.id))
  );

  // Report partial success
  logger.warn(`Phase partially complete: ${successfulTasks.length}/${allTasks.length} tasks succeeded`);

  // Generate recovery plan
  const recoveryPlan = generateRecoveryTasks(failedTasks);
  await fs.writeFile('.chopstack/recovery-plan.yaml', recoveryPlan);
}
```

### Error Context & Reporting

**Structured Error Information**:
```typescript
interface TaskExecutionError extends Error {
  taskId: string;
  taskName: string;
  phase: string;
  errorType: 'VALIDATION' | 'RUNTIME' | 'TIMEOUT' | 'NETWORK';
  agentOutput?: string;
  stackTrace?: string;
  recoveryHint?: string;
}
```

**User-Facing Error Messages**:
```typescript
function formatUserError(error: TaskExecutionError): string {
  return `
❌ Task Failed: ${error.taskName} (${error.taskId})

Phase: ${error.phase}
Error Type: ${error.errorType}

${error.message}

${error.agentOutput ? `
Agent Output:
${error.agentOutput}
` : ''}

${error.recoveryHint ? `
💡 Recovery Hint: ${error.recoveryHint}
` : ''}

Retry with: chopstack run --plan <plan> --resume-from ${error.taskId}
  `;
}
```

### Resume From Checkpoint

**Checkpoint Strategy**:
```typescript
interface ExecutionCheckpoint {
  planFile: string;
  completedPhases: string[];
  completedTasks: string[];
  failedTask?: string;
  timestamp: string;
}

// Save checkpoint after each task
async function saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
  await fs.writeFile(
    '.chopstack/checkpoint.json',
    JSON.stringify(checkpoint, null, 2)
  );
}

// Resume from checkpoint
async function resumeExecution(planFile: string): Promise<void> {
  const checkpoint = await loadCheckpoint();

  // Skip completed tasks
  const remainingTasks = plan.tasks.filter(
    t => !checkpoint.completedTasks.includes(t.id)
  );

  logger.info(`Resuming from checkpoint. ${remainingTasks.length} tasks remaining.`);

  await executeTasks(remainingTasks);
}
```

**CLI Flag**: `--resume` or `--resume-from <task-id>`

---

## File Structure (v2)

```
src/
├── services/
│   ├── analysis/
│   │   ├── __tests__/
│   │   │   ├── codebase-analyzer.test.ts
│   │   │   └── specification-analyzer.test.ts
│   │   ├── codebase-analyzer.ts
│   │   └── specification-analyzer.ts
│   │
│   ├── planning/
│   │   ├── __tests__/
│   │   │   ├── prompts-v2.test.ts
│   │   │   ├── phase-detector.test.ts
│   │   │   └── plan-generator-v2.test.ts
│   │   ├── templates/
│   │   │   ├── feature-spec.md
│   │   │   ├── refactor-spec.md
│   │   │   └── bugfix-spec.md
│   │   ├── prompts-v2.ts
│   │   ├── phase-detector.ts
│   │   ├── plan-generator-v2.ts
│   │   └── template-engine.ts
│   │
│   ├── execution/
│   │   ├── __tests__/
│   │   │   ├── phase-executor.test.ts
│   │   │   └── validation-engine.test.ts
│   │   ├── phase-executor.ts
│   │   └── validation-engine.ts
│   │
│   └── validation/
│       ├── __tests__/
│       │   └── criteria-checker.test.ts
│       └── criteria-checker.ts
│
├── types/
│   ├── __tests__/
│   │   └── schemas-v2.test.ts
│   └── schemas-v2.ts
│
├── commands/
│   ├── __tests__/
│   │   ├── specify.test.ts
│   │   ├── analyze.test.ts
│   │   ├── decompose-v2.test.ts
│   │   ├── run-v2.test.ts
│   │   └── validate.test.ts
│   ├── specify.ts
│   ├── analyze.ts
│   ├── decompose-v2.ts
│   ├── run-v2.ts
│   └── validate.ts
│
└── ui/
    ├── __tests__/
    │   └── phase-tree-view.test.ts
    ├── phase-tree-view.ts
    ├── phase-progress.ts
    └── validation-report.ts
```

**Removed from v1:**
- `src/services/planning/prompts.ts` (replaced with prompts-v2.ts)
- `src/services/planning/plan-generator.ts` (replaced with plan-generator-v2.ts)
- `src/types/decomposer.ts` (replaced with schemas-v2.ts)

---

## Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Schema v2 and core type system

**Tasks:**
1. Design and implement v2 schemas (phases, tasks, metrics)
2. Create Zod validators with cross-validation
3. Generate TypeScript types from schemas
4. Remove all v1 types from codebase
5. Update imports throughout

**Deliverable:** Complete v2 type system, no v1 remnants

### Phase 2: Specification Expansion & Analysis (Weeks 3-6)

**Goal:** `chopstack specify` and `chopstack analyze` commands

**Tasks:**
1. Implement codebase analyzer
2. Create specification templates
3. Build template engine
4. Implement `chopstack specify` command
5. Create agent prompts for spec expansion
6. **Implement specification analyzer** (NEW)
7. **Build gap detection algorithms** (NEW)
8. **Implement `chopstack analyze` command** (NEW)
9. Add testing for both commands

**Deliverable:**
- `chopstack specify` generates rich specs
- `chopstack analyze` validates spec completeness with gap reports

### Phase 3: Decomposition v2 (Weeks 7-9)

**Goal:** Phase-based planning from rich specs

**Tasks:**
1. Write decomposition prompts v2 (5-phase workflow)
2. Implement phase detection algorithm
3. Update decompose command for v2
4. Enhance conflict resolution (inject into Phase 3)
5. Generate acceptance criteria from spec
6. Extract success metrics
7. Add testing

**Deliverable:** `chopstack decompose` produces phase-based plans

### Phase 4: Execution v2 (Weeks 10-11)

**Goal:** Phase-aware execution engine with spec context injection

**Tasks:**
1. Implement phase execution engine
2. Phase DAG parsing and sorting
3. Sequential/parallel task execution within phases
4. Worktree strategy per phase
5. **Context injection system**:
   - Add `--spec` flag to run command
   - Load spec file and create ExecutionContext
   - Pass context to PhaseExecutor constructor
   - Implement `buildTaskPromptWithContext()` method
   - Enrich every agent prompt with full spec content
6. Progress tracking and events
7. Add testing (including context injection tests)

**Deliverable:** Phase-aware parallel execution with rich context

### Phase 5: TUI v2 (Weeks 12-13)

**Goal:** Phase visualization

**Tasks:**
1. Design phase tree view
2. Implement progress bars per phase
3. Add strategy indicators
4. Animate phase transitions
5. Update status panel
6. Add testing

**Deliverable:** Intuitive phase-based UI

### Phase 6: Validation Mode (Weeks 14-15)

**Goal:** Acceptance criteria and metrics validation

**Tasks:**
1. Implement criteria checker (agent-based)
2. Build success metrics validator
3. Create validation report generator
4. Add `--validate` flag to run command
5. Integrate with TUI
6. Add testing

**Deliverable:** `chopstack run --validate` checks quality

### Phase 7: Integration & Polish (Weeks 16-17)

**Goal:** Production-ready v2.0.0

**Tasks:**
1. E2E testing (specify → **analyze** → decompose → run → validate)
2. Update CLAUDE.md with v2 patterns
3. CLI documentation
4. Phase syntax reference
5. Migration guide (conceptual, no tool)
6. Examples and tutorials
7. Performance optimization
8. Final QA

**Deliverable:** Chopstack v2.0.0 release

---

## Performance Considerations

### Specification Size Limits

**Recommended Limits**:
- **Spec file size**: <50KB markdown (~10,000 lines)
- **Token count**: <100K tokens (including code examples)
- **Max components**: <20 major components per spec

**Rationale**:
- Claude's context window: 200K tokens
- Need headroom for: agent prompt (~5K) + codebase analysis (~20K) + task context (~10K) + conversation history (~10K)
- Effective spec budget: ~155K tokens → ~50KB markdown

**Large Spec Handling**:

```typescript
interface SpecChunkingStrategy {
  // Strategy 1: Hierarchical chunking (preferred)
  hierarchical: {
    // Send overview + relevant sections only
    sections: ['overview', 'architecture', 'current-task-related-requirements'];
    maxTokens: 100_000;
  };

  // Strategy 2: Progressive loading
  progressive: {
    // Load spec sections on-demand as tasks reference them
    cache: Map<string, string>;  // section → content
    loadOnDemand: true;
  };

  // Strategy 3: Spec summarization
  summarization: {
    // Use agent to summarize large specs
    targetTokens: 50_000;
    preserveSections: ['architecture', 'acceptance-criteria', 'success-metrics'];
  };
}
```

**Token Budget Management**:

```typescript
class TokenBudgetManager {
  private readonly MAX_CONTEXT_TOKENS = 180_000;  // Leave 20K headroom

  async buildPromptWithinBudget(
    task: TaskV2,
    specContent: string,
    codebaseAnalysis: CodebaseAnalysis
  ): Promise<string> {
    // 1. Count tokens
    const specTokens = this.countTokens(specContent);
    const analysisTokens = this.countTokens(JSON.stringify(codebaseAnalysis));
    const taskTokens = this.countTokens(task.description);
    const promptOverhead = 5000;  // Agent instructions, formatting

    const totalTokens = specTokens + analysisTokens + taskTokens + promptOverhead;

    // 2. If within budget, return full prompt
    if (totalTokens <= this.MAX_CONTEXT_TOKENS) {
      return this.buildFullPrompt(task, specContent, codebaseAnalysis);
    }

    // 3. Otherwise, apply reduction strategies
    const reducedSpec = await this.reduceSpecContent(
      specContent,
      task,
      this.MAX_CONTEXT_TOKENS - (analysisTokens + taskTokens + promptOverhead)
    );

    return this.buildFullPrompt(task, reducedSpec, codebaseAnalysis);
  }

  private async reduceSpecContent(
    spec: string,
    task: TaskV2,
    targetTokens: number
  ): Promise<string> {
    // Strategy: Extract task-relevant sections only
    const sections = this.parseSpecSections(spec);

    // Always include: overview, architecture, acceptance criteria
    const coreSections = [
      sections.overview,
      sections.architecture,
      sections.acceptanceCriteria,
      sections.successMetrics,
    ].join('\n\n');

    // Add task-related requirements
    const relevantRequirements = sections.requirements.filter(req =>
      task.files.some(file => req.includes(file) || req.includes(task.name))
    );

    const reduced = `${coreSections}\n\n## Relevant Requirements\n${relevantRequirements.join('\n')}`;

    // If still too large, summarize
    if (this.countTokens(reduced) > targetTokens) {
      return await this.summarizeSpec(reduced, targetTokens);
    }

    return reduced;
  }
}
```

### Caching Strategy

**Spec Content Caching**:
```typescript
class SpecCache {
  private cache = new Map<string, { content: string; tokens: number; timestamp: number }>();

  async getOrLoad(specFile: string): Promise<string> {
    const cached = this.cache.get(specFile);

    // Cache hit if file unchanged
    if (cached && await this.isFileUnchanged(specFile, cached.timestamp)) {
      return cached.content;
    }

    // Cache miss: load and cache
    const content = await fs.readFile(specFile, 'utf-8');
    const tokens = countTokens(content);

    this.cache.set(specFile, {
      content,
      tokens,
      timestamp: Date.now(),
    });

    return content;
  }

  private async isFileUnchanged(file: string, cachedTimestamp: number): Promise<boolean> {
    const stats = await fs.stat(file);
    return stats.mtimeMs <= cachedTimestamp;
  }
}
```

**Codebase Analysis Caching**:
```typescript
// Cache codebase analysis to avoid re-scanning
class AnalysisCache {
  private cacheDir = '.chopstack/cache';

  async getCachedAnalysis(cwd: string): Promise<CodebaseAnalysis | null> {
    const cacheFile = `${this.cacheDir}/analysis-${hashDirectory(cwd)}.json`;

    if (await fs.pathExists(cacheFile)) {
      const cached = await fs.readJSON(cacheFile);

      // Invalidate if files changed
      if (await this.hasFilesChanged(cwd, cached.timestamp)) {
        return null;
      }

      return cached.analysis;
    }

    return null;
  }

  async saveAnalysis(cwd: string, analysis: CodebaseAnalysis): Promise<void> {
    const cacheFile = `${this.cacheDir}/analysis-${hashDirectory(cwd)}.json`;

    await fs.writeJSON(cacheFile, {
      analysis,
      timestamp: Date.now(),
    });
  }
}
```

### Parallel Execution Performance

**Worktree Overhead**:
- Worktree creation: ~100-200ms per worktree
- Parallel worktrees: Limited by disk I/O (recommend max 10 concurrent)

**Optimization Strategies**:

```typescript
class WorktreePool {
  private readonly MAX_CONCURRENT_WORKTREES = 10;
  private activeWorktrees = 0;
  private queue: Array<() => Promise<void>> = [];

  async executeWithWorktree<T>(
    taskId: string,
    fn: (worktreePath: string) => Promise<T>
  ): Promise<T> {
    // Wait if at capacity
    await this.waitForSlot();

    this.activeWorktrees++;

    try {
      const worktree = await this.createWorktree(taskId);
      return await fn(worktree.path);
    } finally {
      this.activeWorktrees--;
      this.processQueue();
    }
  }

  private async waitForSlot(): Promise<void> {
    if (this.activeWorktrees < this.MAX_CONCURRENT_WORKTREES) {
      return;
    }

    return new Promise(resolve => {
      this.queue.push(async () => resolve());
    });
  }

  private processQueue(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
```

**Phase Transition Overhead**:
- Target: <500ms per phase transition
- Optimize: Batch git operations, minimize disk I/O

```typescript
// Batch git operations for efficiency
async function optimizedPhaseTransition(fromPhase: Phase, toPhase: Phase): Promise<void> {
  // 1. Batch cleanup previous phase worktrees
  await git.worktree.prune();

  // 2. Pre-create next phase worktrees in parallel (if known)
  if (toPhase.strategy === 'parallel') {
    await Promise.all(
      toPhase.tasks.slice(0, MAX_CONCURRENT_WORKTREES).map(taskId =>
        git.worktree.add(`chopstack-${taskId}`, { newBranch: taskId })
      )
    );
  }

  // 3. Emit transition event
  eventBus.emitPhaseTransition(fromPhase.id, toPhase.id);
}
```

### Memory Management

**Large Plan Handling**:
```typescript
// Stream large plans instead of loading entirely into memory
async function* streamTasks(planFile: string): AsyncGenerator<TaskV2> {
  const stream = fs.createReadStream(planFile);
  const rl = readline.createInterface({ input: stream });

  let currentTask: Partial<TaskV2> = {};

  for await (const line of rl) {
    // Parse YAML incrementally
    if (line.startsWith('- id:')) {
      if (currentTask.id) {
        yield currentTask as TaskV2;
      }
      currentTask = {};
    }

    // ... parse task fields
  }

  if (currentTask.id) {
    yield currentTask as TaskV2;
  }
}
```

**Agent Response Streaming**:
```typescript
// Stream agent responses instead of buffering
async function* streamAgentResponse(
  agent: Agent,
  prompt: string
): AsyncGenerator<string> {
  const stream = await agent.executeStreaming(prompt);

  for await (const chunk of stream) {
    yield chunk;

    // Update TUI in real-time
    eventBus.emitStreamData(taskId, chunk);
  }
}
```

### Performance Benchmarks

**Target Metrics** (from spec.md):
- Specification generation: <30s
- Decomposition: <60s
- Phase transition overhead: <500ms
- TUI rendering: 60fps

**Monitoring**:
```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  track<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();

    return fn().finally(() => {
      const duration = performance.now() - start;

      if (!this.metrics.has(operation)) {
        this.metrics.set(operation, []);
      }

      this.metrics.get(operation)!.push(duration);

      // Warn if exceeding targets
      if (operation === 'phase-transition' && duration > 500) {
        logger.warn(`Phase transition slow: ${duration}ms (target: <500ms)`);
      }
    });
  }

  report(): PerformanceReport {
    const report: PerformanceReport = {};

    for (const [operation, durations] of this.metrics) {
      report[operation] = {
        count: durations.length,
        avg: durations.reduce((a, b) => a + b) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        p95: percentile(durations, 0.95),
      };
    }

    return report;
  }
}
```

---

## Code Quality Standards

### TypeScript Guidelines

- Use `type` over `interface` for simple shapes
- All public functions must have explicit return types
- Use `const assertions` and `as const` for immutable data
- Import file extensions are omitted (handled by build system)
- Strict naming: camelCase for functions, PascalCase for types, kebab-case for files
- **ALWAYS use `utils/guards.ts`** for type guards instead of inline checks
- Follow `@typescript-eslint/naming-convention` including leading underscore for private members
- Avoid non-null assertions (`!`) and use `isNonNullish()` instead

### Pattern Matching

**ALWAYS use ts-pattern for complex conditional logic** instead of switch statements or if/else chains:

```typescript
import { match, P } from 'ts-pattern';

// For command handling
const result = match(command)
  .with({ type: 'init' }, (cmd) => handleInit(cmd))
  .with({ type: 'stack' }, (cmd) => handleStack(cmd))
  .exhaustive();

// For error handling
const response = match(error)
  .with({ code: 'ENOENT' }, () => 'File not found')
  .with(P.instanceOf(GitError), (err) => `Git error: ${err.message}`)
  .otherwise(() => 'Unknown error');
```

### Testing

- **Very Strict TypeScript**: All strict flags enabled, no `any`, explicit function return types required
- **No Default Exports**: Use named exports throughout (except for config files)
- **Pattern Exhaustiveness**: All pattern matches must be exhaustive
- **Modern JavaScript**: Prefer modern APIs, avoid legacy patterns
- **Functional Approach**: Pure functions preferred, avoid mutations where possible

---

## Related Documentation

- **User Requirements**: [spec.md](./spec.md)
- **Spec-Kit Research**: https://github.com/github/spec-kit
- **Commitment Emergent Plan Example**: ~/projects/commitment/.speckit/type-safety-refactor.plan.yaml
