import { vi } from 'vitest';

// Execution test setup - for testing Claude's execution planning
// Allow real API calls but provide utilities for test management

// Mock file system operations to avoid side effects
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

// Mock git operations to avoid repository side effects
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    init: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    branch: vi.fn(),
    checkout: vi.fn(),
    status: vi.fn(),
    diff: vi.fn(),
  })),
}));

// Execution test configuration
vi.setConfig({
  testTimeout: 60_000, // Execution planning tests may involve API calls
});

// Test utilities for execution planning
export const executionTestConfig = {
  // Mock Claude API responses if needed
  mockMode: process.env.VITEST_MOCK_CLAUDE === 'true',

  // Test specs directory
  specsDir: 'test/execution/specs',

  // Rate limiting for API calls
  apiDelay: 1000, // 1 second between API calls
};
