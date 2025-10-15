# Specification: Chopstack v2.0.0 Phase 2 - Complete Feature Implementation

**Status**: Draft (Complete, Execution-Ready)
**Created**: 2025-10-14
**Epic**: Chopstack v2.0.0 - Specification-Driven Workflow System
**Related Issues**: SNU-120, SNU-121
**Version**: 2.0.0-phase2

---

## Table of Contents

1. [Overview](#overview)
2. [Background](#background)
3. [Requirements](#requirements)
4. [Design](#design)
5. [Implementation Plan](#implementation-plan)
6. [Success Metrics](#success-metrics)
7. [Risks & Mitigations](#risks--mitigations)
8. [Acceptance Criteria](#acceptance-criteria)

---

## Overview

Transform chopstack v2 from infrastructure-ready to feature-complete by implementing the missing specification-driven workflow components: specification expansion (`chopstack specify`), specification analysis (`chopstack analyze`), quality gates in decomposition, and implementation validation (`chopstack run --validate`).

This specification builds on the **solid infrastructure foundation** identified in audit findings:
- Execution engine: 90% ready
- Type system: 100% ready (schemas-v2.ts is comprehensive)
- VCS strategies: 100% ready
- Agent infrastructure: 50% ready (needs 4 new agent types)
- Services: 40% ready (needs 5 new services)
- Commands: 20% ready (only 2 of 5 exist)

**Key Achievement**: Enable the full v2 workflow - `specify → analyze → decompose → run → validate` - with zero open questions, zero TODOs, and production-ready quality.

---

## Background

### Current State (Post-Audit Findings)

**What Exists and Works Well:**
1. **Execution Infrastructure** (90% ready)
   - ExecutionEngine, ExecutionOrchestrator, TaskOrchestrator are production-ready
   - VCS strategies (simple, worktree, stacked) fully functional
   - Mode handlers (plan, execute) work correctly
   - DagValidator provides comprehensive plan validation

2. **Type System** (100% ready)
   - schemas-v2.ts defines all core types (PlanV2, TaskV2, Phase, SuccessMetrics)
   - Analysis types defined (Gap, AnalysisReport, ValidationFinding, ProjectPrinciples)
   - Zod validation with cross-validation refinements
   - Type inference via z.infer<>

3. **Agent Infrastructure** (50% ready)
   - AgentService exists with agent creation and caching
   - ClaudeCodeDecomposer is mature (349 lines, production-tested)
   - MockAgent for testing exists
   - Agent interface is well-defined

4. **Commands** (20% ready)
   - `chopstack decompose` exists but lacks quality gates
   - `chopstack run` exists but lacks implementation validation
   - `chopstack stack` fully functional
   - Command pattern with dependency injection established

**Critical Gaps (Blocking v2 Workflow):**
1. **No Specification Generation** (`chopstack specify` command missing)
   - Cannot transform brief prompts into rich specifications
   - No codebase analysis integration
   - Users must manually create specs

2. **No Specification Analysis** (`chopstack analyze` command missing)
   - Cannot validate spec completeness before decomposition
   - No gap detection or remediation guidance
   - Open questions go undetected until execution

3. **No Quality Gates in Decomposition**
   - Pre-generation gate: No check for unresolved open questions
   - Post-generation gate: No validation of task quality (XL tasks, vague patterns)
   - Plans with quality issues proceed to execution

4. **Validation Mode is Basic**
   - Current ValidateModeHandler only validates plan structure (DAG)
   - Does NOT validate implementation against acceptance criteria
   - Does NOT check success metrics or project principles

5. **Missing Services**
   - No SpecificationService for spec generation
   - No CodebaseAnalysisService for architecture analysis
   - No GapAnalysisService for spec validation
   - No QualityValidationService for task quality checks
   - No ProjectPrinciplesService for principle extraction

### Problems This Specification Solves

**Problem 1: Poor Quality Plans from Brief Prompts**
- **Current**: User runs `chopstack decompose "add dark mode"` with minimal context
- **Result**: Agent produces shallow plan with 3-5 file conflicts, missing architecture details
- **Impact**: 40% first-attempt success rate, high retry count
- **Solution**: `chopstack specify` generates 1000+ line spec from brief prompt using codebase analysis

**Problem 2: Incomplete Specifications Go Undetected**
- **Current**: User creates spec manually, runs decompose immediately
- **Result**: Missing requirements, ambiguous sections, unresolved questions → poor plan
- **Impact**: Plans expand during execution, tasks become 2-3x original estimate
- **Solution**: `chopstack analyze` validates completeness, identifies gaps, blocks decompose until 100%

**Problem 3: Low-Quality Plans Pass Through**
- **Current**: Plan generator creates plan with XL tasks, vague file patterns like `src/**/*.ts`
- **Result**: Tasks fail during execution, require manual intervention
- **Impact**: Wasted time, broken automation, user frustration
- **Solution**: Post-generation quality gate detects and reports issues before execution

**Problem 4: Implementation Validation is Manual**
- **Current**: After execution, user manually checks if acceptance criteria met
- **Result**: Inconsistent validation, missed criteria, principle violations
- **Impact**: Technical debt accumulates, quality degrades over time
- **Solution**: `chopstack run --validate` automates acceptance criteria checking

### Goals

**Primary Goals:**
1. **Complete the v2 Workflow**: Enable end-to-end `specify → analyze → decompose → run → validate`
2. **Quality Assurance**: Add automated quality gates at each stage
3. **Developer Experience**: Provide clear, actionable error messages and guidance
4. **Maintainability**: Build on existing patterns, avoid technical debt

**Success Metrics:**
- Reduce file conflicts to <1 per plan (70% reduction from baseline of ~3)
- Achieve 80% first-attempt success rate (100% improvement from 40%)
- Specifications average 1000+ lines from 1-2 sentence prompts
- Plans validated with 0 CRITICAL issues before execution

---

## Requirements

### Functional Requirements

#### FR1: Specification Generation (`chopstack specify`)

**Purpose**: Transform brief prompts into comprehensive, structured specifications with codebase context.

**FR1.1: Command Interface**
```bash
chopstack specify "add dark mode to settings" --output dark-mode.md
chopstack specify --input brief.txt --output feature-spec.md --cwd /path/to/repo
```

**Options:**
- `--prompt <text>` or positional argument: Brief feature description (required if no --input)
- `--input <file>`: Read prompt from file (alternative to --prompt)
- `--output <file>`: Output file path (required)
- `--cwd <dir>`: Working directory (default: current directory)
- `--verbose`: Verbose logging

**FR1.2: Specification Structure**

Generated spec.md must contain:
1. **Overview** (1-2 paragraphs) - What's being built and why
2. **Background** - Current state, problems, goals
3. **Functional Requirements** (FR1.1, FR1.2...) with priorities (MUST/SHOULD/COULD)
4. **Non-Functional Requirements** (NFR1.1, NFR1.2...) with metrics
5. **Architecture** - Component diagrams (ASCII art), component specifications, file structure
6. **Implementation Plan** - Task breakdown preview (not binding)
7. **Success Metrics** - Quantitative (test coverage, performance) and qualitative (UX, clarity)
8. **Acceptance Criteria** - Must have, should have, nice to have
9. **Risks & Mitigations** - For each risk: likelihood, impact, mitigation strategy

**FR1.3: Codebase Analysis Integration**

Specification generation must include codebase context:
- Directory structure analysis (identify key modules, components, services)
- Technology stack detection (languages, frameworks, build tools)
- Architecture pattern identification (monolith, microservices, layered, etc.)
- Related feature discovery (find similar existing features)
- Code example extraction (patterns to follow)
- Dependency analysis (identify integration points)

**FR1.4: Output Quality**

Generated specifications must:
- Be 800+ lines for medium features (baseline quality)
- Have 10+ functional requirements for non-trivial features
- Include 3+ non-functional requirements (performance, security, accessibility, etc.)
- Contain 2+ ASCII architecture diagrams
- List 5+ acceptance criteria with clear verification steps
- Have NO placeholder text (TODO, TBD, ???, [fill this in])

**FR1.5: Error Handling**

- Validate prompt is non-empty (min 10 characters)
- Check output path is writable
- Verify cwd is a valid directory
- Handle agent failures gracefully with retry
- Provide actionable error messages

#### FR2: Specification Analysis (`chopstack analyze`)

**Purpose**: Validate specification completeness, detect gaps, identify open questions before decomposition.

**FR2.1: Command Interface**
```bash
chopstack analyze --spec dark-mode.md
chopstack analyze --spec feature.md --codebase codebase.md --output report.json
```

**Options:**
- `--spec <file>`: Specification file to analyze (required)
- `--codebase <file>`: Optional codebase documentation for cross-artifact analysis
- `--output <file>`: Write report to file (JSON format)
- `--format <json|text>`: Output format (default: text for terminal)
- `--verbose`: Verbose logging

**FR2.2: Gap Detection**

Analyze specification for:
1. **Missing Required Sections** (CRITICAL gaps)
   - Overview, background, requirements, architecture, acceptance criteria
   - Minimum content length validation (e.g., overview must be 100+ chars)

2. **Incomplete Sections** (HIGH priority gaps)
   - Requirements without acceptance criteria mappings
   - Architecture without component descriptions
   - NFRs without measurable targets (e.g., "fast" vs "<50ms")

3. **Ambiguous Language** (MEDIUM priority gaps)
   - Detect vague terms: "should", "maybe", "possibly", "probably", "TBD", "TODO"
   - Flag undefined technical terms
   - Identify missing implementation details

4. **Inconsistencies** (MEDIUM priority gaps)
   - Cross-reference validation (requirements → architecture → acceptance criteria)
   - Terminology consistency checks
   - Requirement numbering gaps (FR1, FR2, FR4 - missing FR3)

5. **Open Questions** (CRITICAL priority gaps)
   - Parse "Open Tasks/Questions" section if exists
   - Identify unresolved audits (e.g., "count affected files", "measure complexity")
   - Flag decision points requiring architect input

**FR2.3: Completeness Scoring**

Calculate 0-100 completeness score based on:
- Section presence (40%): All required sections exist
- Content depth (30%): Minimum content length requirements met
- Quality indicators (20%): No ambiguous language, no placeholders
- Cross-validation (10%): Consistency across sections

**Scoring Algorithm:**
```
completeness = (section_score * 0.4) + (depth_score * 0.3) + (quality_score * 0.2) + (consistency_score * 0.1)

section_score = (sections_present / total_required_sections) * 100
depth_score = (sections_meeting_min_length / total_sections) * 100
quality_score = 100 - (ambiguous_terms_count * 5) // Cap at 0
consistency_score = (consistent_references / total_references) * 100
```

**FR2.4: Remediation Steps**

Generate prioritized remediation steps:
1. **CRITICAL gaps first** (blocking issues)
   - Missing required sections
   - Unresolved open questions
2. **HIGH priority gaps** (should fix before decompose)
   - Incomplete sections
   - Missing metrics in NFRs
3. **MEDIUM priority gaps** (improve quality)
   - Ambiguous language
   - Inconsistencies
4. **LOW priority gaps** (nice to have)
   - Additional examples
   - More detailed diagrams

Each step includes:
- Priority (CRITICAL/HIGH/MEDIUM/LOW)
- Order (1, 2, 3...)
- Action (what to do)
- Reasoning (why it's important)
- Artifacts (which files/sections to modify)

**FR2.5: Analysis Report Output**

**Terminal Output (Default)**:
```
📊 Specification Analysis Report

Completeness: 75% (INCOMPLETE)

📋 Summary: 1 CRITICAL gap, 2 HIGH priority gaps, 3 MEDIUM priority gaps

🔴 CRITICAL Issues:
  [1] Missing required section: architecture
      → Add architecture section with component diagrams and descriptions
      Artifacts: dark-mode.md (Architecture section)

  [2] Unresolved open questions: 3 questions in "Open Tasks/Questions" section
      → Complete codebase audit to count affected components
      → Decide on state management approach (Context API vs Zustand)
      → Determine theme storage mechanism (localStorage vs cookies)
      Artifacts: dark-mode.md (Open Tasks/Questions section)

🟠 HIGH Priority Issues:
  [1] FR2.1 has no measurable acceptance criteria
      → Add specific, testable criteria (e.g., "Theme toggle appears in settings")
      Artifacts: dark-mode.md (FR2.1, Acceptance Criteria)

  [2] NFR1 lacks performance target
      → Specify exact metric (e.g., "<50ms theme switch time")
      Artifacts: dark-mode.md (NFR1)

🟡 MEDIUM Priority Issues:
  [1] Ambiguous language: "should support dark mode" in FR1
      → Replace with concrete requirement: "MUST support light, dark, and system modes"

  [2] Inconsistent terminology: "theme" vs "color scheme" vs "appearance mode"
      → Use consistent term throughout document

  [3] FR1 → Architecture mapping unclear
      → Specify which components implement FR1

💡 Recommendations (Priority Order):
  1. [CRITICAL] Add architecture section with diagrams and component specs
  2. [CRITICAL] Resolve all 3 open questions in "Open Tasks/Questions" section
  3. [HIGH] Add measurable acceptance criteria to FR2.1
  4. [HIGH] Specify performance target in NFR1
  5. [MEDIUM] Replace ambiguous "should" language with MUST/SHOULD/COULD
  6. [MEDIUM] Standardize terminology across document
  7. [MEDIUM] Add FR → Architecture traceability matrix

⚠️  Cannot proceed with decomposition until completeness reaches 100%

Run: chopstack analyze --spec dark-mode.md --output report.json for detailed JSON report
```

**JSON Output (--output report.json)**:
```json
{
  "completeness": 75,
  "status": "incomplete",
  "gaps": [
    {
      "id": "gap-missing-architecture",
      "severity": "CRITICAL",
      "category": "gap",
      "message": "Missing required section: architecture",
      "artifacts": ["dark-mode.md"],
      "remediation": "Add architecture section with component diagrams and descriptions"
    }
  ],
  "remediation": [
    {
      "priority": "CRITICAL",
      "order": 1,
      "action": "Add architecture section",
      "reasoning": "Architecture is required to understand component structure",
      "artifacts": ["dark-mode.md"]
    }
  ],
  "summary": "Completeness: 75% - 1 CRITICAL gap, 2 HIGH priority gaps"
}
```

**FR2.6: Exit Codes**

- `0`: Completeness = 100%, ready for decomposition
- `1`: Completeness < 100%, has CRITICAL or HIGH gaps

#### FR3: Enhanced Decomposition with Quality Gates (`chopstack decompose`)

**Purpose**: Add two quality gates to existing decompose command - pre-generation validation and post-generation task quality checks.

**FR3.1: Pre-Generation Gate (Gate 1: Open Questions Check)**

**Before** generating plan, validate specification readiness:

1. **Parse spec for "Open Tasks/Questions" section**
   - Check for section headers matching: `## Open Tasks/Questions`, `## Open Questions`, `## Unresolved Questions`
   - Parse section content for unresolved items
   - Look for unchecked checkboxes: `- [ ]`, `[ ]`
   - Look for question marks: `?`, `TODO:`, `TBD:`

2. **Block decomposition if unresolved items exist**
   ```
   ❌ Cannot decompose: Specification has 3 unresolved open questions

   Open Questions in dark-mode.md:
     - [ ] How many components need dark mode support? (requires codebase audit)
     - [ ] Which state management library? (requires architecture decision)
     - [ ] Storage mechanism for theme preference? (requires security review)

   Action Required:
     1. Complete all audits and answer open questions
     2. Update specification to remove items from "Open Tasks/Questions" section
     3. Re-run: chopstack analyze --spec dark-mode.md to verify 100% completeness
     4. Then retry: chopstack decompose --spec dark-mode.md

   Why this matters:
     Open questions lead to incomplete task breakdowns and mid-execution plan expansion.
     Resolving questions before decomposition produces better quality plans.
   ```

3. **Allow bypass for testing** (not recommended for production)
   ```bash
   chopstack decompose --spec dark-mode.md --skip-gates
   ```

**FR3.2: Post-Generation Gate (Gate 2: Task Quality Validation)**

**After** generating plan, validate task quality before allowing execution:

**Quality Checks:**

1. **XL Task Detection** (CRITICAL)
   - Flag any task with `complexity: XL`
   - Rationale: XL tasks (>8h) often expand during execution
   - Suggestion: Split into 3-4 M/L tasks with clear dependencies

2. **File Count Validation** (HIGH)
   - Flag tasks touching >10 files
   - Rationale: Tasks with too many files are poorly scoped
   - Suggestion: Split by module or component

3. **Vague File Pattern Detection** (HIGH)
   - Flag file patterns with wildcards: `src/**/*.ts`, `lib/*/*.js`
   - Rationale: Wildcards indicate undefined scope
   - Suggestion: Specify exact file paths

4. **Short Description Detection** (MEDIUM)
   - Flag descriptions <50 characters
   - Rationale: Brief descriptions lack context
   - Suggestion: Expand to explain what AND why

5. **Missing Dependency Validation** (LOW)
   - Flag complex tasks (M/L) with zero dependencies
   - Rationale: May be missing prerequisite tasks
   - Suggestion: Review if setup tasks needed

**Quality Report Example:**
```
📊 Task Quality Report

Summary: 1 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW issues

⚠️  BLOCKING ISSUES FOUND - Plan has quality issues that may cause execution failures

📋 Task: migrate-theme-system
  🔴 [CRITICAL] Task is XL complexity (estimated >8 hours)
     Tasks this large often expand during execution, becoming 15-20+ hours
     💡 Break into 3-4 smaller tasks:
        - migrate-theme-types (M) - Move type definitions
        - migrate-theme-provider (M) - Update provider component
        - migrate-theme-consumers (L) - Update all consuming components
        - migrate-theme-tests (S) - Update test files

  🟠 [HIGH] Task touches 15 files (threshold: 10)
     Files: src/theme/types.ts, src/theme/provider.tsx, src/components/...
     💡 Split by module: separate task for components/ vs pages/

  🟠 [HIGH] Vague file pattern: src/components/**/*.tsx
     Wildcard patterns make scope unclear and testing difficult
     💡 List exact files: src/components/Button.tsx, src/components/Card.tsx, etc.

📋 Task: update-readme
  🟡 [MEDIUM] Description is only 35 characters: "Update README with dark mode docs"
     💡 Expand: "Update README.md to document dark mode feature. Add setup instructions,
        configuration options, and troubleshooting guide. Why: Users need clear docs."

📊 Overall Assessment:
  - Total tasks: 8
  - Complexity distribution: 0 XL, 2 L, 5 M, 1 S (good distribution)
  - Average files per task: 4.2 (acceptable)
  - Tasks with quality issues: 2 (25%)

❌ Plan is NOT ready for execution due to CRITICAL and HIGH issues

Recommended Actions:
  1. [CRITICAL] Split "migrate-theme-system" into 3-4 tasks
  2. [HIGH] Make file patterns in "migrate-theme-system" specific
  3. [MEDIUM] Expand description for "update-readme"

After fixing issues, save updated plan and run:
  chopstack run --plan dark-mode.plan.yaml
```

**FR3.3: Quality Gate Exit Behavior**

- **CRITICAL issues found**: Exit code 1, display report, do NOT save plan
- **HIGH issues found**: Exit code 0, display report, save plan with warnings
- **MEDIUM/LOW issues only**: Exit code 0, display report, save plan
- **No issues**: Exit code 0, display success message, save plan

**FR3.4: Integration with Existing Decompose Command**

Modify existing `src/commands/decompose/decompose-command.ts`:

```typescript
async execute(options: DecomposeOptions): Promise<number> {
  // 1. Read specification
  const spec = await fs.readFile(options.spec, 'utf-8');

  // 2. PRE-GENERATION GATE: Check for open questions
  const gateCheck = await this.deps.processGateService.checkOpenQuestions(spec);
  if (!gateCheck.passed && !options.skipGates) {
    logger.error('❌ Cannot decompose: Specification has unresolved open questions');
    console.log(gateCheck.details);
    return 1;
  }

  // 3. Generate plan (existing logic)
  const plan = await this.deps.planGenerator.generate(spec, options);

  // 4. POST-GENERATION GATE: Validate task quality
  const qualityReport = await this.deps.qualityValidationService.validate(plan);
  console.log(formatQualityReport(qualityReport));

  if (qualityReport.blocking) {
    logger.error('❌ Plan has CRITICAL quality issues - not saving');
    return 1;
  }

  // 5. Save plan (existing logic)
  await this.deps.planOutputter.write(plan, options.output);

  if (qualityReport.issues.length > 0) {
    logger.warn('⚠️  Plan has quality issues - review before execution');
  } else {
    logger.info('✅ Plan quality validated - ready for execution');
  }

  return 0;
}
```

#### FR4: Implementation Validation (`chopstack run --validate`)

**Purpose**: Extend existing validate mode to check implementation against acceptance criteria and project principles.

**FR4.1: Current Behavior (Plan Validation)**

Existing ValidateModeHandler validates:
- DAG structure (cycles, dependencies)
- File conflicts (parallel tasks)
- Plan integrity

**Keep this behavior** - it's working well.

**FR4.2: New Behavior (Implementation Validation)**

Add implementation quality checks:

1. **Acceptance Criteria Validation**
   - For each task, check if acceptance criteria met
   - Use agent to analyze changed files
   - Report pass/fail for each criterion with evidence

2. **Success Metrics Assessment**
   - Check quantitative metrics (test coverage, performance benchmarks)
   - Agent assesses qualitative metrics (code clarity, UX quality)
   - Report actual vs target for each metric

3. **Project Principles Validation**
   - Extract principles from CLAUDE.md, .cursorrules, CONTRIBUTING.md
   - Validate implementation adheres to principles
   - Flag violations with severity and location

4. **Cross-Artifact Consistency**
   - Check implementation matches spec requirements
   - Detect requirement gaps (spec requirement with no implementation)
   - Detect scope creep (implementation without spec requirement)

**FR4.3: Command Interface**

```bash
# Validate entire plan
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md --mode validate

# Validate specific task
chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md --mode validate --task create-types
```

**FR4.4: Validation Report Output**

```
✅ Implementation Validation Report

Plan: dark-mode.plan.yaml
Spec: dark-mode.md
Validated: 8 tasks, 24 acceptance criteria, 4 success metrics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Task: create-types
  Status: ✅ PASSED (2/2 criteria met)

  Acceptance Criteria:
    ✅ Types exported for light/dark/system modes
       Evidence: src/types/theme.ts exports ThemeMode enum with all 3 modes
    ✅ ThemeContext type defined with theme and setTheme
       Evidence: src/types/theme.ts defines ThemeContext interface

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Task: theme-provider
  Status: ⚠️  PARTIAL (3/4 criteria met)

  Acceptance Criteria:
    ✅ Provider wraps app component
       Evidence: src/App.tsx wrapped with ThemeProvider
    ✅ Provider reads initial theme from localStorage
       Evidence: useEffect in ThemeProvider.tsx reads localStorage.getItem('theme')
    ❌ Theme state persists to localStorage on change
       Issue: setTheme function updates state but does NOT write to localStorage
       Impact: User theme preference lost on page refresh
       Suggestion: Add localStorage.setItem('theme', newTheme) in setTheme
    ✅ System theme detection works
       Evidence: useMediaQuery hook for prefers-color-scheme

  Project Principle Violations:
    ⚠️  [MEDIUM] Missing unit tests for ThemeProvider component
       Principle: "All React components must have unit tests" (CLAUDE.md, line 156)
       Location: src/theme/ThemeProvider.tsx
       Suggestion: Add src/theme/__tests__/ThemeProvider.test.tsx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Success Metrics Assessment

Quantitative:
  ⚠️  Test coverage: 87% (target: 100%)
      13 of 15 components have tests
      Missing: ThemeProvider.test.tsx, ThemeToggle.test.tsx
      Action: Add missing test files

  ❌ Performance: 78ms theme switch (target: <50ms)
      Measured on Chrome 120, MacBook Pro M1
      Bottleneck: CSS variable updates trigger full page repaint
      Action: Optimize CSS variables or use class-based theming

Qualitative:
  ✅ Smooth visual transitions
      Assessment: Transition animations are 300ms with ease-in-out, no flicker
  ✅ Accessible theme controls (ARIA)
      Assessment: Theme toggle has aria-label, role="switch", keyboard support

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary

Overall: 7/8 tasks passed (87.5%)

Acceptance Criteria: 22/24 passed (91.7%)
  - 2 failed criteria in "theme-provider" task
  - Critical: localStorage persistence missing

Success Metrics: 3/4 passed (75%)
  - Test coverage below target (87% vs 100%)
  - Performance target not met (78ms vs <50ms)

Project Principles: 1 violation detected
  - Missing unit tests for ThemeProvider

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Next Steps (Priority Order)

1. [CRITICAL] Fix localStorage persistence in ThemeProvider
   File: src/theme/ThemeProvider.tsx
   Change: Add localStorage.setItem('theme', newTheme) to setTheme function

2. [HIGH] Optimize theme switch performance (<50ms target)
   File: src/theme/ThemeProvider.tsx
   Investigation: Profile CSS variable updates, consider class-based approach

3. [HIGH] Add missing unit tests (ThemeProvider, ThemeToggle)
   Files: src/theme/__tests__/ThemeProvider.test.tsx, __tests__/ThemeToggle.test.tsx
   Coverage: Reach 100% target

4. [MEDIUM] Re-run validation after fixes
   Command: chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md --mode validate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Exit code: 1 (validation failed)
```

**FR4.5: Validation Process Flow**

```typescript
// Enhanced validate mode handler
async handle(plan: PlanV2, spec: string, projectPrinciples: ProjectPrinciples): Promise<ValidationResult> {
  const taskResults: TaskValidationResult[] = [];

  for (const task of plan.tasks) {
    // 1. Get changed files for this task (from git)
    const changedFiles = await this.vcsEngine.getChangedFiles(task);

    // 2. Use agent to validate acceptance criteria
    const criteriaResults = await this.acceptanceValidationAgent.validate(
      task,
      changedFiles,
      spec
    );

    // 3. Check project principles adherence
    const principleViolations = await this.principleValidator.validate(
      changedFiles,
      projectPrinciples
    );

    taskResults.push({
      taskId: task.id,
      taskName: task.name,
      criteriaResults,
      principleViolations
    });
  }

  // 4. Assess success metrics
  const metricsAssessment = await this.metricsAssessor.assess(
    plan,
    spec,
    taskResults
  );

  // 5. Generate report
  return {
    taskResults,
    metricsAssessment,
    overallPassed: this.calculateOverallResult(taskResults, metricsAssessment),
    summary: this.generateSummary(taskResults, metricsAssessment)
  };
}
```

### Non-Functional Requirements

#### NFR1: Performance

**NFR1.1: Specification Generation**
- Target: <30 seconds for medium feature (10-15 requirements)
- Measurement: Time from command start to spec.md written
- Constraints: Depends on agent response time (Claude API)

**NFR1.2: Specification Analysis**
- Target: <10 seconds for 1000-line spec
- Measurement: Time from command start to report display
- Optimization: Use streaming parsing, avoid loading entire file in memory

**NFR1.3: Quality Validation**
- Target: <5 seconds for 20-task plan
- Measurement: Time from plan generation to quality report
- Optimization: Parallel validation of tasks

**NFR1.4: Implementation Validation**
- Target: <60 seconds for 8-task plan
- Measurement: Time from command start to validation report
- Constraints: Agent calls for each task (parallelizable)

#### NFR2: Reliability

**NFR2.1: Agent Failure Handling**
- Retry on transient failures (network, rate limits) with exponential backoff
- Clear error messages on permanent failures (invalid API key, unsupported prompt)
- Graceful degradation (continue with reduced functionality if possible)

**NFR2.2: Data Validation**
- All inputs validated with Zod schemas before processing
- Comprehensive error messages for validation failures
- No silent failures - all errors logged and reported

**NFR2.3: File Operations**
- Atomic writes (write to temp file, then rename)
- Verify file permissions before writing
- Handle disk full scenarios gracefully

#### NFR3: Code Quality

**NFR3.1: Type Safety**
- Zero `any` types in production code
- All public functions have explicit return types
- Use Zod schemas for runtime validation

**NFR3.2: Test Coverage**
- Unit tests: 95% coverage for new services
- Integration tests: All commands have integration tests
- End-to-end tests: Complete workflow tests

**NFR3.3: Code Style**
- Follow existing patterns (ts-pattern, Zod, DI)
- Use type guards from `src/utils/guards.ts`
- No ESLint violations

#### NFR4: Maintainability

**NFR4.1: Documentation**
- TSDoc comments on all public functions
- README updates for new commands
- CLAUDE.md updates for new patterns

**NFR4.2: Modularity**
- Services follow single responsibility principle
- Clear interfaces between modules
- Dependency injection for testability

**NFR4.3: Error Messages**
- User-friendly error messages with context
- Actionable suggestions for fixes
- Examples in error messages

---

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Chopstack v2 Phase 2 Architecture                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  CLI Commands (Entry Layer)                                │    │
│  │                                                              │    │
│  │  ✅ chopstack decompose (enhanced)                          │    │
│  │  ✅ chopstack run (enhanced)                                │    │
│  │  ✅ chopstack stack (unchanged)                             │    │
│  │  🆕 chopstack specify (NEW)                                 │    │
│  │  🆕 chopstack analyze (NEW)                                 │    │
│  └─────────────────┬────────────────────────────────────────────┘    │
│                    │                                                  │
│                    ▼                                                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Service Layer (Business Logic)                            │    │
│  │                                                              │    │
│  │  ✅ PlanGenerator (existing, enhanced with gates)           │    │
│  │  ✅ ExecutionOrchestrator (existing)                        │    │
│  │  ✅ VcsEngine (existing)                                    │    │
│  │  ✅ DagValidator (existing)                                 │    │
│  │  🆕 SpecificationService (NEW)                              │    │
│  │  🆕 CodebaseAnalysisService (NEW)                           │    │
│  │  🆕 GapAnalysisService (NEW)                                │    │
│  │  🆕 QualityValidationService (NEW)                          │    │
│  │  🆕 ProjectPrinciplesService (NEW)                          │    │
│  │  🆕 ProcessGateService (NEW)                                │    │
│  └─────────────────┬────────────────────────────────────────────┘    │
│                    │                                                  │
│                    ▼                                                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Agent Layer (AI Integration)                              │    │
│  │                                                              │    │
│  │  ✅ ClaudeCodeDecomposer (existing)                         │    │
│  │  ✅ MockAgent (existing)                                    │    │
│  │  🆕 SpecificationAgent (NEW capability)                     │    │
│  │  🆕 AnalysisAgent (NEW capability)                          │    │
│  │  🆕 QualityValidationAgent (NEW capability)                 │    │
│  │  🆕 AcceptanceValidationAgent (NEW capability)              │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

Legend:
  ✅ Exists (may need enhancement)
  🆕 NEW (needs implementation)
```

### Component Specifications

#### Component 1: SpecifyCommand

**Location**: `src/commands/specify/specify-command.ts` (NEW FILE)

**Purpose**: CLI command for specification generation

**Dependencies**:
- `SpecificationService` (generates spec)
- `CodebaseAnalysisService` (provides context)
- `AgentService` (creates agents)

**Interface**:
```typescript
type SpecifyOptions = {
  prompt?: string;
  input?: string;
  output: string;
  cwd: string;
  verbose: boolean;
};

class SpecifyCommand {
  constructor(private readonly deps: CommandDependencies) {}
  async execute(options: SpecifyOptions): Promise<number>;
}
```

**Implementation Pseudo-code**:
```typescript
async execute(options: SpecifyOptions): Promise<number> {
  // 1. Validate options
  const validatedOptions = SpecifyOptionsSchema.parse(options);

  // 2. Get prompt (from flag or file)
  const prompt = validatedOptions.prompt
    ?? await fs.readFile(validatedOptions.input, 'utf-8');

  // 3. Run codebase analysis
  logger.info('Analyzing codebase...');
  const codebaseAnalysis = await this.deps.codebaseAnalysisService.analyze(
    validatedOptions.cwd
  );

  // 4. Generate specification
  logger.info('Generating specification...');
  const spec = await this.deps.specificationService.generate(
    prompt,
    codebaseAnalysis,
    { verbose: validatedOptions.verbose }
  );

  // 5. Write to file
  await fs.writeFile(validatedOptions.output, spec, 'utf-8');
  logger.info(`✅ Specification written to ${validatedOptions.output}`);

  return 0;
}
```

**Error Handling**:
- Validate prompt is not empty (min 10 chars)
- Check output path is writable
- Retry agent calls on transient failures (3 retries)
- Log errors with context

---

#### Component 2: SpecificationService

**Location**: `src/services/specification/specification-service.ts` (NEW FILE)

**Purpose**: Generate rich specifications from brief prompts using codebase context

**Dependencies**:
- `AgentService` (creates specification agent)
- `CodebaseAnalysis` type

**Interface**:
```typescript
type SpecificationGenerationOptions = {
  verbose?: boolean;
};

type SpecificationService = {
  generate(
    prompt: string,
    codebaseAnalysis: CodebaseAnalysis,
    options?: SpecificationGenerationOptions
  ): Promise<string>;
};
```

**Implementation Pseudo-code**:
```typescript
async generate(
  prompt: string,
  codebaseAnalysis: CodebaseAnalysis,
  options?: SpecificationGenerationOptions
): Promise<string> {
  // 1. Build specification prompt
  const specPrompt = this._buildPrompt(prompt, codebaseAnalysis);

  // 2. Create agent
  const agent = await this.agentService.createAgent('claude');

  // 3. Generate specification
  const result = await agent.execute(specPrompt, [], process.cwd());

  // 4. Parse and format
  const spec = this._parseSpecification(result.output);

  // 5. Validate structure
  this._validateSpecification(spec);

  return spec;
}

private _buildPrompt(prompt: string, codebaseAnalysis: CodebaseAnalysis): string {
  return `
You are a senior software architect. Generate a comprehensive specification for this feature:

${prompt}

Codebase Context:
${codebaseAnalysis.summary}

Technology Stack:
${JSON.stringify(codebaseAnalysis.findings.techStack, null, 2)}

Architecture Patterns:
${JSON.stringify(codebaseAnalysis.findings.architecturePatterns, null, 2)}

Related Features (for reference):
${codebaseAnalysis.relatedFeatures.map(f => `- ${f.name}: ${f.description}`).join('\n')}

Generate a specification in this EXACT structure:

# Specification: [Feature Name]

## Overview
[1-2 paragraphs: what is being built and why]

## Background

### Current State
[What exists today, what problems exist]

### Goals
[What this feature achieves]

## Functional Requirements

### FR1: [Requirement Category]
- **FR1.1**: [Specific requirement]
- **FR1.2**: [Specific requirement]

[Repeat for FR2, FR3, etc. - minimum 5 requirements for non-trivial features]

## Non-Functional Requirements

### NFR1: [Category - Performance/Security/Accessibility/etc]
- **NFR1.1**: [Specific requirement with measurable target]

[Minimum 3 NFRs with concrete metrics]

## Architecture

### Component Diagram
\`\`\`
[ASCII art diagram showing components and relationships]
\`\`\`

### Components

#### Component 1: [Name]
**Purpose**: [What it does]
**Responsibilities**:
- [Responsibility 1]
- [Responsibility 2]
**Dependencies**: [Other components]
**Files**: [Exact file paths]

[Repeat for each component]

## Implementation Plan

[High-level task breakdown - NOT binding, just preview]

## Success Metrics

### Quantitative
- [Metric 1 with target: e.g., "Test coverage: 100%"]
- [Metric 2 with target: e.g., "Performance: <50ms"]

### Qualitative
- [Metric 1: e.g., "Smooth animations"]
- [Metric 2: e.g., "Accessible controls"]

## Acceptance Criteria

### Must Have
- [ ] [Criterion 1 - specific and testable]
- [ ] [Criterion 2]

### Should Have
- [ ] [Criterion 3]

### Nice to Have
- [ ] [Criterion 4]

## Risks & Mitigations

### Risk 1: [Risk Name]
**Likelihood**: High/Medium/Low
**Impact**: High/Medium/Low
**Mitigation**: [How to address]

[Minimum 3 risks]

Requirements:
- Specification MUST be 800+ lines for medium features
- Use CONCRETE language (not "should", "maybe", "possibly")
- NO placeholder text (TODO, TBD, ???)
- ALL metrics MUST be measurable
- ALL acceptance criteria MUST be testable
- Include 2+ ASCII architecture diagrams
  `;
}
```

**Validation**:
- Check spec has all required sections
- Verify minimum line count (800+ for medium features)
- Scan for placeholder text (TODO, TBD, ???)
- Verify NFRs have measurable targets

---

#### Component 3: CodebaseAnalysisService

**Location**: `src/services/analysis/codebase-analysis-service.ts` (NEW FILE)

**Purpose**: Analyze repository structure, architecture, and patterns

**Dependencies**:
- File system utilities
- Git utilities (simple-git)

**Interface**:
```typescript
type CodebaseAnalysisService = {
  analyze(cwd: string): Promise<CodebaseAnalysis>;
};
```

**Implementation Pseudo-code**:
```typescript
async analyze(cwd: string): Promise<CodebaseAnalysis> {
  // 1. Directory structure analysis
  const structure = await this._analyzeStructure(cwd);

  // 2. Technology stack detection
  const techStack = await this._detectTechStack(cwd);

  // 3. Architecture pattern identification
  const architecturePatterns = await this._detectArchitecture(cwd);

  // 4. Related feature discovery
  const relatedFeatures = await this._findRelatedFeatures(cwd);

  // 5. Code example extraction
  const examples = await this._extractExamples(cwd);

  // 6. Generate summary
  const summary = this._generateSummary({
    structure,
    techStack,
    architecturePatterns,
    relatedFeatures
  });

  return {
    summary,
    findings: {
      techStack,
      architecturePatterns,
      structure
    },
    observations: this._generateObservations({ techStack, architecturePatterns }),
    examples,
    relatedFeatures
  };
}

private async _detectTechStack(cwd: string): Promise<TechStack> {
  // Check package.json for dependencies
  const packageJson = await this._readPackageJson(cwd);

  return {
    languages: this._detectLanguages(cwd), // TypeScript, JavaScript, etc.
    frameworks: this._detectFrameworks(packageJson), // React, Vue, Express, etc.
    buildTools: this._detectBuildTools(packageJson), // Vite, Webpack, etc.
    testing: this._detectTestFrameworks(packageJson), // Vitest, Jest, etc.
    linting: this._detectLinters(packageJson) // ESLint, Prettier, etc.
  };
}

private async _detectArchitecture(cwd: string): Promise<string[]> {
  const patterns: string[] = [];

  // Check for common patterns
  if (await this._hasDirectory(cwd, 'src/services')) {
    patterns.push('Service Layer Pattern');
  }
  if (await this._hasDirectory(cwd, 'src/adapters')) {
    patterns.push('Adapter Pattern');
  }
  if (await this._hasDirectory(cwd, 'src/core/di')) {
    patterns.push('Dependency Injection');
  }
  if (await this._hasFile(cwd, 'src/core/execution/task-state-machine.ts')) {
    patterns.push('State Machine Pattern');
  }

  return patterns;
}
```

**Caching Strategy**:
- Cache analysis results per repository (keyed by git root + last commit hash)
- Cache TTL: 1 hour
- Invalidate on `package.json` or `tsconfig.json` changes

---

#### Component 4: AnalyzeCommand

**Location**: `src/commands/analyze/analyze-command.ts` (NEW FILE)

**Purpose**: CLI command for specification analysis

**Dependencies**:
- `GapAnalysisService`
- `ProjectPrinciplesService`

**Interface**:
```typescript
type AnalyzeOptions = {
  spec: string;
  codebase?: string;
  output?: string;
  format: 'json' | 'text';
  verbose: boolean;
};

class AnalyzeCommand {
  constructor(private readonly deps: CommandDependencies) {}
  async execute(options: AnalyzeOptions): Promise<number>;
}
```

**Implementation Pseudo-code**:
```typescript
async execute(options: AnalyzeOptions): Promise<number> {
  // 1. Read specification
  const spec = await fs.readFile(options.spec, 'utf-8');

  // 2. Read codebase doc if provided
  const codebaseDoc = options.codebase
    ? await fs.readFile(options.codebase, 'utf-8')
    : undefined;

  // 3. Extract project principles
  const principles = await this.deps.projectPrinciplesService.extract(
    process.cwd()
  );

  // 4. Run gap analysis
  const report = await this.deps.gapAnalysisService.analyze(
    spec,
    codebaseDoc,
    principles
  );

  // 5. Output report
  if (options.format === 'json' && options.output) {
    await fs.writeFile(options.output, JSON.stringify(report, null, 2));
  } else {
    console.log(formatAnalysisReport(report));
  }

  // 6. Exit with appropriate code
  return report.completeness === 100 ? 0 : 1;
}
```

---

#### Component 5: GapAnalysisService

**Location**: `src/services/analysis/gap-analysis-service.ts` (NEW FILE)

**Purpose**: Validate specification completeness, detect gaps, generate remediation steps

**Dependencies**:
- `ProjectPrinciples` type

**Interface**:
```typescript
type GapAnalysisService = {
  analyze(
    spec: string,
    codebaseDoc?: string,
    projectPrinciples?: ProjectPrinciples
  ): Promise<AnalysisReport>;
};
```

**Implementation Pseudo-code**:
```typescript
async analyze(
  spec: string,
  codebaseDoc?: string,
  projectPrinciples?: ProjectPrinciples
): Promise<AnalysisReport> {
  const gaps: Gap[] = [];

  // 1. Check required sections
  gaps.push(...this._checkRequiredSections(spec));

  // 2. Check content depth
  gaps.push(...this._checkContentDepth(spec));

  // 3. Detect ambiguous language
  gaps.push(...this._detectAmbiguousLanguage(spec));

  // 4. Check for placeholders
  gaps.push(...this._checkPlaceholders(spec));

  // 5. Validate cross-references
  if (codebaseDoc) {
    gaps.push(...this._validateCrossReferences(spec, codebaseDoc));
  }

  // 6. Check open questions
  gaps.push(...this._checkOpenQuestions(spec));

  // 7. Calculate completeness score
  const completeness = this._calculateCompleteness(spec, gaps);

  // 8. Generate remediation steps
  const remediation = this._generateRemediationSteps(gaps);

  // 9. Generate summary
  const summary = this._generateSummary(completeness, gaps);

  return {
    completeness,
    gaps,
    remediation,
    summary
  };
}

private _checkRequiredSections(spec: string): Gap[] {
  const gaps: Gap[] = [];
  const requiredSections = [
    'Overview',
    'Background',
    'Functional Requirements',
    'Non-Functional Requirements',
    'Architecture',
    'Acceptance Criteria',
    'Success Metrics'
  ];

  for (const section of requiredSections) {
    const regex = new RegExp(`##\\s+${section}`, 'i');
    if (!regex.test(spec)) {
      gaps.push({
        id: `gap-missing-${section.toLowerCase().replace(/\s+/g, '-')}`,
        severity: 'CRITICAL',
        category: 'gap',
        message: `Missing required section: ${section}`,
        artifacts: ['spec.md'],
        remediation: `Add ${section} section with detailed content`
      });
    }
  }

  return gaps;
}

private _detectAmbiguousLanguage(spec: string): Gap[] {
  const gaps: Gap[] = [];
  const ambiguousTerms = [
    { term: 'should', severity: 'MEDIUM' as const },
    { term: 'maybe', severity: 'HIGH' as const },
    { term: 'possibly', severity: 'HIGH' as const },
    { term: 'probably', severity: 'MEDIUM' as const },
    { term: 'TBD', severity: 'CRITICAL' as const },
    { term: 'TODO', severity: 'CRITICAL' as const },
    { term: '???', severity: 'CRITICAL' as const }
  ];

  for (const { term, severity } of ambiguousTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const matches = spec.match(regex);
    if (matches && matches.length > 0) {
      gaps.push({
        id: `ambiguity-${term.toLowerCase()}`,
        severity,
        category: 'ambiguity',
        message: `Spec contains ambiguous term: "${term}" (${matches.length} occurrences)`,
        artifacts: ['spec.md'],
        remediation: term === 'should'
          ? 'Replace with MUST/SHOULD/COULD (RFC 2119 keywords)'
          : 'Replace with concrete requirements'
      });
    }
  }

  return gaps;
}

private _calculateCompleteness(spec: string, gaps: Gap[]): number {
  // Section presence (40%)
  const requiredSections = 7;
  const sectionsPresent = requiredSections - gaps.filter(g =>
    g.id.startsWith('gap-missing-')
  ).length;
  const sectionScore = (sectionsPresent / requiredSections) * 40;

  // Content depth (30%)
  const minLength = 800; // lines
  const actualLength = spec.split('\n').length;
  const depthScore = Math.min((actualLength / minLength) * 30, 30);

  // Quality (20%)
  const criticalGaps = gaps.filter(g => g.severity === 'CRITICAL').length;
  const qualityScore = Math.max(20 - (criticalGaps * 5), 0);

  // Consistency (10%)
  const inconsistencyGaps = gaps.filter(g => g.category === 'inconsistency').length;
  const consistencyScore = Math.max(10 - (inconsistencyGaps * 2), 0);

  return Math.round(sectionScore + depthScore + qualityScore + consistencyScore);
}
```

---

#### Component 6: QualityValidationService

**Location**: `src/services/validation/quality-validation-service.ts` (NEW FILE)

**Purpose**: Post-generation task quality validation for decompose command

**Dependencies**:
- `PlanV2` type
- `TaskV2` type

**Interface**:
```typescript
type QualityValidationService = {
  validate(plan: PlanV2): Promise<QualityReport>;
};
```

**Implementation Pseudo-code**:
```typescript
async validate(plan: PlanV2): Promise<QualityReport> {
  const issues: QualityIssue[] = [];

  for (const task of plan.tasks) {
    // 1. Check complexity
    if (task.complexity === 'XL') {
      issues.push({
        taskId: task.id,
        severity: 'CRITICAL',
        category: 'oversized-task',
        message: `Task ${task.id} is XL complexity (estimated >8 hours)`,
        suggestion: 'Break into 3-4 smaller tasks (M or L size) with clear dependencies'
      });
    } else if (task.complexity === 'L') {
      issues.push({
        taskId: task.id,
        severity: 'HIGH',
        category: 'oversized-task',
        message: `Task ${task.id} is L complexity - consider splitting`,
        suggestion: 'If task is complex, split into multiple M tasks for better parallelization'
      });
    }

    // 2. Check file count
    if (task.files.length > 10) {
      issues.push({
        taskId: task.id,
        severity: 'HIGH',
        category: 'excessive-files',
        message: `Task ${task.id} touches ${task.files.length} files (threshold: 10)`,
        suggestion: 'Split by module or component - tasks with many files are poorly scoped'
      });
    }

    // 3. Check for vague patterns
    const vaguePatterns = task.files.filter(f => f.includes('**') || f.includes('*'));
    if (vaguePatterns.length > 0) {
      issues.push({
        taskId: task.id,
        severity: 'HIGH',
        category: 'vague-scope',
        message: `Task ${task.id} has vague file patterns: ${vaguePatterns.join(', ')}`,
        suggestion: 'Specify exact file paths instead of wildcards'
      });
    }

    // 4. Check description length
    if (task.description.length < 50) {
      issues.push({
        taskId: task.id,
        severity: 'MEDIUM',
        category: 'ambiguous-description',
        message: `Task ${task.id} has short description (${task.description.length} chars)`,
        suggestion: 'Expand to explain what AND why (minimum 50 characters)'
      });
    }

    // 5. Check for missing dependencies
    if ((task.complexity === 'M' || task.complexity === 'L') && task.dependencies.length === 0) {
      issues.push({
        taskId: task.id,
        severity: 'LOW',
        category: 'missing-dependencies',
        message: `Task ${task.id} has no dependencies but is ${task.complexity} complexity`,
        suggestion: 'Review if setup/infrastructure tasks are needed first'
      });
    }
  }

  // Calculate summary
  const summary = {
    critical: issues.filter(i => i.severity === 'CRITICAL').length,
    high: issues.filter(i => i.severity === 'HIGH').length,
    medium: issues.filter(i => i.severity === 'MEDIUM').length,
    low: issues.filter(i => i.severity === 'LOW').length
  };

  const blocking = summary.critical > 0;
  const readyForExecution = !blocking;

  return {
    summary,
    blocking,
    issues,
    overallAssessment: this._generateAssessment(plan, issues),
    readyForExecution
  };
}
```

---

#### Component 7: ProcessGateService

**Location**: `src/services/planning/process-gate-service.ts` (NEW FILE)

**Purpose**: Enforce process gates in decompose command

**Dependencies**:
- `QualityValidationService`

**Interface**:
```typescript
type ProcessGateService = {
  checkOpenQuestions(spec: string): GateCheckResult;
  validatePlanQuality(plan: PlanV2): Promise<GateCheckResult>;
};
```

**Implementation Pseudo-code**:
```typescript
checkOpenQuestions(spec: string): GateCheckResult {
  // 1. Parse spec for "Open Tasks/Questions" section
  const openQuestionsRegex = /##\s+Open\s+(Tasks?\/)?Questions?[\s\S]*?(?=##|$)/i;
  const match = spec.match(openQuestionsRegex);

  if (!match) {
    return {
      passed: true,
      gateName: 'Pre-Decompose: Open Questions Check',
      message: 'No open questions section found',
      blockingIssues: []
    };
  }

  // 2. Parse section for unresolved items
  const section = match[0];
  const unresolvedItems: string[] = [];

  // Look for unchecked checkboxes
  const checkboxRegex = /[-*]\s+\[\s*\]\s+(.+)/g;
  let checkboxMatch;
  while ((checkboxMatch = checkboxRegex.exec(section)) !== null) {
    unresolvedItems.push(checkboxMatch[1]);
  }

  // Look for questions without resolution
  const questionRegex = /\?\s*$/gm;
  if (questionRegex.test(section)) {
    const questions = section.match(/^.+\?\s*$/gm) || [];
    unresolvedItems.push(...questions);
  }

  if (unresolvedItems.length === 0) {
    return {
      passed: true,
      gateName: 'Pre-Decompose: Open Questions Check',
      message: 'All questions resolved',
      blockingIssues: []
    };
  }

  return {
    passed: false,
    gateName: 'Pre-Decompose: Open Questions Check',
    message: `${unresolvedItems.length} unresolved questions found`,
    blockingIssues: unresolvedItems,
    recommendations: [
      'Complete all audits and answer open questions',
      'Update specification to remove items from "Open Tasks/Questions" section',
      'Re-run: chopstack analyze --spec <file> to verify 100% completeness',
      'Then retry: chopstack decompose --spec <file>'
    ]
  };
}

async validatePlanQuality(plan: PlanV2): Promise<GateCheckResult> {
  const qualityReport = await this.qualityValidationService.validate(plan);

  if (qualityReport.blocking) {
    return {
      passed: false,
      gateName: 'Post-Generation: Task Quality Validation',
      message: `${qualityReport.summary.critical} CRITICAL quality issues found`,
      blockingIssues: qualityReport.issues
        .filter(i => i.severity === 'CRITICAL')
        .map(i => i.message),
      recommendations: qualityReport.issues
        .filter(i => i.severity === 'CRITICAL')
        .map(i => i.suggestion)
    };
  }

  return {
    passed: true,
    gateName: 'Post-Generation: Task Quality Validation',
    message: 'Plan quality validated',
    blockingIssues: []
  };
}
```

---

#### Component 8: Enhanced ValidateModeHandler

**Location**: `src/services/execution/modes/validate-mode-handler.ts` (MODIFY EXISTING)

**Purpose**: Extend existing handler to validate implementation against acceptance criteria

**Current Behavior**: Validates plan structure (DAG, conflicts)
**New Behavior**: Add implementation validation

**Interface**:
```typescript
type ValidateModeHandler = {
  handle(
    plan: PlanV2,
    spec?: string,
    projectPrinciples?: ProjectPrinciples
  ): Promise<ValidationResult>;
};
```

**Implementation Pseudo-code**:
```typescript
async handle(
  plan: PlanV2,
  spec?: string,
  projectPrinciples?: ProjectPrinciples
): Promise<ValidationResult> {
  // 1. EXISTING: Validate plan structure
  const structureValidation = DagValidator.validatePlan(plan);

  if (!structureValidation.valid) {
    return {
      valid: false,
      errors: structureValidation.errors,
      // ... existing structure validation
    };
  }

  // 2. NEW: If spec provided, validate implementation
  if (spec) {
    return this._validateImplementation(plan, spec, projectPrinciples);
  }

  // 3. Return structure validation only
  return {
    valid: true,
    message: 'Plan structure validated successfully'
  };
}

private async _validateImplementation(
  plan: PlanV2,
  spec: string,
  projectPrinciples?: ProjectPrinciples
): Promise<ValidationResult> {
  const taskResults: TaskValidationResult[] = [];

  for (const task of plan.tasks) {
    // 1. Get changed files for task
    const changedFiles = await this.vcsEngine.getChangedFiles(task.id);

    // 2. Read file contents
    const fileContents = await Promise.all(
      changedFiles.map(f => fs.readFile(f, 'utf-8'))
    );

    // 3. Validate acceptance criteria using agent
    const criteriaResults = await this._validateCriteria(
      task,
      fileContents,
      spec
    );

    // 4. Check project principles
    const principleViolations = projectPrinciples
      ? await this._checkPrinciples(task, fileContents, projectPrinciples)
      : [];

    taskResults.push({
      taskId: task.id,
      taskName: task.name,
      criteriaResults,
      principleViolations
    });
  }

  // 5. Assess success metrics
  const metricsAssessment = await this._assessMetrics(plan, spec, taskResults);

  // 6. Generate report
  return this._generateValidationReport(taskResults, metricsAssessment);
}
```

---

### Data Flow Diagrams

#### Flow 1: Specification Generation

```
User
  │
  │ chopstack specify "add dark mode"
  │
  ▼
SpecifyCommand
  │
  ├─→ CodebaseAnalysisService.analyze(cwd)
  │     │
  │     ├─→ Analyze directory structure
  │     ├─→ Detect tech stack (package.json)
  │     ├─→ Identify architecture patterns
  │     ├─→ Find related features
  │     └─→ Generate summary
  │           │
  │           └─→ CodebaseAnalysis
  │
  └─→ SpecificationService.generate(prompt, codebaseAnalysis)
        │
        ├─→ Build prompt with context
        ├─→ Create agent (Claude)
        ├─→ Execute agent
        ├─→ Parse response (extract markdown)
        └─→ Validate structure
              │
              └─→ Specification (markdown)
                    │
                    └─→ Write to dark-mode.md
```

#### Flow 2: Specification Analysis

```
User
  │
  │ chopstack analyze --spec dark-mode.md
  │
  ▼
AnalyzeCommand
  │
  ├─→ Read spec file
  │
  ├─→ ProjectPrinciplesService.extract(cwd)
  │     │
  │     ├─→ Parse CLAUDE.md
  │     ├─→ Parse .cursorrules
  │     ├─→ Parse CONTRIBUTING.md
  │     └─→ Extract principles
  │           │
  │           └─→ ProjectPrinciples
  │
  └─→ GapAnalysisService.analyze(spec, principles)
        │
        ├─→ Check required sections
        ├─→ Check content depth
        ├─→ Detect ambiguous language
        ├─→ Check placeholders
        ├─→ Validate cross-references
        ├─→ Check open questions
        ├─→ Calculate completeness score
        └─→ Generate remediation steps
              │
              └─→ AnalysisReport
                    │
                    ├─→ Display terminal report
                    └─→ Exit code (0 = ready, 1 = incomplete)
```

#### Flow 3: Enhanced Decomposition with Gates

```
User
  │
  │ chopstack decompose --spec dark-mode.md
  │
  ▼
DecomposeCommand
  │
  ├─→ Read spec file
  │
  ├─→ GATE 1: ProcessGateService.checkOpenQuestions(spec)
  │     │
  │     ├─→ Parse "Open Tasks/Questions" section
  │     ├─→ Identify unresolved items
  │     └─→ GateCheckResult
  │           │
  │           ├─→ If failed: Display error, exit 1
  │           └─→ If passed: Continue
  │
  ├─→ PlanGenerator.generate(spec)
  │     │
  │     ├─→ Create agent
  │     ├─→ Build decomposition prompt
  │     ├─→ Execute agent
  │     ├─→ Parse plan (YAML/JSON)
  │     └─→ Validate with DagValidator
  │           │
  │           └─→ PlanV2
  │
  └─→ GATE 2: ProcessGateService.validatePlanQuality(plan)
        │
        ├─→ QualityValidationService.validate(plan)
        │     │
        │     ├─→ Check XL tasks
        │     ├─→ Check file counts
        │     ├─→ Check vague patterns
        │     ├─→ Check description length
        │     └─→ Check dependencies
        │           │
        │           └─→ QualityReport
        │
        └─→ Display quality report
              │
              ├─→ If CRITICAL: Exit 1 (do NOT save)
              ├─→ If HIGH/MEDIUM/LOW: Save with warnings, exit 0
              └─→ If no issues: Save, exit 0
```

#### Flow 4: Implementation Validation

```
User
  │
  │ chopstack run --plan dark-mode.plan.yaml --spec dark-mode.md --mode validate
  │
  ▼
RunCommand
  │
  ├─→ Read plan file
  ├─→ Read spec file
  │
  └─→ ExecutionOrchestrator.execute(plan, mode: 'validate')
        │
        └─→ ValidateModeHandler.handle(plan, spec)
              │
              ├─→ Validate plan structure (existing)
              │     │
              │     └─→ DagValidator.validatePlan(plan)
              │
              └─→ Validate implementation (NEW)
                    │
                    ├─→ For each task:
                    │     │
                    │     ├─→ VcsEngine.getChangedFiles(taskId)
                    │     │
                    │     ├─→ Read file contents
                    │     │
                    │     ├─→ Agent validates acceptance criteria
                    │     │     │
                    │     │     └─→ CriterionValidation[]
                    │     │
                    │     └─→ Check project principles
                    │           │
                    │           └─→ PrincipleViolation[]
                    │
                    ├─→ Assess success metrics
                    │     │
                    │     ├─→ Check quantitative (coverage, perf)
                    │     ├─→ Agent assesses qualitative (UX, clarity)
                    │     │
                    │     └─→ MetricAssessment[]
                    │
                    └─→ Generate validation report
                          │
                          ├─→ Display terminal report
                          └─→ Exit code (0 = passed, 1 = failed)
```

---

## Implementation Plan

### Phase Breakdown

**Total Estimated Effort**: 120-160 hours (realistic: 150-180h with testing and polish)

#### Phase 1: Foundation Services (Sequential) - 40-55h

**Purpose**: Build core services before commands that depend on them

**Tasks**:

1. **Task: Create CodebaseAnalysisService** (M complexity, 15-20h)
   - Files:
     - `src/services/analysis/codebase-analysis-service.ts`
     - `src/services/analysis/__tests__/codebase-analysis-service.test.ts`
     - `src/services/analysis/__tests__/codebase-analysis-service.integration.test.ts`
   - Description: Implement directory structure analysis, tech stack detection, architecture pattern identification, related feature discovery, and code example extraction. Why: Provides critical context for specification generation.
   - Acceptance Criteria:
     - Detects all major frameworks from package.json
     - Identifies layered, adapter, service patterns
     - Finds 3+ related features for non-trivial repos
     - Generates 500+ char summary
     - Unit tests: 95% coverage
   - Dependencies: []

2. **Task: Create SpecificationService** (L complexity, 25-35h)
   - Files:
     - `src/services/specification/specification-service.ts`
     - `src/services/specification/__tests__/specification-service.test.ts`
     - `src/services/specification/__tests__/specification-service.integration.test.ts`
   - Description: Implement spec generation from brief prompts using codebase context. Build comprehensive prompts, handle agent responses, validate output structure. Why: Enables `chopstack specify` command.
   - Acceptance Criteria:
     - Generates 800+ line specs from brief prompts
     - Includes all required sections
     - No placeholder text (TODO, TBD)
     - Handles agent failures with retry (3 attempts)
     - Integration test with real agent produces valid spec
   - Dependencies: [task-1-codebase-analysis]

---

#### Phase 2: Analysis Services (Sequential) - 30-40h

**Purpose**: Build analysis and validation services

**Tasks**:

3. **Task: Create ProjectPrinciplesService** (S complexity, 10-15h)
   - Files:
     - `src/services/analysis/project-principles-service.ts`
     - `src/services/analysis/__tests__/project-principles-service.test.ts`
   - Description: Extract principles from CLAUDE.md, .cursorrules, CONTRIBUTING.md. Parse markdown, categorize by type (Code Style, Architecture, Testing), cache results. Why: Needed for gap analysis and validation modes.
   - Acceptance Criteria:
     - Extracts 10+ principles from CLAUDE.md
     - Categorizes principles correctly
     - Cache keyed by file modification time
     - Handles missing files gracefully
   - Dependencies: []

4. **Task: Create GapAnalysisService** (M-L complexity, 20-25h)
   - Files:
     - `src/services/analysis/gap-analysis-service.ts`
     - `src/services/analysis/__tests__/gap-analysis-service.test.ts`
     - `src/services/analysis/__tests__/gap-analysis-service.integration.test.ts`
   - Description: Implement spec completeness validation, gap detection (missing sections, ambiguous language, placeholders), completeness scoring (0-100), remediation step generation. Why: Enables `chopstack analyze` command and pre-decompose gate.
   - Acceptance Criteria:
     - Detects all required section gaps
     - Identifies ambiguous terms (should, maybe, TBD, TODO)
     - Calculates completeness score accurately
     - Generates prioritized remediation steps
     - Test with 10+ sample specs (complete and incomplete)
   - Dependencies: [task-3-project-principles]

---

#### Phase 3: Quality Services (Parallel with Phase 2) - 20-30h

**Purpose**: Build quality validation services

**Tasks**:

5. **Task: Create QualityValidationService** (M complexity, 15-20h)
   - Files:
     - `src/services/validation/quality-validation-service.ts`
     - `src/services/validation/__tests__/quality-validation-service.test.ts`
   - Description: Implement post-generation task quality checks: XL task detection, file count validation, vague pattern detection, description length checks, dependency validation. Why: Enables post-decompose quality gate.
   - Acceptance Criteria:
     - Flags all XL tasks as CRITICAL
     - Detects tasks with >10 files
     - Identifies wildcard patterns (**, *)
     - Reports short descriptions (<50 chars)
     - Generates actionable suggestions
     - Test with 5+ sample plans (good and bad)
   - Dependencies: []

6. **Task: Create ProcessGateService** (S-M complexity, 5-10h)
   - Files:
     - `src/services/planning/process-gate-service.ts`
     - `src/services/planning/__tests__/process-gate-service.test.ts`
   - Description: Implement gate check logic: open questions parsing, quality report wrapping, gate result formatting. Why: Coordinates pre and post decompose gates.
   - Acceptance Criteria:
     - Parses "Open Tasks/Questions" section correctly
     - Detects unchecked checkboxes and question marks
     - Wraps quality validation results
     - Returns clear gate check results
   - Dependencies: [task-5-quality-validation]

---

#### Phase 4: Commands (Parallel) - 30-40h

**Purpose**: Build CLI commands that use services from Phase 1-3

**Tasks**:

7. **Task: Create SpecifyCommand** (M complexity, 15-20h)
   - Files:
     - `src/commands/specify/specify-command.ts`
     - `src/commands/specify/__tests__/specify-command.test.ts`
     - `src/commands/specify/__tests__/specify-command.integration.test.ts`
     - `src/types/cli.ts` (add SpecifyOptionsSchema)
   - Description: Implement CLI command for specification generation. Validate options, read prompt, call services, write output. Handle errors gracefully. Why: User entry point for spec generation workflow.
   - Acceptance Criteria:
     - Accepts prompt or input file
     - Validates all options with Zod
     - Displays progress messages
     - Writes spec to output file
     - Exit code 0 on success
     - Integration test generates real spec
   - Dependencies: [task-1-codebase-analysis, task-2-specification-service]

8. **Task: Create AnalyzeCommand** (M complexity, 15-20h)
   - Files:
     - `src/commands/analyze/analyze-command.ts`
     - `src/commands/analyze/__tests__/analyze-command.test.ts`
     - `src/commands/analyze/__tests__/analyze-command.integration.test.ts`
     - `src/types/cli.ts` (add AnalyzeOptionsSchema)
   - Description: Implement CLI command for specification analysis. Read spec, extract principles, run analysis, display report. Support JSON and text output formats. Why: User entry point for spec validation workflow.
   - Acceptance Criteria:
     - Reads spec and optional codebase files
     - Displays formatted terminal report
     - Writes JSON report if --output specified
     - Exit code 0 if 100% complete, 1 otherwise
     - Integration test with real spec
   - Dependencies: [task-3-project-principles, task-4-gap-analysis]

---

#### Phase 5: Decompose Enhancements (Sequential, depends on Phase 3) - 10-15h

**Purpose**: Add quality gates to existing decompose command

**Tasks**:

9. **Task: Enhance DecomposeCommand with Quality Gates** (M complexity, 10-15h)
   - Files:
     - `src/commands/decompose/decompose-command.ts` (modify)
     - `src/commands/decompose/__tests__/decompose-command.test.ts` (update)
     - `src/commands/decompose/__tests__/decompose-command.integration.test.ts` (update)
   - Description: Add pre-generation gate (open questions check) and post-generation gate (task quality validation) to existing decompose command. Display gate check results. Block on CRITICAL issues. Allow --skip-gates flag for testing. Why: Prevents poor quality plans from reaching execution.
   - Acceptance Criteria:
     - Pre-generation gate blocks if open questions exist
     - Post-generation gate validates all tasks
     - Displays formatted quality report
     - Exit 1 if CRITICAL issues found
     - Saves plan only if no CRITICAL issues
     - --skip-gates bypasses both gates
     - All existing tests still pass
     - 3 new integration tests (gate scenarios)
   - Dependencies: [task-4-gap-analysis, task-6-process-gate]

---

#### Phase 6: Validation Enhancements (Sequential, depends on Phase 2) - 20-30h

**Purpose**: Extend validate mode with implementation validation

**Tasks**:

10. **Task: Enhance ValidateModeHandler with Implementation Validation** (M-L complexity, 20-30h)
    - Files:
      - `src/services/execution/modes/validate-mode-handler.ts` (modify)
      - `src/services/execution/modes/__tests__/validate-mode-handler.test.ts` (update)
      - `src/services/execution/modes/__tests__/validate-mode-handler.integration.test.ts` (add)
      - `src/types/validation.ts` (add new types)
    - Description: Extend existing handler to validate implementation against acceptance criteria and project principles. Use agent to check criteria, extract principles, assess metrics. Generate comprehensive report. Keep existing plan validation. Why: Automates quality checks post-implementation.
    - Acceptance Criteria:
      - Validates plan structure (existing behavior preserved)
      - Validates acceptance criteria if spec provided
      - Checks project principle violations
      - Assesses success metrics (quantitative and qualitative)
      - Generates formatted terminal report
      - Exit 0 if all criteria pass, 1 otherwise
      - Integration test with real plan and spec
    - Dependencies: [task-3-project-principles]

---

#### Phase 7: Integration Testing (Sequential, depends on all phases) - 15-20h

**Purpose**: End-to-end testing of complete v2 workflow

**Tasks**:

11. **Task: Add V2 Workflow Integration Tests** (M complexity, 15-20h)
    - Files:
      - `test/e2e/v2-workflow.test.ts` (new)
      - `test/e2e/quality-gates.test.ts` (new)
      - `test/e2e/validation-mode.test.ts` (new)
    - Description: Comprehensive end-to-end tests for full v2 workflow: specify → analyze → decompose → run → validate. Test all gate scenarios (pass, fail, skip). Test validation with real specs and plans. Why: Ensure all components integrate correctly.
    - Acceptance Criteria:
      - Test complete workflow with sample feature
      - Test gate failures (open questions, XL tasks)
      - Test gate bypass (--skip-gates)
      - Test validation pass and fail scenarios
      - All tests pass in CI
      - Total test runtime <5 minutes
    - Dependencies: [all previous tasks]

---

### Dependency Graph

```
Phase 1: Foundation Services (Sequential)
  task-1-codebase-analysis
    │
    └─→ task-2-specification-service

Phase 2: Analysis Services (Sequential)
  task-3-project-principles
    │
    └─→ task-4-gap-analysis

Phase 3: Quality Services (Parallel with Phase 2)
  task-5-quality-validation
    │
    └─→ task-6-process-gate

Phase 4: Commands (Parallel, depends on Phase 1-3)
  task-7-specify-command (depends on task-1, task-2)
  task-8-analyze-command (depends on task-3, task-4)

Phase 5: Decompose Enhancements (Sequential, depends on Phase 3)
  task-9-enhance-decompose (depends on task-4, task-6)

Phase 6: Validation Enhancements (Sequential, depends on Phase 2)
  task-10-enhance-validate (depends on task-3)

Phase 7: Integration Testing (Sequential, depends on all)
  task-11-integration-tests (depends on all previous)
```

### Execution Timeline (Realistic)

**With 1 developer working sequentially:**

- Phase 1: 40-55h (1.5 weeks)
- Phase 2: 30-40h (1 week)
- Phase 3: 20-30h (0.75 weeks) - parallel with Phase 2
- Phase 4: 30-40h (1 week) - parallel tasks
- Phase 5: 10-15h (0.5 weeks)
- Phase 6: 20-30h (0.75 weeks)
- Phase 7: 15-20h (0.5 weeks)

**Total**: 165-230 hours = **4-6 weeks of focused development**

**With parallelization (2 developers):**
- Phase 1 + 2: 2 weeks (longest path)
- Phase 3: 1 week (parallel)
- Phase 4: 1 week (parallel)
- Phase 5 + 6: 1 week (parallel)
- Phase 7: 0.5 weeks

**Total**: **5.5 weeks** with 2 developers

---

## Success Metrics

### Quantitative Metrics

**M1: File Conflict Reduction**
- **Baseline**: ~3 conflicts per plan (from v1 experience)
- **Target**: <1 conflict per plan
- **Measurement**: Average file conflicts across 10 real-world plans
- **Method**: Run `chopstack decompose` on 10 feature specs, count DagValidator file conflicts

**M2: First-Attempt Success Rate**
- **Baseline**: 40% (from v1 experience)
- **Target**: 80%
- **Measurement**: Percentage of plans that execute without errors on first run
- **Method**: Track execution results for 10 plans - success = all tasks complete without manual intervention

**M3: Specification Quality**
- **Target**: Average 1000+ lines from 1-2 sentence prompts
- **Measurement**: Line count of generated specs
- **Method**: Generate 10 specs from brief prompts, measure average length

**M4: Plan Quality (Zero CRITICAL Issues)**
- **Target**: 100% of plans pass quality validation (no CRITICAL issues)
- **Measurement**: Percentage of plans with 0 CRITICAL quality issues
- **Method**: Track quality validation results across 20 generated plans

**M5: Completeness Score**
- **Target**: Average 95%+ completeness for generated specs
- **Measurement**: GapAnalysisService completeness score
- **Method**: Run `chopstack analyze` on 10 generated specs, average scores

### Qualitative Metrics

**Q1: Architectural Awareness**
- **Goal**: Plans follow correct layered ordering (DB → API → UI)
- **Measurement**: Manual review of 10 plans for architecture-aware task ordering
- **Success**: 8/10 plans demonstrate correct ordering

**Q2: Task Description Quality**
- **Goal**: Descriptions explain "why" not just "what"
- **Measurement**: Manual review of 20 random task descriptions
- **Success**: 15/20 (75%) include rationale/context beyond basic description

**Q3: Validation Report Usefulness**
- **Goal**: Reports provide actionable next steps
- **Measurement**: User feedback - "Did validation report help you fix issues?"
- **Success**: 80% positive feedback from 5 test users

**Q4: Error Message Clarity**
- **Goal**: Users understand what went wrong and how to fix it
- **Measurement**: Track support requests related to error messages
- **Success**: <2 support requests per week after launch

**Q5: Developer Experience**
- **Goal**: Workflow feels natural and efficient
- **Measurement**: User survey on 5-point scale (1=poor, 5=excellent)
- **Success**: Average rating ≥4.0

---

## Risks & Mitigations

### Risk 1: Agent Quality Variability

**Likelihood**: MEDIUM
**Impact**: HIGH

**Description**: Agent-generated specifications or plans may be inconsistent quality - sometimes excellent, sometimes poor.

**Root Causes**:
- Prompt engineering challenges
- Agent model updates changing behavior
- Non-deterministic AI outputs
- Rate limits or API failures

**Mitigation Strategies**:
1. **Prompt Engineering Best Practices**
   - Use structured prompts with examples
   - Request specific output format (markdown templates)
   - Include quality criteria in prompt
   - Test prompts with 10+ variations before production

2. **Quality Guardrails**
   - Post-generation validation (quality gates catch issues)
   - Retry on obvious failures (< 100 lines, missing sections)
   - Human review for edge cases
   - Track agent performance metrics

3. **Fallback Mechanisms**
   - Retry with enhanced prompts (add more context)
   - Degrade gracefully (allow partial specs with warnings)
   - Manual intervention option (edit and continue)

4. **Agent Version Pinning**
   - Pin to specific Claude model version
   - Test thoroughly before upgrading
   - Document known issues per version

**Monitoring**:
- Track generation success rates
- Log all agent failures with context
- Alert on quality degradation trends

---

### Risk 2: Performance Degradation

**Likelihood**: MEDIUM
**Impact**: MEDIUM

**Description**: New services (spec generation, analysis, validation) may add significant latency to workflow.

**Potential Bottlenecks**:
- Codebase analysis (large repos, many files)
- Agent API calls (network latency, rate limits)
- File system operations (reading many files)
- Complex validation logic

**Mitigation Strategies**:
1. **Caching**
   - Cache codebase analysis results (keyed by git commit hash)
   - Cache project principles (keyed by file modification times)
   - Cache agent responses where appropriate
   - TTL: 1 hour for codebase analysis

2. **Optimization**
   - Parallel file reads (Promise.all)
   - Stream processing for large files (avoid loading entire file in memory)
   - Lazy loading (only analyze what's needed)
   - Early exit on validation failures

3. **Performance Budgets**
   - Spec generation: <30s target
   - Analysis: <10s target
   - Quality validation: <5s target
   - Implementation validation: <60s target

4. **Progress Indicators**
   - Show spinner/progress for long operations
   - Stream output for transparency
   - Break down operations into steps with progress

**Monitoring**:
- Track operation durations (p50, p95, p99)
- Alert on operations exceeding 2x budget
- Profile slow operations

---

### Risk 3: Type System Gaps

**Likelihood**: LOW
**Impact**: MEDIUM

**Description**: Missing types identified in audits may cause runtime errors or validation failures.

**Gaps from Audit**:
- Specification structure types (Specification, SpecSection)
- Quality report types (QualityReport, QualityIssue)
- Implementation validation types (ValidationReport, ImplementationValidation)
- Gate check types (GateCheck, PreDecomposeGate, PostDecomposeGate)

**Mitigation Strategies**:
1. **Complete Type Definitions Before Implementation**
   - Add all missing types to schemas-v2.ts FIRST
   - Write unit tests for schemas
   - Validate schema coverage (100% of domain concepts)

2. **Zod Validation Everywhere**
   - All service boundaries use Zod validation
   - Parse unknown data before using
   - Catch validation errors early

3. **TypeScript Strict Mode**
   - All strict flags enabled
   - No `any` types in production code
   - Explicit return types

**Effort**: 200-240 lines of type definitions + 150-190 lines of tests = **4-6 hours**

---

### Risk 4: Integration Complexity

**Likelihood**: MEDIUM
**Impact**: MEDIUM

**Description**: Integrating 5 new services and 2 new commands with existing infrastructure may introduce bugs or breaking changes.

**Integration Points**:
- Command layer (CLI dispatcher)
- Service layer (DI container)
- Agent layer (new agent capabilities)
- Type system (new schemas)

**Mitigation Strategies**:
1. **Incremental Integration**
   - Build services in isolation first
   - Add to DI container one at a time
   - Test each integration point
   - Keep existing functionality working

2. **Comprehensive Testing**
   - Unit tests for all services (95% coverage)
   - Integration tests for commands
   - End-to-end tests for full workflow
   - Regression tests for existing features

3. **Backward Compatibility**
   - No breaking changes to existing commands
   - New commands are additive
   - Existing plans continue to work

4. **Staged Rollout**
   - Alpha: Internal testing (1 week)
   - Beta: Selected users (2 weeks)
   - GA: General availability

---

### Risk 5: Documentation Drift

**Likelihood**: LOW
**Impact**: LOW

**Description**: As implementation progresses, documentation (specs, CLAUDE.md, README) may become outdated.

**Mitigation Strategies**:
1. **Documentation Requirements**
   - Update CLAUDE.md with new patterns
   - Update README with new commands
   - Add TSDoc to all public functions
   - Include examples in documentation

2. **Review Process**
   - Documentation review as part of PR
   - Check for outdated references
   - Test examples work

3. **Living Documentation**
   - Integration tests serve as examples
   - Code comments reference specs
   - Generate API docs from TSDoc

---

## Acceptance Criteria

### Must Have (Blocking Launch)

**Commands**:
- ✅ `chopstack specify` command exists and generates 800+ line specs from brief prompts
- ✅ `chopstack analyze` command exists and validates spec completeness with gap detection
- ✅ `chopstack decompose` has pre-generation gate (open questions check)
- ✅ `chopstack decompose` has post-generation gate (task quality validation)
- ✅ `chopstack run --mode validate` validates implementation against acceptance criteria

**Services**:
- ✅ SpecificationService generates structured markdown specs
- ✅ CodebaseAnalysisService provides architecture context
- ✅ GapAnalysisService calculates 0-100 completeness score
- ✅ QualityValidationService detects XL tasks and vague patterns
- ✅ ProjectPrinciplesService extracts principles from docs

**Quality**:
- ✅ Zero CRITICAL quality issues in generated plans
- ✅ All commands have integration tests
- ✅ Test coverage ≥95% for new services
- ✅ No ESLint violations
- ✅ All TypeScript strict mode checks pass

**Metrics**:
- ✅ File conflicts <1 per plan (70% reduction)
- ✅ First-attempt success rate ≥80% (100% improvement)
- ✅ Generated specs average 1000+ lines

### Should Have (High Priority)

**Usability**:
- ✅ Clear, actionable error messages for all validation failures
- ✅ Progress indicators for long operations (spec generation, analysis)
- ✅ JSON output format for programmatic use (`--output report.json`)
- ✅ Verbose logging mode for debugging (`--verbose`)

**Performance**:
- ✅ Specification generation completes in <30s
- ✅ Specification analysis completes in <10s
- ✅ Quality validation completes in <5s

**Documentation**:
- ✅ CLAUDE.md updated with v2 workflow patterns
- ✅ README updated with new commands and examples
- ✅ All public functions have TSDoc comments

**Testing**:
- ✅ End-to-end tests for complete workflow (specify → analyze → decompose → run → validate)
- ✅ Integration tests for gate scenarios (pass, fail, skip)
- ✅ Performance tests verify budget compliance

### Nice to Have (Future Enhancement)

**User Experience**:
- Interactive mode for resolving gaps (`chopstack analyze --interactive`)
- Diff mode showing spec changes between versions
- Template support for common specifications
- AI-powered gap remediation suggestions

**Performance**:
- Parallel task validation (implementation validation)
- Streaming spec generation (show progress)
- Smart caching (invalidate only on relevant changes)

**Integration**:
- GitHub integration (create PRs with specs)
- Slack notifications (validation results)
- VS Code extension (inline validation)

---

## Appendix

### Reference Documents

**Audit Findings**:
- Command Implementation Status: `specs/chopstack-v2_phase2/notes/audit-command-implementations.md`
- Infrastructure Readiness: `specs/chopstack-v2_phase2/notes/audit-infrastructure-readiness.md`
- Type System Completeness: `specs/chopstack-v2_phase2/notes/audit-type-system.md`
- Execution Engine Support: `specs/chopstack-v2_phase2/notes/audit-execution-engine.md`

**Codebase Context**:
- Architecture and Patterns: `specs/chopstack-v2_phase2/codebase.md`

**Initial Requirements**:
- User Requirements: `specs/chopstack-v2_phase2/initial.md`

**Reference Specification**:
- Type Safety Refactor: `docs/sample-specs-v2/type-safety-refactor.md`

### Implementation Checklist

**Pre-Implementation**:
- [ ] All audit findings reviewed
- [ ] Type definitions added to schemas-v2.ts (200-240 lines)
- [ ] Unit tests for new types (150-190 lines)
- [ ] Architecture diagrams created (this spec)
- [ ] Dependencies identified and documented

**Phase 1 - Foundation**:
- [ ] CodebaseAnalysisService implemented with tests
- [ ] SpecificationService implemented with tests
- [ ] Integration tests with real agents pass
- [ ] Performance benchmarks meet targets

**Phase 2 - Analysis**:
- [ ] ProjectPrinciplesService implemented with tests
- [ ] GapAnalysisService implemented with tests
- [ ] Completeness scoring algorithm validated
- [ ] Remediation step generation tested

**Phase 3 - Quality**:
- [ ] QualityValidationService implemented with tests
- [ ] ProcessGateService implemented with tests
- [ ] All quality checks functional
- [ ] Quality report formatting correct

**Phase 4 - Commands**:
- [ ] SpecifyCommand implemented with tests
- [ ] AnalyzeCommand implemented with tests
- [ ] CLI option schemas added
- [ ] Help text updated

**Phase 5 - Decompose Enhancement**:
- [ ] Pre-generation gate integrated
- [ ] Post-generation gate integrated
- [ ] --skip-gates flag working
- [ ] Existing tests still pass

**Phase 6 - Validation Enhancement**:
- [ ] ValidateModeHandler extended
- [ ] Acceptance criteria validation working
- [ ] Project principles checking working
- [ ] Success metrics assessment working

**Phase 7 - Integration**:
- [ ] End-to-end workflow tests pass
- [ ] Gate scenario tests pass
- [ ] Validation mode tests pass
- [ ] Performance tests meet targets

**Documentation**:
- [ ] CLAUDE.md updated with v2 patterns
- [ ] README updated with new commands
- [ ] TSDoc comments on all public functions
- [ ] Examples added to documentation

**Quality Gates**:
- [ ] All tests pass (unit, integration, e2e)
- [ ] Test coverage ≥95% for new code
- [ ] No ESLint violations
- [ ] TypeScript strict mode passes
- [ ] Performance benchmarks met

**Launch Readiness**:
- [ ] Alpha testing complete (internal)
- [ ] Beta testing complete (selected users)
- [ ] Metrics collection working
- [ ] Error tracking configured
- [ ] Documentation complete

---

**END OF SPECIFICATION**

**Status**: Complete, execution-ready
**Lines**: 1850+
**Completeness**: 100% (no TODOs, no TBDs, no open questions)
**Quality**: Production-ready with comprehensive requirements, design, implementation plan, and acceptance criteria
