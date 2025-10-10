# Specification: Chopstack v2.0.0 - Phase-Based Task Decomposition

**Status**: Draft
**Created**: 2025-10-09
**Epic**: Chopstack v2.0.0
**Related Issues**: SNU-120, SNU-121

## Overview

Transform chopstack from a basic task decomposition tool into an intelligent, specification-driven workflow system that combines spec-kit's specification expansion with chopstack's parallel execution capabilities.

**No backward compatibility.** Clean v2 rebuild.

## Problem Statement

### Current State (v1)

Chopstack v1 works for simple decomposition but fails on complex features:

**Issues:**
- Brief prompts ("add dark mode") produce poor quality task breakdowns
- 3-5 file conflicts per plan, 40% first-attempt success rate
- Flat task lists with no logical grouping or execution phases
- No validation, acceptance criteria, or success metrics
- High retry rate due to conflicts and missing context

**Root Cause:** Agents receive minimal context → make poor decisions → conflicts and failures

### Desired State (v2)

Chopstack v2 combines the best of spec-kit and chopstack:

- **Rich specifications** - Transform brief intent into comprehensive specs with codebase analysis
- **Phase-based planning** - Organize tasks into logical phases (setup → implementation → polish)
- **Intelligent execution** - Context-aware parallel execution with zero conflicts
- **Validation framework** - Verify implementation against acceptance criteria and project principles

**Goals:**
- Reduce file conflicts to <1 per plan (70% reduction)
- Achieve 80% first-attempt success rate (100% improvement)
- Plans follow correct architectural ordering (DB → API → UI)

## Requirements

### 1. Specification Expansion (`chopstack specify`)

**Transform brief descriptions into rich, structured specifications.**

Input: `chopstack specify "add dark mode"`

Output: `dark-mode.md` containing:
- Overview & background with codebase analysis
- Functional requirements (FR1, FR2, FR3...)
- Non-functional requirements (performance, security...)
- Architecture diagrams (ASCII)
- Component specifications
- Acceptance criteria
- Success metrics (quantitative + qualitative)

**Why:** Agents need rich context to make good decisions about task structure and dependencies.

### 2. Specification Analysis (`chopstack analyze`)

**Validate specification completeness before decomposition.**

Input: `chopstack analyze --spec dark-mode.md --codebase dark-mode-impl.md`

Output: `gap-report.md` containing:
- Gap categorization (CRITICAL, HIGH, MEDIUM, LOW)
- Missing components, types, interfaces
- Incomplete sections
- Cross-artifact findings (duplication, ambiguity, inconsistency)
- Completeness score (0-100%)
- Prioritized remediation steps

**Why:** Catch specification gaps BEFORE decomposition to avoid incomplete task generation. Prevents the "garbage in, garbage out" problem where incomplete specs produce poor task breakdowns.

### 3. Phase-Based Planning (`chopstack decompose`)

**Decompose specifications into phase-organized task DAGs.**

Input: `chopstack decompose --spec dark-mode.md`

Output: `dark-mode.plan.yaml` with:

```yaml
phases:
  - id: setup
    strategy: sequential
    tasks: [create-types, create-context]

  - id: implementation
    strategy: parallel
    requires: [setup]
    tasks: [theme-provider, toggle-button, update-styles]

  - id: polish
    strategy: sequential
    requires: [implementation]
    tasks: [add-tests, update-docs]

tasks:
  - id: create-types
    name: Create Theme Types
    description: |
      Define TypeScript types for theme system.
      Why: All theme features depend on these type definitions.
    files: [src/types/theme.ts]
    acceptance_criteria:
      - Types exported for light/dark/system modes
      - ThemeContext type defined
    estimated_hours: 0.5
    dependencies: []

success_metrics:
  quantitative:
    - Test coverage: 100% for theme components
    - Performance: <50ms theme switch time
  qualitative:
    - Smooth visual transitions
    - Accessible theme controls (ARIA)
```

**Why:** Phase organization provides clear execution flow and enables intelligent parallel/sequential decisions.

### 4. Context-Aware Execution (`chopstack run`)

**Execute phases with full specification context.**

Command: `chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md`

Execution:
1. Parse phase DAG (setup → implementation → polish)
2. Execute setup phase sequentially (types, then context)
3. Execute implementation phase in parallel (3 worktrees)
4. Execute polish phase sequentially (tests, then docs)
5. Pass full spec to every agent execution for context

**Why:** Agents with full specification context make architecturally correct decisions.

### 5. Validation Mode (`chopstack run --validate`)

**Verify implementation against acceptance criteria and project principles.**

Features:
- **Acceptance Criteria Validation** - Agent checks each criterion
- **Success Metrics Assessment** - Verify quantitative and qualitative goals
- **Cross-Artifact Analysis** - Detect requirement gaps, duplication, ambiguity
- **Project Principles Validation** - Extract principles from CLAUDE.md, .cursorrules, etc. and verify compliance
- **Comprehensive Report** - Criteria passed/failed, metric scores, violations, next steps with priorities

**Why:** Automated validation catches issues before PR review.

### 6. Enhanced TUI

**Visualize phase-based execution.**

Features:
- Phase tree view (collapsible sections)
- Progress bars per phase
- Strategy indicators (sequential/parallel icons)
- Animated phase transitions
- Real-time status updates

**Why:** Humans need to understand execution flow at a glance.

## Success Criteria

### Must Have
- ✅ `chopstack specify` generates rich specs from brief prompts
- ✅ Codebase analyzer provides architectural context
- ✅ `chopstack analyze` validates spec completeness with gap detection
- ✅ Analysis reports categorize gaps by severity (CRITICAL/HIGH/MEDIUM/LOW)
- ✅ `chopstack decompose` produces phase-based plans
- ✅ Plans have <1 file conflict (baseline: ~3)
- ✅ 80% first-attempt success rate (baseline: 40%)
- ✅ Execution engine respects phases correctly
- ✅ TUI displays phases clearly
- ✅ Validation mode checks criteria and metrics

### Performance Targets
- Specification generation: <30s
- Specification analysis: <10s
- Decomposition: <60s
- Phase transition overhead: <500ms
- TUI rendering: 60fps

### Quality Targets
- Test coverage: 95% average
- Zero `any` types in production code
- All ESLint checks pass
- Plans follow DB → API → UI ordering

## Success Metrics

### Quantitative
- **Conflict Reduction**: <1 conflict per plan (70% reduction)
- **Success Rate**: 80% first-attempt (100% improvement)
- **Retry Reduction**: 60% fewer retries
- **Specification Quality**: 1000+ line specs from brief prompts

### Qualitative
- **Architectural Awareness**: Plans follow correct layered ordering
- **Task Quality**: Descriptions explain "why" not just "what"
- **Dependency Logic**: Minimal, logical dependencies only
- **Phase Clarity**: Execution flow is immediately understandable
- **Validation Usefulness**: Reports are actionable with clear next steps

## User Workflow

```bash
# 1. Generate rich specification
chopstack specify "add dark mode" --output dark-mode.md

# 2. Review and edit specification if needed
# (edit dark-mode.md)

# 3. Analyze specification for completeness
chopstack analyze --spec dark-mode.md
# Output: Completeness: 60% - 3 CRITICAL gaps, 2 HIGH priority gaps

# 4. Fix identified gaps
# (edit dark-mode.md based on analysis report)

# 5. Re-analyze until complete
chopstack analyze --spec dark-mode.md
# Output: Completeness: 100% - Ready for decomposition ✓

# 6. Decompose into phase-based plan
chopstack decompose --spec dark-mode.md --output dark-mode.plan.yaml

# 7. Review plan
# (edit dark-mode.plan.yaml if needed)

# 8. Execute with context injection
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md

# 9. Validate implementation
chopstack run --plan dark-mode.plan.yaml --validate
```

## Non-Goals

- ❌ Backward compatibility with v1 plans
- ❌ Support for non-phase-based plans in v2
- ❌ Migration tool (v1 → v2) - conceptual guide only
- ❌ Custom phase strategies in v2.0 (future enhancement)
- ❌ Multi-agent orchestration in v2.0 (future enhancement)

## Related Documentation

- **Technical Implementation**: See [codebase.md](./codebase.md) for architecture, components, implementation details, and context injection patterns
- **Spec-Kit Research**: https://github.com/github/spec-kit
