# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**chopstack** is a TypeScript CLI tool and MCP (Model Context Protocol) server that helps chop massive AI changes into clean, reviewable PR stacks using AI-powered parallel Git workflows with intelligent task decomposition.

## Development Commands

### Building and Development

```bash
# Build the project
pnpm run build

# Watch mode development (CLI)
pnpm run dev

# Watch mode development (library)
pnpm run dev:lib

# MCP server development
pnpm run dev:mcp

# Inspect MCP server
pnpm run inspect:mcp
```

### Code Quality and Testing

```bash
# Run linting
pnpm run lint

# Fix linting issues automatically
pnpm run lint:fix

# Type checking
pnpm run type-check

# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Tests
pnpm run test           # All tests (unit + E2E + execution)
pnpm run test:unit      # Unit tests only
pnpm run test:e2e       # E2E integration tests
pnpm run test:execution # Execution planning tests
```

### Running the CLI

```bash
# Run built CLI
pnpm run start

# Run MCP server
pnpm run start:mcp

# Clean build artifacts
pnpm run clean
```

## Architecture Overview

This project has a dual-purpose architecture:

1. **CLI Tool** (`src/bin/chopstack.ts`): Standalone command-line interface for chopstack operations
2. **MCP Server** (`src/index.ts`): Model Context Protocol server for AI integration

### Core Components

- **Parser** (`src/parser/spec-parser.ts`): Parses markdown specifications into structured tasks with dependencies, files, priorities, and complexity estimates
- **Types** (`src/types/decomposer.ts`): Core type definitions for tasks, DAG nodes, conflict resolution, and specifications
- **MCP Server** (`src/mcp/server.ts`): FastMCP server with task orchestration tools
- **Task Orchestrator** (`src/mcp/orchestrator.ts`): Manages parallel task execution using Claude Code CLI in plan mode
- **Execution Testing** (`test/execution/`): Tests Claude's execution planning using `--permission-mode plan`
- **Build System**: Uses `tsup` for ESM-only builds targeting Node.js 18+ with dual entry points

### Key Design Patterns

The codebase follows these architectural patterns:

1. **Functional Pattern Matching**: Uses `ts-pattern` extensively for control flow instead of switch/if-else chains
2. **Type-First Design**: Leverages Zod schemas for runtime validation, especially for MCP integration
3. **ESM-Only**: Built as ESM modules using latest TypeScript and Node.js features
4. **Strict TypeScript**: All strict compiler options enabled with comprehensive type safety

### Technology Stack

- **Runtime**: Node.js >=18.0.0 with ESM modules
- **Language**: TypeScript with very strict configuration
- **Package Manager**: pnpm (required)
- **Build Tool**: tsup for fast ESM builds
- **MCP Framework**: FastMCP (built on official MCP SDK)
- **Pattern Matching**: ts-pattern for functional control flow
- **Validation**: Zod for schema validation and runtime type checking
- **External Types**: Official Claude Code SDK types from `@anthropic-ai/claude-code`
- **Testing**: Jest for unit/E2E tests, custom execution testing framework

## Code Style Requirements

### Pattern Matching with ts-pattern

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

### TypeScript Guidelines

- Use `type` over `interface` for simple shapes
- All public functions must have explicit return types
- Use `const assertions` and `as const` for immutable data
- Import file extensions are omitted (handled by build system)
- Strict naming: camelCase for functions, PascalCase for types, kebab-case for files
- **ALWAYS use `utils/guards.ts`** for type guards instead of inline checks:
  - `isNonEmptyString()` for non-empty string checks
  - `isNonNullish()` for null/undefined checks
  - `hasContent()` for strings with actual content
  - `isValidArray()` for non-empty arrays
  - `isNonEmptyObject()` for objects with properties
- Follow `@typescript-eslint/naming-convention` including leading underscore for private members
- Avoid non-null assertions (`!`) and use `isNonNullish()` instead

### Import Organization

Always use extensionless imports; do not specify the file extension in imports.

The ESLint configuration enforces this import order:

1. Node.js built-ins (using `node:` protocol)
2. External dependencies
3. Internal imports

### Code Quality Standards

- **Very Strict TypeScript**: All strict flags enabled, no `any`, explicit function return types required
- **No Default Exports**: Use named exports throughout (except for config files)
- **Pattern Exhaustiveness**: All pattern matches must be exhaustive
- **Modern JavaScript**: Prefer modern APIs, avoid legacy patterns
- **Functional Approach**: Pure functions preferred, avoid mutations where possible

## MCP Integration

The project uses FastMCP for simplified MCP server development:

- Leverages Zod schemas with FastMCP's Standard Schema support
- Use `fastmcp dev src/index.ts` for development
- Use `fastmcp inspect src/index.ts` to inspect the server
- Built-in session management and error handling

## File Structure

```
src/
├── bin/           # CLI entry points
├── agents/        # Agent implementations (Claude, Aider, Mock)
├── commands/      # CLI command implementations
├── mcp/           # MCP server and task orchestration
├── parser/        # Spec parsing logic
├── types/         # TypeScript type definitions
├── utils/         # Utility functions and guards
└── index.ts       # Main MCP server export

test/
├── e2e/           # End-to-end integration tests
├── execution/     # Execution planning tests (using --permission-mode plan)
└── unit/          # Unit tests (if any)
```

## Execution Testing Framework

The project includes a unique execution testing framework that validates Claude's task execution approach without expensive API calls:

### How It Works

1. **Plan Generation**: Uses `chopstack decompose` to generate task DAGs from markdown specs
2. **Execution Planning**: Tests each task using `claude --permission-mode plan` to get execution plans
3. **Quality Analysis**: Analyzes plans for complexity, file operations, technical accuracy, and completeness
4. **Cost Efficiency**: ~$0.10-0.20 per task vs $2-5+ for full implementation testing

### Key Components

- **ExecutionPlanAnalyzer** (`src/utils/execution-plan-analyzer.ts`): Uses official Claude Code SDK types
- **TaskOrchestrator** (`src/mcp/orchestrator.ts`): Enhanced with `planMode` parameter
- **Test Suite** (`test/execution/plan-execution.test.ts`): Comprehensive execution planning validation

### Usage

```bash
# Run execution tests only
pnpm run test:execution

# Tests validate:
# - Plan structure and quality (0-100 score)
# - Technical detail accuracy
# - File operation mapping
# - Technology detection (React, TypeScript, etc.)
# - Comparative analysis across tasks
```

## Development Notes

- Package manager is strictly pnpm (not npm or yarn)
- Build targets Node.js 18+ with ESM-only output
- Uses incremental TypeScript builds for performance
- ESLint configuration is very strict with comprehensive rules for TypeScript, imports, and code quality
- Uses official Claude Code SDK types from `@anthropic-ai/claude-code` package
- README.md is minimal (placeholder), main documentation is in .cursorrules
- Always run `lint:fix` before committing.