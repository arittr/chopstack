import { TEST_CONFIG } from '@test/constants/test-paths';
import { mock, spyOn } from 'bun:test';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';
// Import test infrastructure cleanup for GitTestEnvironment and TestResourceTracker
import './test-infrastructure-cleanup';

// VCS Integration test setup - for testing real git and filesystem operations
// These tests need actual filesystem and subprocess access

// Only mock things that absolutely need mocking (like external API calls)
// But allow real filesystem, git, and subprocess operations

// Mock external agents that make API calls
const actualAgents = await import('@/agents');
mock.module('@/agents', () => ({
  ...actualAgents,
  // Keep real implementations for integration tests that need them
}));

// Allow process.cwd() but mock exit
spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Suppress console output by default (tests can override if needed)
spyOn(console, 'log').mockImplementation(() => {});
spyOn(console, 'error').mockImplementation(() => {});
