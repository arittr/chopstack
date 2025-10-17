import { mock, spyOn } from 'bun:test';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

// Unit test setup - for fast, isolated tests with heavy mocking
// Mock common external dependencies that we don't want to test

// Mock Node.js file system operations
mock.module('node:fs/promises', () => ({
  readFile: mock(),
  writeFile: mock(),
  mkdir: mock(),
  stat: mock(),
  access: mock(),
}));

// Mock Node.js child process operations
mock.module('execa', () => ({
  execa: mock(),
}));

// Mock chalk for consistent output in tests
mock.module('chalk', () => {
  const mockChalk = {
    red: mock((text: string) => `[RED]${text}[/RED]`),
    green: mock((text: string) => `[GREEN]${text}[/GREEN]`),
    blue: mock((text: string) => `[BLUE]${text}[/BLUE]`),
    yellow: mock((text: string) => `[YELLOW]${text}[/YELLOW]`),
    cyan: mock((text: string) => `[CYAN]${text}[/CYAN]`),
    magenta: mock((text: string) => `[MAGENTA]${text}[/MAGENTA]`),
    white: mock((text: string) => `[WHITE]${text}[/WHITE]`),
    gray: mock((text: string) => `[GRAY]${text}[/GRAY]`),
    grey: mock((text: string) => `[GRAY]${text}[/GRAY]`),
    dim: mock((text: string) => `[DIM]${text}[/DIM]`),
    bold: mock((text: string) => `[BOLD]${text}[/BOLD]`),
  };
  return { default: mockChalk };
});

// Provide real path helpers but allow spying/mocking when needed
const actualPath = await import('node:path');
mock.module('node:path', () => ({
  ...actualPath,
  resolve: mock((actualPath as any).resolve),
  join: mock((actualPath as any).join),
  dirname: mock((actualPath as any).dirname),
  basename: mock((actualPath as any).basename),
  extname: mock((actualPath as any).extname),
}));

// Mock process operations
spyOn(process, 'cwd').mockReturnValue('/test/cwd');
spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Per-project timeout is configured in vitest.config.ts (projects.unit.testTimeout)
