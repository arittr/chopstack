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

// Mock Node.js path operations (these are usually safe but we mock for consistency)
vi.mock('node:path', () => ({
  resolve: vi.fn(),
  join: vi.fn(),
  dirname: vi.fn(),
  basename: vi.fn(),
  extname: vi.fn(),
}));

// Mock process operations
vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Global test configuration
vi.setConfig({
  testTimeout: 5000, // Unit tests should be fast
});
