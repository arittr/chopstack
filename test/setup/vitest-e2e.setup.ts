// Create test directories if they don't exist
import { mkdirSync, rmSync } from 'node:fs';
// E2E test setup - for testing CLI commands end-to-end
// Minimal mocking, allow real filesystem and subprocess operations in controlled environment
import { resolve } from 'node:path';

import { vi } from 'vitest';

const testDir = resolve(process.cwd(), 'tmp/e2e-tests');

// Setup test environment
beforeAll(() => {
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
  } catch {
    // Cleanup failed, but don't fail tests
  }
});

// Per-project timeout is configured in vitest.config.ts (projects.e2e.testTimeout)

// Export test utilities
export { testDir };
