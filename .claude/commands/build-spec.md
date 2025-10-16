---
description: Generate comprehensive spec.md and codebase.md from initial requirements
---

ROLE: You are a specification generation orchestrator for chopstack v2.

YOUR JOB: Transform a brief initial requirements document into a comprehensive, execution-ready specification following chopstack v2 patterns.

## Input Format

User will specify: `/build-spec {initial-requirements-path}`

Examples:
- `/build-spec @.chopstack/specs/feature-x/initial.md` → Generate full spec in .chopstack/specs/feature-x/
- `/build-spec dark-mode-initial.md` → Generate spec in same directory

## Output Structure

For input: `.chopstack/specs/feature-x/initial.md`

Generate:
```
.chopstack/specs/feature-x/
├── spec.md              # Comprehensive specification
├── codebase.md          # Architecture and implementation context
└── notes/               # Supporting research and audits
    ├── audit-*.md       # Audit findings
    ├── research-*.md    # Research notes
    └── analysis-*.md    # Analysis artifacts
```

## Generation Process

### Step 1: Analyze Initial Requirements

Read the initial requirements document and extract:

1. **Core Intent**: What is the user trying to build?
2. **Scope Hints**: What's explicitly mentioned vs implied?
3. **Technology Context**: Frontend? Backend? Both?
4. **Complexity Signals**: Simple feature or architectural change?
5. **Open Questions**: What's unclear or needs investigation?

### Step 2: Generate Codebase Analysis

Use Task tool to spawn codebase analysis agent:

```
ROLE: You are a codebase analysis agent for chopstack v2.

YOUR JOB: Analyze the codebase to provide architectural context for the specification.

REQUIREMENTS: Read {initial-requirements-path}

ANALYSIS TASKS:

1. **Identify Relevant Components**:
   - Search for files/modules related to the requirements
   - Identify existing patterns and architectures
   - Find similar features for consistency
   - Map dependencies and integration points

2. **Technology Stack Assessment**:
   - Detect frameworks (React, Vue, Express, etc.)
   - Identify build tools (Webpack, Vite, tsup, etc.)
   - Note testing frameworks (Vitest, Jest, etc.)
   - Document linting/formatting setup
   - Check TypeScript configuration strictness

3. **Architecture Patterns**:
   - Identify architectural style (MVC, layered, clean architecture, etc.)
   - Document common patterns (factories, dependency injection, etc.)
   - Note naming conventions (camelCase, kebab-case, PascalCase)
   - Find type system patterns (Zod schemas, pure TS, etc.)
   - Document error handling approach

4. **Integration Points**:
   - Identify where new feature will integrate
   - Document existing APIs/interfaces
   - Note data flow patterns
   - Find test infrastructure integration points

5. **Code Quality Standards**:
   - Extract principles from CLAUDE.md, .cursorrules, etc.
   - Document testing requirements
   - Note code style requirements
   - Identify performance expectations

OUTPUT FORMAT:

Create `codebase.md` following this structure:

```markdown
# Codebase Context: {Feature Name}

**Generated**: {date}
**For Specification**: {spec-name}

## Project Overview

**Name**: {project-name}
**Type**: {CLI tool | Web app | Library | etc.}
**Language**: TypeScript (Node.js {version})
**Build Tool**: {tsup | webpack | vite | etc.}
**Package Manager**: {pnpm | npm | yarn}

## Technology Stack

### Core Technologies
- **Runtime**: Node.js {version}+ / Browser
- **Language**: TypeScript {version} (strict mode: {enabled/disabled})
- **Framework**: {React | Vue | Express | None}
- **Build**: {tsup | webpack | vite}
- **Testing**: {Vitest | Jest | Mocha}
- **Linting**: ESLint + Prettier

### Key Dependencies
- {dependency-1}: {purpose}
- {dependency-2}: {purpose}
- {dependency-3}: {purpose}

## Architecture Overview

### High-Level Structure

```
{ASCII diagram of architecture}
```

### Module Organization

```
src/
├── {module-1}/        # {purpose}
├── {module-2}/        # {purpose}
├── {module-3}/        # {purpose}
└── {module-4}/        # {purpose}
```

### Architectural Style

{Description of architectural approach: layered, clean architecture, etc.}

**Key Patterns**:
- {Pattern 1}: {usage}
- {Pattern 2}: {usage}
- {Pattern 3}: {usage}

## Relevant Existing Components

### Component 1: {Name}

**Location**: `src/{path}/`
**Purpose**: {what it does}
**Key Files**:
- `{file-1}.ts`: {purpose}
- `{file-2}.ts`: {purpose}

**Integration Points**: {how new feature will interact}

**Patterns to Follow**: {consistency requirements}

### Component 2: {Name}

{Similar structure...}

## Type System Patterns

### Schema Definition

**Approach**: {Zod-first | Pure TypeScript | Mixed}

**Example**:
```typescript
{Example of typical type/schema definition in this codebase}
```

**Location**: Types defined in `src/types/` or co-located with features

### Validation Strategy

{How runtime validation is handled: Zod, pure TS, guards, etc.}

## Testing Patterns

### Test Organization

```
{test file structure: co-located vs separate test dirs}
```

### Testing Approach
- **Unit Tests**: {framework}, {coverage expectations}
- **Integration Tests**: {how they're structured}
- **E2E Tests**: {if applicable}

### Test Patterns

```typescript
{Example test structure commonly used}
```

## Code Quality Standards

### Naming Conventions
- **Files**: {kebab-case | camelCase}
- **Functions**: {camelCase}
- **Types**: {PascalCase}
- **Constants**: {UPPER_SNAKE_CASE | camelCase}

### TypeScript Standards
- **Strict Mode**: {enabled}
- **any Usage**: {prohibited | allowed with justification}
- **Type Assertions**: {avoided | used sparingly}
- **Return Types**: {required on public functions}

### Code Style
- **Pattern Matching**: {ts-pattern | switch | if-else}
- **Error Handling**: {throw | Result types | etc.}
- **Async Patterns**: {async/await | promises}
- **Import Style**: {named exports preferred | mixed}

### Documentation
- **TSDoc**: {required on public APIs}
- **README**: {comprehensive | minimal}
- **Comments**: {explain why, not what}

## Integration Points

### Point 1: {Name}

**Type**: {API | File System | Database | External Service}
**Location**: `{file-path}`
**Interface**:
```typescript
{interface definition}
```

**Usage Pattern**:
```typescript
{example usage}
```

### Point 2: {Name}

{Similar structure...}

## Performance Considerations

{Any performance patterns, bottlenecks, or requirements}

## Security Considerations

{Any security patterns or requirements}

## Relevant Project Principles

Extracted from CLAUDE.md, .cursorrules, and other docs:

1. **{Principle 1}**: {description}
2. **{Principle 2}**: {description}
3. **{Principle 3}**: {description}

## File Discovery

### Files Modified by Similar Features

{List files changed by similar past features}

### Files Likely Affected

Based on requirements, these files will likely need changes:

- `{file-1}`: {why}
- `{file-2}`: {why}
- `{file-3}`: {why}

### New Files Likely Needed

- `{new-file-1}`: {purpose}
- `{new-file-2}`: {purpose}

## Implementation Context

### Current State Summary

{Brief summary of relevant current implementation}

### Known Issues/Technical Debt

{Any known issues in related areas}

### Related Past Changes

{Git log of similar features, if found}

## References

- Main docs: {paths to relevant docs}
- Similar features: {paths or git commits}
- External references: {links if any}
```

Execute codebase analysis now.
```

### Step 3: Conduct Required Audits

Based on the requirements, identify and execute any required audits.

**IMPORTANT**: Audits are independent and should run **IN PARALLEL** for maximum efficiency.

Use Task tool to spawn **MULTIPLE audit agents in a SINGLE MESSAGE** (parallel execution):

**Audit Template** (use for each audit agent):

```
ROLE: You are an audit agent for chopstack v2.

YOUR JOB: Conduct the specified audit and document findings.

AUDIT: {audit-name}

REQUIREMENTS: {what to audit}

AUDIT TASKS:

1. Run searches/analysis as specified
2. Quantify findings (counts, file lists, patterns)
3. Categorize findings (by module, severity, complexity)
4. Estimate impact on feature implementation
5. Provide recommendations

OUTPUT FORMAT:

Create `notes/audit-{name}.md`:

```markdown
# Audit: {Audit Name}

**Date**: {date}
**Purpose**: {why this audit is needed}
**Related Spec**: {spec-name}

## Audit Scope

{What was audited and why}

## Methodology

{How the audit was conducted}

## Findings

### Summary
- **Total Count**: {number}
- **Affected Modules**: {count}
- **Complexity Estimate**: {assessment}

### Detailed Findings

#### Module: {module-name}
- **Files Affected**: {count}
- **Files List**:
  - `{file-1}`: {notes}
  - `{file-2}`: {notes}
- **Complexity**: {assessment}
- **Notes**: {observations}

#### Module: {module-name}
{Similar structure...}

## Analysis

### Impact on Feature

{How findings affect implementation}

### Complexity Implications

{How findings affect task sizing and dependencies}

### Recommendations

1. {Recommendation 1}
2. {Recommendation 2}
3. {Recommendation 3}

## Task Implications

Based on findings, suggest:

- **Task Granularity**: {how to split work}
- **Dependencies**: {what must happen first}
- **Estimated Complexity**: {T-shirt size}
```

Execute audit now.
```

**Parallel Execution Pattern**:

Send a **SINGLE MESSAGE** with **MULTIPLE Task tool invocations** to run audits in parallel:

```
Message with multiple Task invocations:
- Task 1: Audit command implementations
- Task 2: Audit infrastructure readiness
- Task 3: Audit type system completeness
- Task 4: Audit execution engine capabilities
(all execute simultaneously)
```

**Common Audits** (run in parallel):
1. **Command Implementations**: Identify existing vs missing commands
2. **Infrastructure Readiness**: Assess services, agents, orchestration
3. **Type System Completeness**: Check schemas-v2.ts coverage
4. **Execution Engine**: Evaluate phase support, context injection
5. **Test Coverage**: Measure current coverage in affected areas (optional)
6. **Performance Baseline**: Benchmark current performance (optional)

**Example Parallel Audit Execution**:

For a feature requiring 3 audits, spawn 3 agents in one message:

```
Audit 1 (parallel): Command implementations → notes/audit-commands.md
Audit 2 (parallel): Type system coverage → notes/audit-types.md
Audit 3 (parallel): Service readiness → notes/audit-services.md

All complete simultaneously → proceed to Step 4
```

### Step 4: Generate Comprehensive Specification

Use Task tool to spawn specification generation agent:

```
ROLE: You are a specification generation agent for chopstack v2.

YOUR JOB: Generate a comprehensive, execution-ready specification following chopstack v2 patterns.

INPUTS:
- Initial requirements: {initial-requirements-path}
- Codebase context: {codebase.md}
- Audit findings: {notes/*.md}

SPECIFICATION REQUIREMENTS:

Generate a specification following this EXACT structure (see @docs/sample-specs-v2/type-safety-refactor.md as reference):

```markdown
# Specification: {Feature Name}

**Status**: Draft
**Created**: {date}
**Epic**: {epic-name}
**Related Issues**: {issue-refs}

## Overview

{1-2 paragraph overview of what's being built and why}

## Background

### Current State

**Strong Points**:
- {What's working well}
- {Existing good patterns}

**Areas for Improvement**:
1. **{Area 1}** - {description}
2. **{Area 2}** - {description}

### Problems

1. **{Problem 1}**: {detailed description}
2. **{Problem 2}**: {detailed description}

### Goals

1. **{Goal 1}** {description}
2. **{Goal 2}** {description}

## Requirements

### Functional Requirements

#### FR1: {Requirement Category}

- **FR1.1**: {Specific requirement}
- **FR1.2**: {Specific requirement}
- **FR1.3**: {Specific requirement}

#### FR2: {Requirement Category}

{Similar structure...}

### Non-Functional Requirements

#### NFR1: Performance

- **NFR1.1**: {Specific metric}
- **NFR1.2**: {Specific metric}

#### NFR2: Code Quality

- **NFR2.1**: {Standard}
- **NFR2.2**: {Standard}

#### NFR3: Documentation

- **NFR3.1**: {Requirement}
- **NFR3.2**: {Requirement}

#### NFR4: Maintainability

- **NFR4.1**: {Requirement}
- **NFR4.2**: {Requirement}

## Design

### Architecture Overview

```
{ASCII diagram}
```

### Component Specifications

#### 1. Component Name ({file-path})

**Purpose**: {what it does}

**Contents**:

```typescript
{Detailed pseudo-code or structure}
```

**Key Features**:
- {Feature 1}
- {Feature 2}

#### 2. Component Name

{Similar structure...}

### File Structure Changes

**New Files**:

```
{tree structure showing new files}
```

**Modified Files**:

- `{file-1}` - {what changes}
- `{file-2}` - {what changes}

### Migration Strategy

{If applicable: how to migrate from old to new}

#### Phase 1: {Phase Name}

{Description of phase}

**Deliverable**: {what's delivered}

#### Phase 2: {Phase Name}

{Similar structure...}

## Implementation Plan

### Task Breakdown

**Epic**: {Epic Name}

**Tasks**:

1. **Task 1: {Name}** ({complexity} - {time estimate})
   - {What to do}
   - {Why it matters}
   - **Deliverable**: {what's delivered}

2. **Task 2: {Name}** ({complexity} - {time estimate})
   {Similar structure...}

**Total Estimated Time**: {range}

### Dependencies

- **Task {N}** → Task {M} ({reason})
- {Dependency graph}

### Acceptance Criteria

**Must Have**:

- ✅ {Criterion 1}
- ✅ {Criterion 2}

**Should Have**:

- ✅ {Criterion 3}
- ✅ {Criterion 4}

**Nice to Have**:

- ✅ {Criterion 5}

## Success Metrics

### Quantitative

- **{Metric 1}**: {target}
- **{Metric 2}**: {target}

### Qualitative

- **{Metric 1}**: {description}
- **{Metric 2}**: {description}

## Risks & Mitigations

### Risk 1: {Risk Name}

**Likelihood**: {Low | Medium | High}
**Impact**: {Low | Medium | High}
**Mitigation**:

- {Action 1}
- {Action 2}

### Risk 2: {Risk Name}

{Similar structure...}

## Future Considerations

### Next Steps After {Feature}

1. **{Enhancement 1}**: {description}
2. **{Enhancement 2}**: {description}

### Technical Debt Prevention

- {Prevention 1}
- {Prevention 2}

## Appendix

### Design Principles

1. **{Principle 1}**: {description}
2. **{Principle 2}**: {description}

### Related Specifications

- [{Spec 1}]({path})
- [{Spec 2}]({path})

### References

- {Reference 1}: {url}
- {Reference 2}: {url}
```

CRITICAL REQUIREMENTS:

1. **Completeness**: Every section must be filled with specific, actionable content
2. **Specificity**: No vague descriptions - be concrete and detailed
3. **Consistency**: Follow patterns from codebase.md
4. **Measurability**: All acceptance criteria must be verifiable
5. **Context**: Explain WHY, not just WHAT

Generate spec.md now.
```

### Step 5: Validate Specification Quality

Use Task tool to spawn **@agent-spec-completeness-analyzer** with this prompt:

```
Validate the specification at {spec.md} for completeness and readiness for decomposition.

Read the generated specification and perform a final quality check:

**Structure Completeness**:
- All required sections present (Overview, Requirements, Design, Implementation Plan, etc.)
- No placeholder text (TODO, TBD, etc.)
- Proper markdown formatting
- Valid ASCII diagrams if applicable

**Content Quality**:
- Requirements are specific and measurable
- Design includes detailed structure or pseudo-code
- File paths are explicit (no wildcards)
- Acceptance criteria are verifiable
- Success metrics are quantifiable

**Codebase Integration**:
- References actual files in the codebase
- Follows existing patterns from codebase.md
- Integration points are documented
- Naming conventions match existing code

**Decomposition Readiness**:
- Clear task breakdown provided
- Dependencies are logical
- Complexity estimates are realistic
- No open questions remaining

**Audit Integration**:
- Audit findings are incorporated
- Task estimates reflect audit complexity
- No unresolved audit questions

Produce your standard Specification Completeness Analysis report with:
- Completeness score (0-100%)
- Any remaining gaps or open questions
- Gate 1 status (READY or NEEDS REVISION)
- If NEEDS REVISION: specific fixes required

This is the final validation before the spec can be used for /build-plan.
```

## Success Pattern

A successful spec generation looks like:

```
📋 Generating specification from .chopstack/specs/feature-x/initial.md

Step 1: Analyzing initial requirements...
├─ Core intent: Add dark mode to web application
├─ Scope: Theme system with localStorage persistence
└─ Complexity: Medium (estimated 15-20 hours)

Step 2: Analyzing codebase...
├─ Technology: React + TypeScript + Vite
├─ Patterns: Context API for global state
├─ Integration: src/components/, src/contexts/
└─ ✅ codebase.md created

Step 3: Conducting audits...
├─ Audit 1: Count theme-related code → 0 files found
├─ Audit 2: Identify component structure → 15 components
└─ ✅ 2 audits completed → notes/*.md

Step 4: Generating specification...
├─ Writing spec.md...
├─ Adding requirements (12 functional, 8 non-functional)
├─ Designing architecture (3 new components)
├─ Planning 8 tasks (2h-4h each)
└─ ✅ spec.md created (1200+ lines)

Step 5: Validating quality...
├─ Structure: ✅ 100% complete
├─ Content: ✅ All sections specific
├─ Integration: ✅ References actual codebase
├─ Readiness: ✅ 0 open questions
└─ ✅ READY for decomposition

✅ Specification Generation Complete

Files created:
- .chopstack/specs/feature-x/spec.md
- .chopstack/specs/feature-x/codebase.md
- .chopstack/specs/feature-x/notes/audit-component-structure.md
- .chopstack/specs/feature-x/notes/audit-theme-usage.md

Next steps:
1. Review spec.md and codebase.md
2. Run: /build-plan @.chopstack/specs/feature-x/spec.md
```

## Error Handling

### Initial Requirements Too Vague

If initial requirements lack detail:

```markdown
⚠️  Initial requirements are too vague for quality spec generation

## Missing Information:

1. **Feature Scope**: {what's unclear}
2. **Technical Context**: {what's missing}
3. **Success Criteria**: {what needs definition}

## Required Actions:

Update {initial-requirements-path} with:
- Clear scope boundaries (what's in/out)
- Technology preferences (if any)
- Success criteria (how to measure completion)
- Any constraints (time, resources, compatibility)

Then re-run: `/build-spec {initial-requirements-path}`
```

### Codebase Analysis Fails

If codebase analysis encounters issues:

```markdown
❌ Codebase analysis failed

## Issue: {description}

## Possible Causes:
- Empty or missing codebase
- Unclear integration points
- Insufficient context

## Recommended Actions:
1. {Action 1}
2. {Action 2}

Once resolved, re-run: `/build-spec {initial-requirements-path}`
```

## Important Notes

- **Always use Task tool** for codebase analysis, audits, spec generation, and validation
- **Run all steps sequentially** - each step depends on previous outputs
- **Save all artifacts** - codebase.md, audits, and spec.md are all needed
- **Validate before finishing** - ensure spec is truly ready for decomposition
- **Be thorough** - a high-quality spec prevents problems during execution

## Configuration

Default behavior:
- Audits run automatically if needed (based on requirements)
- Codebase analysis always runs
- Validation always runs
- Output goes to same directory as initial requirements

Now generate the specification from: `{initial-requirements-path}`
