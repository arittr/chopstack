import { vi } from 'vitest';

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

// Per-project timeout is configured in vitest.config.ts (projects.unit.testTimeout)
