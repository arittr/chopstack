import { afterAll, beforeAll, vi } from 'vitest';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

// Unit test setup - for fast, isolated tests with heavy mocking
// Mock common external dependencies that we don't want to test

// Mock Node.js file system operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

// Mock Node.js child process operations
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Mock chalk for consistent output in tests
vi.mock('chalk', () => {
  const mockChalk = {
    red: vi.fn((text: string) => `[RED]${text}[/RED]`),
    green: vi.fn((text: string) => `[GREEN]${text}[/GREEN]`),
    blue: vi.fn((text: string) => `[BLUE]${text}[/BLUE]`),
    yellow: vi.fn((text: string) => `[YELLOW]${text}[/YELLOW]`),
    cyan: vi.fn((text: string) => `[CYAN]${text}[/CYAN]`),
    magenta: vi.fn((text: string) => `[MAGENTA]${text}[/MAGENTA]`),
    white: vi.fn((text: string) => `[WHITE]${text}[/WHITE]`),
    gray: vi.fn((text: string) => `[GRAY]${text}[/GRAY]`),
    grey: vi.fn((text: string) => `[GRAY]${text}[/GRAY]`),
    dim: vi.fn((text: string) => `[DIM]${text}[/DIM]`),
    bold: vi.fn((text: string) => `[BOLD]${text}[/BOLD]`),
  };
  return { default: mockChalk };
});

// Provide real path helpers but allow spying/mocking when needed
const actualPath = await vi.importActual('node:path');
vi.mock('node:path', () => ({
  ...actualPath,
  resolve: vi.fn((actualPath as any).resolve),
  join: vi.fn((actualPath as any).join),
  dirname: vi.fn((actualPath as any).dirname),
  basename: vi.fn((actualPath as any).basename),
  extname: vi.fn((actualPath as any).extname),
}));

// Mock process operations
vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Global cleanup after all tests
beforeAll(() => {
  // Log that we're starting unit tests
  console.log('🧹 Cleaning up before unit tests...');
});

afterAll(async () => {
  // Run test:clean to ensure everything is cleaned up
  try {
    const { execSync } = await import('node:child_process');
    execSync('pnpm test:clean', { stdio: 'pipe' });
    console.log('✅ Test cleanup complete');
  } catch (error) {
    console.warn('⚠️ Test cleanup failed:', error instanceof Error ? error.message : error);
  }
});

// Per-project timeout is configured in vitest.config.ts (projects.unit.testTimeout)
