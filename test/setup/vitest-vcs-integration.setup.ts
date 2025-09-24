import { TEST_CONFIG } from '@test/constants/test-paths';
import { vi } from 'vitest';

// VCS Integration test setup - for testing real git and filesystem operations
// These tests need actual filesystem and subprocess access

// Only mock things that absolutely need mocking (like external API calls)
// But allow real filesystem, git, and subprocess operations

// Mock external agents that make API calls
const actualAgents = await vi.importActual('@/agents');
vi.mock('@/agents', () => ({
  ...actualAgents,
  // Keep real implementations for integration tests that need them
}));

// Allow process.cwd() but mock exit
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Suppress console output by default (tests can override if needed)
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Integration test configuration for VCS tests
vi.setConfig({
  testTimeout: TEST_CONFIG.INTEGRATION_TIMEOUT,
});
