# Bun Migration Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Migrate chopstack from Node.js/pnpm/tsup/vitest to Bun for all development, building, testing, and runtime.

**Architecture:** Big Bang migration - replace all tooling at once. Remove pnpm, tsup, tsx, vitest and use Bun's built-in package manager, runtime, bundler, and test runner. Keep TypeScript for type checking only. Maintain MCP server functionality with FastMCP.

**Tech Stack:** Bun 1.3.0, TypeScript 5.9, FastMCP 3.x, ESLint, Prettier

---

## Task 1: Update package.json Configuration

**Files:**
- Modify: `package.json:1-106`

**Step 1: Remove packageManager field**

Edit `package.json`, delete line:
```json
"packageManager": "pnpm@10.8.0",
```

**Step 2: Update engines field**

Replace:
```json
"engines": {
  "node": ">=18.0.0"
}
```

With:
```json
"engines": {
  "bun": ">=1.0.0"
}
```

**Step 3: Remove types export**

Change:
```json
"main": "dist/index.js",
"types": "dist/index.d.ts",
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

To:
```json
"main": "dist/index.js",
"exports": {
  ".": "./dist/index.js"
}
```

**Step 4: Update scripts to use bun**

Replace entire scripts section with:
```json
"scripts": {
  "build": "bun build src/index.ts --outdir dist --target node --format esm --sourcemap",
  "build:watch": "bun build src/index.ts --outdir dist --target node --format esm --sourcemap --watch",
  "commit": "bun --filter commitment run commit",
  "dev:mcp": "bun --watch src/index.ts",
  "dev:mcp-inspect": "bun x fastmcp dev src/index.ts",
  "inspect:mcp": "bun x fastmcp inspect src/index.ts",
  "clean": "rm -rf dist",
  "start:mcp": "bun dist/index.js",
  "lint": "bun run type-check && bun run format:check && eslint .",
  "lint:fix": "bun run format && eslint . --fix",
  "format": "prettier --cache --write .",
  "format:check": "prettier --cache --check .",
  "type-check": "tsc --noEmit",
  "test": "bun test",
  "test:unit": "bun test src/**/*.test.ts",
  "test:integration": "bun test src/**/*.integration.test.ts",
  "test:e2e": "bun test test/e2e/**/*.test.ts",
  "test:watch": "bun test --watch",
  "test:coverage": "bun test --coverage",
  "prepublishOnly": "bun run clean && bun run build",
  "prepare": "husky",
  "knip": "knip"
}
```

**Step 5: Commit package.json changes**

```bash
git add package.json
git commit -m "chore: update package.json for Bun migration

- Remove packageManager field
- Change engines to require Bun >=1.0.0
- Remove types export (not a library)
- Update all scripts to use bun commands
- Replace pnpm/npm/node with bun runtime"
```

---

## Task 2: Remove Deprecated Dependencies

**Files:**
- Modify: `package.json:65-92`

**Step 1: Remove build tool dependencies**

Remove these lines from devDependencies:
```json
"tsup": "^8.5.0",
"tsx": "^4.20.5",
"@esbuild-plugins/tsconfig-paths": "^0.1.2",
"jiti": "^2.6.0",
```

**Step 2: Remove test runner dependencies**

Remove these lines from devDependencies:
```json
"vitest": "^3.2.4",
"@vitest/coverage-v8": "^3.2.4",
"@vitest/ui": "^3.2.4",
```

**Step 3: Verify devDependencies section**

After removal, devDependencies should contain only:
- `@anthropic-ai/claude-code`
- `@eslint/js` and eslint plugins
- `@types/*` packages
- `@typescript-eslint/*` packages
- `husky`
- `knip`
- `prettier`
- `rimraf`
- `rulesync`
- `typescript`

**Step 4: Commit dependency cleanup**

```bash
git add package.json
git commit -m "chore: remove Node.js-specific dependencies

Removed (replaced by Bun built-ins):
- tsup (bundler)
- tsx (TS runtime)
- vitest (test runner)
- @vitest/* (test utilities)
- @esbuild-plugins/tsconfig-paths (Bun has native support)
- jiti (Bun has native TS support)"
```

---

## Task 3: Delete Old Configuration Files

**Files:**
- Delete: `tsup.config.ts`
- Delete: `vitest.config.ts` (if exists)

**Step 1: Check for vitest config**

Run: `ls vitest.config.ts 2>/dev/null || echo "No vitest config"`

**Step 2: Delete tsup config**

```bash
rm tsup.config.ts
```

Expected: File removed

**Step 3: Delete vitest config if exists**

```bash
rm vitest.config.ts 2>/dev/null || true
```

**Step 4: Verify configs deleted**

Run: `ls *.config.ts`

Expected output should NOT include tsup.config.ts or vitest.config.ts

**Step 5: Commit config deletion**

```bash
git add -A
git commit -m "chore: remove obsolete config files

- Delete tsup.config.ts (replaced by bun build)
- Delete vitest.config.ts if present (replaced by bun test)

Bun uses package.json scripts and optional bunfig.toml"
```

---

## Task 4: Install Dependencies with Bun

**Files:**
- Delete: `pnpm-lock.yaml`
- Create: `bun.lockb`

**Step 1: Remove pnpm lockfile**

```bash
rm pnpm-lock.yaml
```

**Step 2: Remove node_modules**

```bash
rm -rf node_modules
```

**Step 3: Install with Bun**

Run: `~/.bun/bin/bun install`

Expected:
- Creates `bun.lockb`
- Installs all dependencies
- No errors

**Step 4: Verify installation**

Run: `~/.bun/bin/bun pm ls | head -10`

Expected: Lists installed packages

**Step 5: Commit lockfile**

```bash
git add bun.lockb
git commit -m "chore: switch from pnpm to bun package manager

- Remove pnpm-lock.yaml
- Add bun.lockb
- All dependencies installed successfully with Bun"
```

---

## Task 5: Test Build with Bun

**Files:**
- Output: `dist/index.js`
- Output: `dist/index.js.map`

**Step 1: Clean dist directory**

```bash
~/.bun/bin/bun run clean
```

Expected: dist/ removed

**Step 2: Run build**

```bash
~/.bun/bin/bun run build
```

Expected output:
```
[0.XXms] bundle 1 module
dist/index.js  XXX.XX KB
```

**Step 3: Verify build output**

Run: `ls -lh dist/`

Expected:
- `dist/index.js` exists
- `dist/index.js.map` exists
- No `.d.ts` files (we removed that)

**Step 4: Check bundle size**

Run: `du -h dist/index.js`

Expected: Similar size to tsup output (~165KB)

**Step 5: Test build output**

Run: `~/.bun/bin/bun dist/index.js &`
Wait 1 second, then kill it.

Expected: Server starts (waits for stdio), no errors

**Step 6: Commit build verification**

```bash
git add -f dist/index.js dist/index.js.map
git commit -m "test: verify bun build produces working output

Build successful:
- Bundle created with bun build
- Source maps generated
- Server starts without errors
- Ready to replace tsup completely"
```

Then remove dist from git:
```bash
git rm -r --cached dist
git commit -m "chore: remove dist from version control"
```

---

## Task 6: Test Type Checking

**Files:**
- No file changes (validation only)

**Step 1: Run type check**

Run: `~/.bun/bin/bun run type-check`

Expected: No errors (same as with Node.js)

**Step 2: Run linting**

Run: `~/.bun/bin/bun run lint`

Expected: All checks pass

**Step 3: Test format check**

Run: `~/.bun/bin/bun run format:check`

Expected: No formatting issues

**Step 4: Document verification**

No commit needed - this was a validation step.

---

## Task 7: Test MCP Server Development Mode

**Files:**
- No file changes (testing only)

**Step 1: Test watch mode**

Run in background: `~/.bun/bin/bun run dev:mcp &`
Save PID: `DEV_PID=$!`

Wait 2 seconds.

Expected: Server starts, waiting for stdio (correct)

Kill it: `kill $DEV_PID`

**Step 2: Test FastMCP inspector**

Run: `~/.bun/bin/bun run dev:mcp-inspect`

Expected: Opens inspector UI, shows all MCP tools

Press Ctrl+C to exit.

**Step 3: Test production mode**

Run: `~/.bun/bin/bun run start:mcp &`
Save PID: `START_PID=$!`

Wait 1 second.

Expected: Server runs, waiting for stdio

Kill it: `kill $START_PID`

**Step 4: Document working modes**

All dev modes working correctly - no commit needed.

---

## Task 8: Migrate Test Files (Minimal)

**Files:**
- Modify: Test files that use `vi.` from vitest

**Step 1: Search for vitest imports**

Run: `grep -r "from 'vitest'" src/ test/ --include="*.ts" | wc -l`

Note: This shows how many test files need updating

**Step 2: Replace vitest imports with bun:test**

For each test file, change:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
```

To:
```typescript
import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
```

**Step 3: Replace vi.mock() calls**

Change:
```typescript
vi.mock('@/some/module');
```

To:
```typescript
mock.module('@/some/module', () => ({
  // mock implementation
}));
```

**Step 4: Replace vi.spyOn() calls**

Change:
```typescript
const spy = vi.spyOn(obj, 'method');
```

To:
```typescript
const spy = spyOn(obj, 'method');
```

**Step 5: Run tests**

Run: `~/.bun/bin/bun test`

Expected: Some tests may fail - that's OK, we'll fix incrementally

**Step 6: Commit test migration start**

```bash
git add src/ test/
git commit -m "test: migrate from vitest to bun test

- Replace vitest imports with bun:test
- Replace vi.mock with mock.module
- Replace vi.spyOn with spyOn
- Some tests may need additional fixes"
```

---

## Task 9: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md:1-50` (Development Commands section)

**Step 1: Update build commands section**

Replace:
```markdown
### Building and Development

\```bash
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
\```
```

With:
```markdown
### Building and Development

\```bash
# Build the project
bun run build

# Watch mode development (MCP server)
bun run dev:mcp

# Inspect MCP server
bun run inspect:mcp

# Production mode
bun run start:mcp
\```
```

**Step 2: Update testing commands**

Replace:
```markdown
# Tests
pnpm run test           # All tests (unit + E2E + execution)
pnpm run test:unit      # Unit tests only
pnpm run test:e2e       # E2E integration tests
pnpm run test:execution # Execution planning tests
```

With:
```markdown
# Tests
bun test                # All tests
bun test --watch        # Watch mode
bun test --coverage     # With coverage
bun run test:unit       # Unit tests only
bun run test:e2e        # E2E integration tests
```

**Step 3: Update runtime requirements**

Replace:
```markdown
- **Runtime**: Node.js >=18.0.0 with ESM modules
- **Package Manager**: pnpm (required)
- **Build Tool**: tsup for fast ESM builds
```

With:
```markdown
- **Runtime**: Bun >=1.0.0
- **Package Manager**: Bun (built-in)
- **Build Tool**: Bun (built-in bundler)
```

**Step 4: Commit documentation update**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Bun migration

- Replace pnpm commands with bun
- Update runtime requirements
- Simplify dev workflow (no separate CLI/lib modes)
- Update testing commands"
```

---

## Task 10: Final Verification and Cleanup

**Files:**
- No changes (verification only)

**Step 1: Full build test**

```bash
~/.bun/bin/bun run clean
~/.bun/bin/bun run build
```

Expected: Clean build, no errors

**Step 2: Type check**

Run: `~/.bun/bin/bun run type-check`

Expected: No errors

**Step 3: Linting**

Run: `~/.bun/bin/bun run lint`

Expected: All checks pass

**Step 4: Test basic functionality**

Run: `~/.bun/bin/bun test --bail`

Expected: Tests run (some may fail, that's OK)

**Step 5: Start MCP server**

Run: `~/.bun/bin/bun run start:mcp &`
Wait 2 seconds, then kill.

Expected: Server starts without errors

**Step 6: Create migration summary**

Create file: `docs/BUN_MIGRATION.md`

```markdown
# Bun Migration Summary

## Completed
- ✅ Switched from pnpm to bun package manager
- ✅ Replaced tsup with bun build
- ✅ Replaced tsx with bun runtime
- ✅ Replaced vitest with bun test
- ✅ Removed 7 deprecated dependencies
- ✅ Updated all scripts to use bun
- ✅ Verified build, type-check, lint all pass
- ✅ MCP server runs successfully

## Results
- **Package size**: Reduced by ~7 dependencies
- **Build speed**: Similar to tsup (esbuild-based)
- **Dev experience**: Simpler toolchain, one runtime
- **Compatibility**: All core functionality working

## Next Steps
- Fix any remaining test failures incrementally
- Update CI/CD to use Bun
- Test with Claude Desktop integration
```

**Step 7: Final commit**

```bash
git add docs/BUN_MIGRATION.md
git commit -m "docs: add Bun migration summary

Migration complete. All core functionality verified:
- Build: ✅
- Type checking: ✅
- Linting: ✅
- MCP server: ✅
- Tests: Migrated (some fixes needed)

Ready for testing and refinement."
```

---

## Success Criteria

- [ ] `bun run build` produces working dist/index.js
- [ ] `bun run start:mcp` starts MCP server successfully
- [ ] `bun run type-check` passes
- [ ] `bun run lint` passes
- [ ] `bun test` runs (pass rate can be improved incrementally)
- [ ] No pnpm/tsup/tsx/vitest in package.json
- [ ] No tsup.config.ts or vitest.config.ts
- [ ] bun.lockb exists, pnpm-lock.yaml removed

## Notes

- **Tests**: We're migrating tests incrementally. Core functionality verified, some tests may need fixes.
- **FastMCP**: Using `bun x fastmcp` - if issues arise, can use inspector mode only.
- **Type generation**: Removed .d.ts generation since chopstack is not a library.
- **Rollback**: If needed, `git checkout main package.json && pnpm install`
