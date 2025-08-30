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

# Tests (placeholder - not implemented yet)
pnpm run test
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
├── parser/        # Spec parsing logic
├── types/         # TypeScript type definitions
└── index.ts       # Main MCP server export
```

## Development Notes

- Package manager is strictly pnpm (not npm or yarn)
- Build targets Node.js 18+ with ESM-only output
- Uses incremental TypeScript builds for performance
- ESLint configuration is very strict with comprehensive rules for TypeScript, imports, and code quality
- README.md is minimal (placeholder), main documentation is in .cursorrules
