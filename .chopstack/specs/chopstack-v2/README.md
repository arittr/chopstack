# Chopstack v2.0.0 - Phase-Based Task Decomposition

Transform chopstack from a basic task decomposition tool into an intelligent, specification-driven workflow system.

## Core Documents

- **[spec.md](./spec.md)** - Feature specification with requirements, user workflows, and success criteria
- **[plan.yaml](./plan.yaml)** - Phase 1 & 2 execution plan with t-shirt size complexity
- **[codebase.md](./codebase.md)** - Architecture, components, and implementation patterns (82KB)

## Key Features

### 1. Pre-Decomposition Gate (Open Questions)
**BLOCKS** decomposition if spec has unresolved "Open Tasks/Questions" section. Forces audits and architecture decisions to be resolved during analyze phase, preventing plan expansion during execution.

### 2. T-Shirt Size Complexity
Uses `complexity: XS | S | M | L | XL` instead of hour estimates:
- **XS** (< 1h): Fold into related task
- **S** (1-2h): Quick wins
- **M** (2-4h): Target size
- **L** (4-8h): Use sparingly
- **XL** (> 8h): Must split

### 3. Post-Generation Validation (Task Quality)
Automatic quality validation runs AFTER plan generation, catches oversized tasks (XL), vague patterns, and complexity issues BEFORE execution.

### 4. Phase-Based Execution
Clear phase hierarchy with parallel execution opportunities:
- Phase 1: Foundation (XL + L + M)
- Phase 2: Migration (4 sub-phases, parallelizable)

## Current Plan Status

**Phase 1 & 2 Complete**: The `plan.yaml` demonstrates correct decomposition for foundation and type migration phases.

**Task Distribution**:
- 0 XS (correctly folded)
- 2 S (9%, quick tasks)
- 8 M (62%, ideal!)
- 2 L (15%, acceptable)
- 1 XL (8%, justified for foundation)

**Prerequisites**: Complete v1 type audit (see spec.md "Open Tasks/Questions") before execution.

## Execution Workflow

The `prompts/` directory contains reusable templates for agent-based execution:

- **[prompts/task-execution-template.md](./prompts/task-execution-template.md)** - Prompt template for autonomous task execution
- **[notes/agent-execution-guide.md](./notes/agent-execution-guide.md)** - **EXECUTION GUIDE** - How to execute phases using agents

**Agent-Based Execution**: Before chopstack v2 is built, we execute phases using autonomous agents that self-extract tasks from plan.yaml. This approach:
- Tests the complete v2 workflow (specify → analyze → decompose → execute)
- Validates that plans are clear and actionable
- Proves the two-gate system prevents questions and scope creep
- Dogfoods the v2 process while building v2

See the [agent execution guide](./notes/agent-execution-guide.md) for detailed instructions.

## Supplemental Documentation

The `notes/` directory contains research and planning artifacts:

- **[notes/process-gates.md](./notes/process-gates.md)** - **START HERE** - Visual guide to the two-gate process
- **[notes/agent-execution-guide.md](./notes/agent-execution-guide.md)** - How to execute phases using the template
- **[notes/decomposition-improvements.md](./notes/decomposition-improvements.md)** - Analysis of planning issues and solutions
- **[notes/v1-type-migration-audit.md](./notes/v1-type-migration-audit.md)** - V1 type usage audit (answers "Open Tasks/Questions")
- **[notes/plan-original.yaml](./notes/plan-original.yaml)** - Original v2 plan (75KB, 680 hours, 70+ tasks)

## Quick Start

### Using Chopstack v2 (Future)

When chopstack v2 is built:

1. Review `spec.md` for requirements and open questions
2. Complete prerequisites (v1 type audit)
3. Review `plan.yaml` for execution structure
4. Run with `chopstack run --plan plan.yaml --spec spec.md`

### Using Agent-Based Execution (Current)

Before chopstack v2 is built, execute phases using the slash command:

```bash
# Execute any phase from plan.yaml
/execute-phase 2.1

# The orchestrator will:
# 1. Parse the phase from plan.yaml
# 2. Verify prerequisites
# 3. Spawn autonomous agents for each task (sequential or parallel)
# 4. Verify commits and run tests
# 5. Report completion summary
```

**How it works:**
- Slash command reads plan.yaml and spawns Task tool agents
- Sequential phases execute one task at a time
- Parallel phases execute multiple tasks concurrently
- Each task agent self-extracts from plan.yaml
- Automatic commit verification and test execution

See `notes/agent-execution-guide.md` for details on the execution pattern.

## Related Documentation

- **CLAUDE.md** - Project coding standards and patterns
- **type-safety-refactor.plan.yaml** - Example of excellent plan structure
