/**
 * Test helpers for chopstack integration and unit tests.
 * Provides utilities for test isolation, resource tracking, and common test patterns.
 */

// Core test environment and resource tracking
export {
  GitTestEnvironment,
  createGitTestEnvironment,
  type GitTestEnvironment as TestEnvironment,
} from './git-test-environment';

export {
  testResourceTracker,
  cleanupOrphanedTestResources,
  ensureAllResourcesCleanedUp,
} from './test-resource-tracker';

// Test utilities and helpers
export {
  setupGitTest,
  createTestTask,
  createTestDagNode,
  createTestPlan,
  waitFor,
  createMockFn,
  createTestFileStructure,
  createTestCommits,
  mockGitSpiceAvailable,
  assertBranchExists,
  assertWorktreeExists,
  createTestId,
} from './test-utils';
