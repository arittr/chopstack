import { TEST_CONFIG } from '@test/constants/test-paths';
import { afterAll, beforeAll, vi } from 'vitest';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

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

// Global cleanup for VCS integration tests
beforeAll(() => {
  console.log('🧹 Cleaning up before VCS integration tests...');
});

afterAll(async () => {
  try {
    const { execSync } = await import('node:child_process');
    execSync('git worktree prune', { stdio: 'pipe' });
    execSync('pnpm test:clean', { stdio: 'pipe' });
    console.log('✅ VCS integration test cleanup complete');
  } catch (error) {
    console.warn(
      '⚠️ VCS integration test cleanup failed:',
      error instanceof Error ? error.message : error,
    );
  }
});

// Integration test configuration for VCS tests
vi.setConfig({
  testTimeout: TEST_CONFIG.INTEGRATION_TIMEOUT,
});
