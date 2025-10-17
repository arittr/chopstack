import { mock } from 'bun:test';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

// Execution test setup - for testing Claude's execution planning
// Allow real API calls but provide utilities for test management

// Mock file system operations to avoid side effects
mock.module('node:fs/promises', () => ({
  readFile: mock(),
  writeFile: mock(),
  mkdir: mock(),
  stat: mock(),
  access: mock(),
}));

// Mock git operations to avoid repository side effects
mock.module('simple-git', () => ({
  simpleGit: mock(() => ({
    init: mock(),
    add: mock(),
    commit: mock(),
    branch: mock(),
    checkout: mock(),
    status: mock(),
    diff: mock(),
  })),
}));

// Per-project timeout is configured in vitest.config.ts (projects.execution.testTimeout)

// Test utilities for execution planning
export const executionTestConfig = {
  // Mock Claude API responses if needed
  mockMode: process.env.VITEST_MOCK_CLAUDE === 'true',

  // Test specs directory
  specsDir: 'test/execution/specs',

  // Rate limiting for API calls
  apiDelay: 1000, // 1 second between API calls
};
