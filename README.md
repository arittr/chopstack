# chopstack

> Chop massive AI changes into clean, reviewable PR stacks

chopstack is a TypeScript CLI tool and Model Context Protocol (MCP) server that turns fuzzy feature ideas into conflict-free task DAGs, coordinates parallel execution with AI coding agents, and keeps Git stacks organized. Use it to plan, validate, and run large AI-assisted code changes without losing track of dependencies or reviewer sanity.

## Why chopstack?
- Keep AI-generated changes small, isolated, and reviewable instead of shipping monolithic diffs
- Discover safe parallelization opportunities so teams can work concurrently without merge fights
- Standardize how plans, execution steps, and Git stacks are produced across people and agents
- Integrate Claude Code, Aider, or a mock agent in the exact same workflow

## Core capabilities
- **Spec decomposition** – parse markdown specs into typed task graphs with dependency validation, conflict detection, and complexity estimates
- **Execution engine** – run plans in `plan`, `dry-run`, `execute`, or `validate` modes with serial, parallel, or hybrid strategies
- **AI orchestration** – stream execution updates while Claude Code (or other agents) produce plans or code for each task
- **Git automation** – spin up worktrees for parallel layers and optionally create git-spice stacks when tasks succeed
- **Rich metrics** – compute max parallelization, estimated speedup, and per-task metadata for visibility into the proposed stack
- **MCP server** – expose the same orchestration pipeline to MCP-compatible clients via FastMCP

## Getting started
### Prerequisites
- Node.js 18 or newer
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

## Quick start (CLI)
1. Create a markdown spec (`spec.md`):
   ```markdown
   # Add JWT authentication
   - Register users with email/password
   - Issue short-lived access tokens and refresh tokens
   - Add middleware that protects API routes
   ```
2. Decompose the spec:
   ```bash
   pnpm exec chopstack decompose --spec spec.md --agent mock --output plan.yaml
   ```
3. Inspect the generated plan (YAML includes tasks, dependencies, touched files, and metrics).
4. Execute the plan in dry-run mode:
   ```bash
   pnpm exec chopstack run --plan plan.yaml --mode dry-run --strategy parallel
   ```
5. Ready to apply real changes? Switch to `--mode execute` and optionally enable git-spice stack creation with `--git-spice`.

## CLI commands
### `chopstack decompose`
Generate a validated task DAG from a markdown spec.
```bash
chopstack decompose --spec spec.md [--agent claude|aider|mock] [--output plan.yaml] [--verbose]
```
- Retries decomposition up to three times if validation fails
- Emits YAML to stdout or a file with metrics (task count, parallelism, speedup, total estimated LOC)

### `chopstack run`
Run a plan end-to-end by decomposing a spec on the fly or loading a saved plan.
```bash
chopstack run [--spec spec.md | --plan plan.yaml] \
  [--mode plan|dry-run|execute|validate] \
  [--strategy parallel|serial|hybrid] \
  [--git-spice] [--continue-on-error] [--timeout 600000]
```
- `plan` mode asks your agent for step-by-step execution plans per task
- `dry-run` simulates execution without touching the filesystem
- `execute` writes real changes and can create git-spice stacks per layer
- `validate` verifies the DAG and strategy without contacting an agent

### `chopstack stack`
Generate an AI-authored commit message and optionally create a git-spice branch.
```bash
chopstack stack [--message "Fix foo"] [--no-auto-add] [--no-create-stack] [--verbose]
```
- Shows staged changes, prompts Claude Code when available, and falls back to a deterministic message generator
- Integrates with git-spice (`gs`) to keep stacks ready for review

## Execution modes & strategies
| Mode      | Purpose                                                    |
|-----------|------------------------------------------------------------|
| `plan`    | Ask the agent how it would accomplish each task            |
| `dry-run` | Exercise scheduling logic without modifying files          |
| `execute` | Apply changes, manage worktrees, and create optional stacks|
| `validate`| Ensure DAG and strategy are sound before you run anything  |

| Strategy   | When to use it                                                   |
|------------|------------------------------------------------------------------|
| `parallel` | Default – execute independent layers simultaneously               |
| `serial`   | Run tasks one-by-one for deterministic debugging                  |
| `hybrid`   | Automatically serialize tasks that share files, parallelize rest  |

## MCP server
Use chopstack as an MCP toolchain for agents or IDE integrations.
```bash
# Start local dev server
pnpm run dev:mcp

# Inspect available MCP tools and schemas
pnpm run inspect:mcp

# Run the built server
pnpm run start:mcp
```
The MCP server wraps the same orchestration logic as the CLI, exposing tools for task decomposition, execution planning, worktree management, and stack creation. Schemas are defined with Zod and validated at runtime via FastMCP.

## Architecture highlights

**chopstack** follows clean architecture principles with clear separation of concerns across four main layers:

- **Core Layer** (`src/core/`): Domain interfaces, business rules, and dependency injection infrastructure
- **Services Layer** (`src/services/`): Business logic implementations for execution, planning, orchestration, and VCS operations
- **Adapters Layer** (`src/adapters/`): External system integrations (AI agents, Git, git-spice)
- **Entry Layer** (`src/entry/`): Application entry points for CLI and MCP server

Key architectural features:
- **Clean interfaces**: Core domain interfaces define contracts without implementation details
- **Dependency injection**: Centralized container manages service dependencies and lifecycle
- **Agent abstraction**: Unified interface for Claude, Aider, and mock agents via adapter pattern
- **Service-oriented design**: Focused services handle specific business domains (execution, planning, VCS)
- **Type safety**: Comprehensive TypeScript types and Zod schema validation throughout

See [SERVICE_CONTRACTS.md](./SERVICE_CONTRACTS.md) for detailed documentation of all service interfaces and contracts.

### Project structure
```
src/
  core/                    # Core domain layer
    agents/                # Agent interfaces and contracts
    config/                # Configuration interfaces
    di/                    # Dependency injection container and providers
    execution/             # Execution domain types and state machines
    vcs/                   # Version control domain services and interfaces

  services/                # Business logic layer
    agents/                # Agent service implementations
    execution/             # Execution planning, orchestration, and monitoring
    orchestration/         # Task orchestration and coordination
    planning/              # Plan generation, analysis, and output formatting
    vcs/                   # VCS operations and repository management

  adapters/                # External system adapters
    agents/                # AI agent implementations (Claude, Codex, Mock)
    vcs/                   # Git, git-spice, and commit message generation

  entry/                   # Application entry points
    cli/                   # Command-line interface bootstrap
    mcp/                   # Model Context Protocol server

  commands/                # CLI command handlers and validation
  types/                   # Shared TypeScript definitions and Zod schemas
  validation/              # Input validation and type guards
  utils/                   # Shared utilities and helpers

test/
  e2e/                     # End-to-end CLI integration tests
  execution/               # Execution planning validation and quality tests
  unit/                    # Unit tests (legacy location)
```

## Development workflow
```bash
pnpm run dev         # Watch CLI entrypoint with tsx
pnpm run dev:lib     # Watch library / MCP entrypoint
pnpm run build       # Production build (tsup with d.ts output)
pnpm run clean       # Remove dist artifacts
```

### Quality and formatting
```bash
pnpm run lint        # type-check -> format:check -> eslint
pnpm run lint:fix    # auto-fix formatting + eslint
pnpm run type-check  # strict tsc --noEmit
pnpm run format      # prettier --write
pnpm run format:check
```

### Test suites
```bash
pnpm run test             # All test suites (unit + integration + E2E + execution)
pnpm run test:unit        # Unit tests with heavy mocking
pnpm run test:integration # Integration tests with real class interactions
pnpm run test:e2e         # End-to-end CLI integration tests
pnpm run test:execution   # Execution planning validation and quality scores
```
The execution tests exercise Claude Code in `--permission-mode plan` to validate task execution plans without expensive implementation, keeping costs low while ensuring generated plans are actionable.

## Using git-spice stacks
- Enable `--git-spice` on `chopstack run` to create stack branches after each successful layer
- `chopstack stack` inspects staged changes, generates AI commit messages, and calls `gs branch create`
- After execution, run `gs stack submit` (or your preferred flow) to open PRs

## Contributing
Pull requests are welcome! Before opening one:
1. Run `pnpm run lint`, `pnpm run type-check`, and any relevant tests
2. Follow the clean architecture patterns and service contracts documented in [SERVICE_CONTRACTS.md](./SERVICE_CONTRACTS.md)
3. Ensure changes follow the guard utilities and `ts-pattern` style guidelines in [CLAUDE.md](./CLAUDE.md)
4. If adding features, update specs and execution tests when applicable

## License
ISC
