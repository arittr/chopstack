# chopstack

<img width="150" height="150" alt="chopstack-pancake-1" src="https://github.com/user-attachments/assets/d4f9f3e3-7ea2-424c-b0cd-2f8951ac30b4" />

> Chop massive AI changes into clean, reviewable PR stacks

chopstack is a TypeScript CLI tool and FastMCP server for turning fuzzy feature ideas into validated task DAGs, coordinating AI agents during execution, and keeping stacked Git workflows sane. It wraps reproducible planning, worktree orchestration, and git-spice automation behind a single entry point so large AI-assisted changes ship as tidy reviewable slices.

## Highlights
- AI-assisted spec decomposition with retry logic, DAG validation, and plan metrics (critical path, parallelisation, conflicts)
- Parallel execution engine with Ink-powered TUI, structured logging, retry controls, and pluggable VCS strategies (`simple`, `worktree`, `stacked`)
- Agent abstraction for Claude Code, Codex, and mock agents with consistent prompts and capability checks
- git-spice aware stacking that generates commit messages, creates branches, and falls back to vanilla Git when needed
- FastMCP server exposing the same orchestration pipeline to MCP-compatible clients via Zod-validated schemas
- Strict TypeScript, dependency-injected services, and reusable guard utilities to keep the surface area safe for other agents

## Getting Started
### Prerequisites
- Node.js 18+
- [pnpm](https://pnpm.io/) (required package manager)
- Optional: [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code), [Aider](https://aider.chat/), and [git-spice](https://git-spice.com/) for full automation

### Installation
```bash
# Clone the repo
git clone https://github.com/Snug-Labs/chopstack-mcp.git
cd chopstack-mcp

# Install dependencies
pnpm install

# Build distributable artifacts
pnpm run build
```

### Quick Start
1. Write a markdown spec (`spec.md`):
   ```markdown
   # Add JWT authentication
   - Register users with email/password
   - Issue short-lived access tokens and refresh tokens
   - Protect API routes with middleware
   ```
2. Generate a plan (YAML or JSON) with retries and validation:
   ```bash
   pnpm exec chopstack decompose --spec spec.md --agent claude --output plan.yaml
   ```
3. Inspect the generated DAG and metrics in `plan.yaml` (tasks, dependencies, touched files).
4. Rehearse the plan without touching disk:
   ```bash
   pnpm exec chopstack run --plan plan.yaml --mode dry-run --vcs-mode simple --verbose
   ```
5. Execute for real with worktrees, logging, and the Ink TUI:
   ```bash
   pnpm exec chopstack run --plan plan.yaml --mode execute --vcs-mode worktree --write-log
   ```
6. Turn the results into a tidy stack when you are happy:
   ```bash
   pnpm exec chopstack stack --message "Add JWT auth" --no-create-stack
   ```

## CLI Overview
### `chopstack decompose`
Decompose a markdown spec into a validated task plan.
```bash
chopstack decompose --spec spec.md [--agent claude|codex|mock] [--output plan.yaml] [--verbose]
```
- Runs agent-specific prompts with retry + validation (`generatePlanWithRetry`)
- Emits plan + metrics to stdout or a file via `PlanOutputter`
- Reports conflicts, circular dependencies, and summary stats using `DagValidator`

### `chopstack run`
Execute an existing plan or generate one on the fly.
```bash
chopstack run [--spec spec.md | --plan plan.yaml] \
  [--mode plan|dry-run|execute|validate] \
  [--vcs-mode simple|worktree|stacked] \
  [--agent claude|codex|mock] \
  [--permissive-validation] [--continue-on-error] \
  [--retry-attempts 3] [--retry-delay 5000] [--timeout 600000] \
  [--workdir /path/to/repo] [--no-tui] [--write-log] [--verbose]
```
- Automatically validates DAGs (structure, conflicts, critical path) before execution
- Creates and manages worktrees/stacks through pluggable VCS strategies
- Streams events through the execution orchestrator; `--mode execute` can render an Ink TUI
- `--write-log` mirrors console output to `.chopstack/logs` for later auditing
- `--permissive-validation` downgrades file violations to warnings instead of hard failures

> **TUI**: Only available in execute mode with a TTY. Use `--no-tui` for headless CI environments.

### `chopstack stack`
Create commits or git-spice branches with AI-assisted messages.
```bash
chopstack stack [--message "Fix foo"] [--no-auto-add] [--no-create-stack] [--verbose]
```
- Shows staged changes, colourised by status, before doing anything destructive
- Generates commit messages via `CommitMessageGenerator`, optionally overriding with `--message`
- If git-spice (`gs`) is installed, creates branches and can submit stacks; otherwise falls back to Git
- Integrates with the same Ink logger output so behaviour matches other commands

## Execution Modes
| Mode      | Purpose                                                       |
|-----------|----------------------------------------------------------------|
| `plan`    | Ask your agent for textual execution plans per task            |
| `dry-run` | Exercise scheduling logic without modifying files              |
| `execute` | Apply changes via task executors, worktrees, and VCS strategies|
| `validate`| Check DAG + options only, no agent calls or filesystem writes   |

## VCS Modes
| Mode       | Description                                                                 |
|------------|-----------------------------------------------------------------------------|
| `simple`   | Run everything in the current working copy without extra git plumbing       |
| `worktree` | Create per-layer worktrees under `.chopstack/shadows/<task>` and merge back |
| `stacked`  | Prepare git-spice-compatible branches so stacks can be submitted immediately|

## MCP Server
Run chopstack as a FastMCP server with the same orchestration pipeline.
```bash
pnpm run dev:mcp       # hot reload during development
pnpm run inspect:mcp   # list tools, inputs, and schemas
pnpm run start:mcp     # run the built server
```
Schemas live in `src/entry/mcp/schemas`, and the server (`src/entry/mcp/server.ts`) manages worktrees, stack branches, and plan execution through the `TaskOrchestrator`.

## Directory Layout
```
src/
  adapters/     # Agent + VCS adapters (Claude CLI, git-spice, commit messages)
  commands/     # Decorator-registered CLI commands + command registry
  core/         # Pure domain interfaces, types, and DI container
  entry/        # CLI bootstrap and MCP server entrypoints
  io/           # YAML/JSON plan parsing helpers
  providers/    # Application bootstrap + service registration
  services/     # Planning, execution, orchestration, vcs, logging services
  types/        # Shared type definitions and Zod schemas
  ui/           # Ink TUI components, hooks, and theme
  utils/        # Logger, helpers, and shared utilities
  validation/   # DAG + input validators and guard re-exports

test/
  e2e/          # CLI end-to-end suites and fixtures
  execution/    # Execution planning quality tests
  helpers/      # Harness utilities and test infra
  setup/        # Vitest setup hooks and worktree cleanup helpers
  specs/        # Reusable spec fixtures used across suites
```

## Development
```bash
pnpm run dev        # Watch the CLI entrypoint (tsx)
pnpm run dev:run    # Run CLI once without building
pnpm run dev:lib    # Watch library / MCP entrypoint
pnpm run build      # Production build with tsup
pnpm run clean      # Remove dist artifacts
pnpm run start      # Run built CLI
pnpm run start:mcp  # Run built MCP server
```

## Quality & Testing
```bash
pnpm run lint           # type-check -> format:check -> eslint
pnpm run lint:fix       # prettier + eslint --fix
pnpm run type-check     # strict tsc --noEmit
pnpm run format         # prettier --write
pnpm run format:check   # enforce formatting

pnpm run test           # all configured Vitest projects
pnpm run test:unit      # src/**/__tests__/*.test.ts
pnpm run test:integration
pnpm run test:e2e       # requires Claude CLI + git-spice when enabled
pnpm run test:execution # plan-quality scoring harness
pnpm run test:watch     # watch mode
pnpm run test:coverage  # V8 coverage
pnpm run test:clean     # wipe test/tmp between runs
```

## Additional Docs
- `SERVICE_CONTRACTS.md` – detailed clean-architecture service contracts
- `docs/stack-merge.md` – GitHub Actions workflow for merging git-spice stacks
- `chopstack-spec.md` – sample specs and decomposition examples
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` – agent-specific conventions when collaborating with code assistants

## Contributing
- Run linting, type-checks, and relevant tests before opening a PR
- Follow the guard utilities (`utils/guards.ts`) and `ts-pattern` style guidelines documented in `CLAUDE.md`
- Update specs or execution tests when adding new behaviours
- Prefer small, reviewable stacks—`chopstack` dogfoods its own workflows

## License
ISC
