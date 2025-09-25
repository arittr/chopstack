# E2E Integration Tests

This directory hosts end-to-end integration tests that run chopstack against real git worktrees cloned from the current repository. The suites validate plan generation, orchestration decisions, and execution safety without depending on external demo projects.

## Setup

1. **API Keys (optional)**  
   Provide an Anthropic key when exercising Claude-backed flows:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```
   The suites will fall back to the mock agent if no key is present.

2. **Build the CLI**  
   ```bash
   pnpm run build
   ```

## Running Tests

```bash
# Run only the Vitest E2E project (plan generation)
pnpm run test:e2e

# Run execution-planning suite
pnpm run test:execution

# Run the focused shell scenarios
pnpm run test:e2e:simple
pnpm run test:e2e:parallel
pnpm run test:e2e:all
```

All commands create temporary worktrees beneath `test/tmp/` and clean them up automatically.

## Test Structure

### Specifications (`specs/`)
- `add-stack-summary-command.md` – drives the e2e/execution suites by requesting a new `stack summary` subcommand within chopstack itself.

### YAML Plans (`run-tests.sh` scenarios)
- `simple-single-task.yaml`
- `parallel-tasks.yaml`
- `stacked-dependencies.yaml`
- `complex-parallel-layers.yaml`

### Utilities
- `run-tests.sh` – shell harness for exercising execution modes.
- `TEST-SUITE.md` – documentation for the YAML-based scenarios.
- `@/utils/testing-harness-worktree-manager.ts` – shared helper that provisions/cleans git worktrees for tests.

## Behaviour Notes

- Tests operate on isolated worktrees; no changes touch the main working copy.
- When Claude CLI or git-spice are unavailable the suites provide clear skips or fallbacks.
- Timeouts are generous (30–60 s) to accommodate real API calls.

## Troubleshooting

- **Missing API key**: set `ANTHROPIC_API_KEY` or run suites that target the mock agent.  
- **Residual worktrees**: run `pnpm run test:e2e:cleanup` or delete `test/tmp/` manually.  
- **Slow executions**: increase the timeout in `chopstack-e2e.test.ts` if your environment requires more headroom.

These tests are safe to run repeatedly and provide high-confidence coverage for the CLI flows.
