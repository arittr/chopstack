// Create test directories if they don't exist
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
// E2E test setup - for testing CLI commands end-to-end
// Minimal mocking, allow real filesystem and subprocess operations in controlled environment
import { resolve } from 'node:path';

import { afterAll, beforeAll } from 'vitest';

// Import worktree cleanup to ensure it runs after all tests
import './worktree-cleanup';

const testDir = resolve(process.cwd(), 'tmp/e2e-tests');

// Setup test environment
beforeAll(() => {
  console.log('🧹 Cleaning up before E2E tests...');
  // Ensure clean test directory
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  mkdirSync(testDir, { recursive: true });
});

// Cleanup after tests
afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
    // Also run git worktree prune and test:clean
    execSync('git worktree prune', { stdio: 'pipe' });
    execSync('pnpm test:clean', { stdio: 'pipe' });
    console.log('✅ E2E test cleanup complete');
  } catch (error) {
    console.warn('⚠️ E2E test cleanup failed:', error instanceof Error ? error.message : error);
  }
});

// Per-project timeout is configured in vitest.config.ts (projects.e2e.testTimeout)

// Export test utilities
export { testDir };
