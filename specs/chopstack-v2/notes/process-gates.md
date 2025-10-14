# Chopstack v2 Process Gates

This document visualizes the complete gated workflow that prevents plan expansion and ensures quality.

## Process Flow with Gates

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SPECIFY PHASE                                                │
│    chopstack specify "feature" → feature.md                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. ANALYZE PHASE - Identify Gaps & Open Questions              │
│    chopstack analyze --spec feature.md                         │
│                                                                 │
│    Output:                                                      │
│    - Completeness: 60%                                          │
│    - 3 CRITICAL gaps, 2 HIGH gaps                               │
│    - Open Questions: 2 (audit needed, architecture decision)    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. RESOLVE OPEN QUESTIONS (Manual Step)                        │
│    - Document in spec.md "Open Tasks/Questions" section        │
│    - Complete required audits (count files, estimate)          │
│    - Make architecture decisions                               │
│    - Fix identified gaps                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. RE-ANALYZE Until Complete                                   │
│    chopstack analyze --spec feature.md                         │
│                                                                 │
│    Output:                                                      │
│    - Completeness: 100% ✓                                       │
│    - Open Questions: 0 ✓                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    ╔═══════════════╗
                    ║  GATE 1       ║
                    ║  Open Qs = 0  ║
                    ╚═══════════════╝
                            ↓ ✓ PASS
┌─────────────────────────────────────────────────────────────────┐
│ 5. DECOMPOSE PHASE - PRE-GENERATION GATE                       │
│    chopstack decompose --spec feature.md                       │
│                                                                 │
│    Step 1: Check spec for "Open Tasks/Questions" section       │
│    ├─ Section exists with items? → ❌ BLOCK                     │
│    │  ERROR: "Cannot decompose until questions resolved"       │
│    └─ Section empty/absent? → ✓ Proceed to generation          │
└─────────────────────────────────────────────────────────────────┘
                            ↓ ✓ PASS
┌─────────────────────────────────────────────────────────────────┐
│ 6. DECOMPOSE PHASE - GENERATION                                │
│    Generate plan.yaml from spec                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. DECOMPOSE PHASE - POST-GENERATION VALIDATION                │
│    Automatic quality validation runs on plan.yaml              │
│                                                                 │
│    Output:                                                      │
│    📊 Task Quality Report                                       │
│    Summary: 1 critical, 2 high, 0 medium, 0 low                │
│                                                                 │
│    ⚠️  BLOCKING ISSUES FOUND:                                   │
│    📋 Task: migrate-core-services                               │
│      🔴 [CRITICAL] Task is XL complexity (>8h)                  │
│         💡 Split into 3-4 M/L tasks                             │
│      🟠 [HIGH] Vague file patterns: src/**/*.ts                 │
│         💡 Specify exact file paths                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. REFINE PLAN (If Issues Found)                               │
│    - Split XL tasks into M/L tasks                             │
│    - Specify exact file paths (no wildcards)                   │
│    - Break migrations by module                                │
│    - Re-run quality validation                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    ╔═══════════════════╗
                    ║  GATE 2           ║
                    ║  Quality Pass     ║
                    ║  - 0 CRITICAL     ║
                    ║  - 0-2 HIGH       ║
                    ║  - No XL tasks    ║
                    ╚═══════════════════╝
                            ↓ ✓ PASS
┌─────────────────────────────────────────────────────────────────┐
│ 9. EXECUTE PHASE                                                │
│    chopstack run --plan feature.plan.yaml --spec feature.md    │
│                                                                 │
│    ✓ All open questions resolved                               │
│    ✓ Task quality validated                                    │
│    ✓ No XL tasks in plan                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Gate Details

### Gate 1: Open Questions Resolution

**When:** Before `chopstack decompose` runs
**Check:** Spec has no "Open Tasks/Questions" section OR section is empty
**Blocks:** Decomposition from starting
**Error:** `"Cannot decompose until open questions resolved. See spec.md 'Open Tasks/Questions' section."`

**Why This Matters:**
- Prevents incomplete specs from generating bad plans
- Forces audit completion upfront (e.g., count affected files)
- Ensures architecture decisions are made before decomposition
- Avoids "surprise" task expansion during execution

**Example:**
```markdown
## Open Tasks/Questions

### Codebase Audit Required
- Count v1 type imports by module
- Estimate migration complexity per module

### Architecture Questions
- Should Agent interface support streaming?
```

If this section exists with content → decompose is BLOCKED.

### Gate 2: Task Quality Validation

**When:** After `chopstack decompose` generates plan.yaml
**Check:** Automated quality analysis of generated tasks
**Blocks:** Execution from starting (plan needs refinement)
**Validates:**
- ❌ CRITICAL: No XL tasks (must split)
- ⚠️ HIGH: Minimal L tasks (consider splitting)
- ⚠️ HIGH: No vague file patterns (`**/*.ts`)
- ⚠️ HIGH: No >10 files per task
- ⚠️ MEDIUM: No excessive XS tasks (fold into larger)

**Why This Matters:**
- Catches oversized tasks AFTER generation, BEFORE execution
- Prevents 20h tasks from becoming 40h tasks during implementation
- Enforces M-sized tasks (2-4h sweet spot)
- Identifies vague specifications that need clarification

**Example Quality Report:**
```
📊 Task Quality Report

Summary: 1 critical, 2 high, 0 medium, 0 low

⚠️  BLOCKING ISSUES FOUND

📋 Task: migrate-core-services
  🔴 [CRITICAL] XL complexity → Split into M/L tasks
  🟠 [HIGH] Vague patterns → Specify exact paths

💡 Suggested refinement:
  - task-1: Migrate agents (M, 3 files)
  - task-2: Migrate parsers (M, 6 files)
  - task-3: Migrate execution (L, 4 files)
```

## Success Metrics

With both gates in place:

**Gate 1 Impact:**
- 100% spec completeness before decomposition
- 0 open questions during execution
- Audits completed upfront (no surprise complexity)

**Gate 2 Impact:**
- <5% XL tasks in final plans (down from 15%)
- 80% M-sized tasks (up from 40%)
- 80% first-attempt success rate (up from 40%)
- <1 file conflict per plan (down from 3-5)

**Combined Impact:**
- Plans don't expand during execution
- Predictable task granularity
- Higher success rates
- Fewer retries and conflicts
