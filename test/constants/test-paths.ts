/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Test path constants to avoid magic strings throughout test files
 * These paths are relative to the project root and work with @test alias
 */
export const TEST_PATHS = {
  /** Test temporary directory for all test artifacts */
  TEST_TMP: 'test/tmp',

  /** Test workspace directory for isolated test environments */
  TEST_WORKSPACE: 'test/tmp',

  /** Test shadows directory for worktree isolation */
  TEST_SHADOWS: '.test-shadows',

  /** Test specifications directory */
  TEST_SPECS: 'test/specs',

  /** Test fixtures directory */
  TEST_FIXTURES: 'test/fixtures',
} as const;

/**
 * Test configuration constants
 */
export const TEST_CONFIG = {
  /** Default timeout for integration tests */
  INTEGRATION_TIMEOUT: 10_000,

  /** Default timeout for unit tests */
  UNIT_TIMEOUT: 5000,

  /** Default timeout for E2E tests */
  E2E_TIMEOUT: 30_000,

  /** Mock disk usage in KB for du -sk command */
  MOCK_DISK_USAGE_KB: 1024,

  /** Branch prefix for test branches */
  TEST_BRANCH_PREFIX: 'test/',
} as const;

/**
 * Mock response constants
 */
export const MOCK_RESPONSES = {
  /** Mock disk usage output for du -sk command */
  DISK_USAGE: '1024\t.',

  /** Generic mock command output */
  GENERIC_COMMAND: 'mock command output',

  /** Claude CLI unavailable error message */
  CLAUDE_CLI_ERROR: 'Claude CLI not available in test environment',
} as const;
