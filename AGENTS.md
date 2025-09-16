# Repository Guidelines

## Project Structure & Module Organization
Chopstack is a TypeScript CLI that lives in `src/`. The CLI entrypoint is `src/bin/chopstack.ts`; reusable orchestration logic is in `src/engine/`, integrations under `src/vcs/` and `src/mcp/`, and AI task flows in `src/agents/`. Shared types sit in `src/types/` and helpers in `src/utils/`. Generated bundles land in `dist/`. Tests mirror the runtime code: fast checks in `test/unit/`, decision-flow suites in `test/execution/`, and full CLI journeys in `test/e2e/`.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (Node 18+). During development run `pnpm dev` to watch and reload the CLI, or `pnpm dev:lib` when working only on library code. Build distributable artifacts with `pnpm build`. Ship-ready binaries can be verified with `pnpm start`. For Model Context Protocol changes, `pnpm dev:mcp` hot-reloads `src/index.ts`, and `pnpm inspect:mcp` inspects the published capabilities.

## Coding Style & Naming Conventions
All runtime code is TypeScript and compiled via tsup. Prettier enforces two-space indentation, trailing semicolons, and single quotes. Run `pnpm format` before committing; `pnpm lint` combines type-checking, formatting verification, and ESLint (with `@typescript-eslint`, `simple-import-sort`, `perfectionist`, and `unicorn`) to keep imports ordered and symbols consistently named. Use PascalCase for classes, camelCase for functions and variables, and kebab-case for new file names. Reach for `ts-pattern` instead of manual `switch`/`if` ladders, and lean on `utils/guards.ts` helpers (`isNonEmptyString`, `isNonNullish`, etc.) rather than ad-hoc checks—lint rules expect that style.

## Testing Guidelines
Jest drives the suite. Use `pnpm test` for the full matrix, `pnpm test:unit` while iterating on orchestrator logic, and `pnpm test:execution` for deterministic flow coverage. End-to-end flows live beside fixtures in `test/e2e/`; run a focused smoke with `pnpm test:e2e:simple` before opening a PR. Add new tests as `*.test.ts` near related modules, and keep scenarios hermetic by mocking external services.

## Commit & Pull Request Guidelines
Recent history favors concise, imperative commit subjects (for example, `add better test infra`). Keep bodies optional but use them to summarize rationale or mention follow-ups. For pull requests, include: a short problem/solution summary, references to tracking issues, validation evidence (command output or screenshots for CLI UX), and call out any skipped tests or remaining TODOs. Request review once CI and `pnpm lint`+`pnpm test` succeed locally.

## Agent Setup & CLI Dependencies
Install the codex CLI via `npm install -g @openai/codex` (or `brew install codex`) before running `pnpm decompose --agent codex --spec path/to/spec.md`. Codex runs headless through `codex exec --json`, so keep chat sessions authenticated (ChatGPT login or API key) in the terminal environment. Command overrides: set `CODEX_CLI_COMMAND` to point at a different binary, prefer `CODEX_CLI_ARGS_JSON='["exec","--json",...]'` for custom arg arrays, or fall back to `CODEX_CLI_ARGS` for shell-style strings. Claude still requires `claude --version` to succeed; both agents stream prompts over stdin, so avoid interactive-only flags. Keep this document in sync with `CLAUDE.md` so the guard/ts-pattern expectations match across agents.
