import { vi } from 'vitest';

// Integration test setup - for testing real class interactions
// Mock only truly external dependencies (file system, network, subprocess calls)

// Mock Node.js file system operations - we don't want to actually write files
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

// Mock subprocess execution - we don't want to run real git/CLI commands
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
}));

// Mock external agents that make API calls
vi.mock('@/agents', () => ({
  createDecomposerAgent: vi.fn(),
}));

// Mock complex execution engine to avoid git operations
vi.mock('@/engine/execution-engine', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ExecutionEngine: vi.fn(),
}));

// Allow process.cwd() but mock exit
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Suppress console output by default (tests can override if needed)
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Integration test configuration
vi.setConfig({
  testTimeout: 10_000, // Integration tests can take a bit longer
});
