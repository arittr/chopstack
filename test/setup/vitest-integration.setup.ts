import { MOCK_RESPONSES } from '@test/constants/test-paths';
import { vi } from 'vitest';

// Integration test setup - for testing real class interactions
// Mock only truly external dependencies (file system, network, subprocess calls)

// Track created paths for more realistic fs behavior
const createdPaths = new Set<string>();
const cleanedUpPaths = new Set<string>();

// Mock Node.js file system operations - we don't want to actually write files
// But allow real operations for tests that specifically need them (like VcsEngine integration)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();

  // Check if we're running a test that should use real fs operations
  const testState = expect.getState();
  const testFile = testState.testPath ?? '';

  // VCS and engine tests need real filesystem operations
  const shouldUseRealFs =
    testFile.includes('/vcs/') ||
    testFile.includes('/engine/') ||
    testFile.includes('worktree-manager') ||
    testFile.includes('cli-runner.integration.test.ts'); // CLI runner needs real FS too

  if (shouldUseRealFs) {
    return actual; // Use real filesystem operations
  }

  // Otherwise use our mocked version
  return {
    readFile: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        if (path.includes('package.json')) {
          return '{"name": "chopstack"}';
        }
        if (path.includes('chopstack.ts') || path.includes('cli.js')) {
          return 'import { cli } from "./cli.js"; // chopstack CLI';
        }
      }
      return 'mock file content';
    }),
    writeFile: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        createdPaths.add(path);
      }
    }),
    mkdir: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        createdPaths.add(path);
      }
    }),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    access: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        // If path was cleaned up, it should not be accessible
        if (cleanedUpPaths.has(path)) {
          throw new Error(`ENOENT: no such file or directory, access '${path}'`);
        }
        // Standard paths that should exist (src/, package.json, .git)
        if (path.includes('src/') || path.includes('package.json') || path.includes('.git')) {
          return;
        }
        // Paths that were created should be accessible until cleanup
        if (createdPaths.has(path)) {
          return;
        }
        // Parent directories of created paths should be accessible
        const parentPath = path.split('/').slice(0, -1).join('/');
        if (createdPaths.has(parentPath)) {
          return;
        }
        // Test workspace paths are initially accessible
        if (path.includes('test/tmp')) {
          // But if they contain a test ID that was cleaned up, they should not exist
          const pathParts = path.split('/');
          const testIdPart = pathParts.find(
            (part) =>
              part.startsWith('test-') ||
              part.startsWith('basic-test') ||
              part.startsWith('bulk-test'),
          );
          if (testIdPart !== undefined && cleanedUpPaths.has(path)) {
            throw new Error(`ENOENT: no such file or directory, access '${path}'`);
          }
          return;
        }
        // Other paths should not exist
        throw new Error(`ENOENT: no such file or directory, access '${path}'`);
      }
    }),
    unlink: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        createdPaths.delete(path);
        cleanedUpPaths.add(path);
      }
    }),
    rm: vi.fn().mockImplementation((path: unknown) => {
      if (typeof path === 'string') {
        createdPaths.delete(path);
        cleanedUpPaths.add(path);
      }
    }),
  };
});

// Helper to simulate cleanup
export const mockFsCleanup = (path: string): void => {
  createdPaths.delete(path);
  cleanedUpPaths.add(path);
};

// Mock subprocess execution - but allow real execution for integration tests
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();

  // Check if we're running a test that should use real subprocess execution
  const testState = expect.getState();
  const testFile = testState.testPath ?? '';

  // VCS and engine tests need real git operations
  const shouldUseRealSubprocess =
    testFile.includes('/vcs/') ||
    testFile.includes('/engine/') ||
    testFile.includes('worktree-manager') ||
    testFile.includes('run.integration.test.ts') ||
    testFile.includes('cli-runner.integration.test.ts');

  if (shouldUseRealSubprocess) {
    return actual; // Use real subprocess execution
  }

  // Otherwise use our mocked version
  return {
    spawn: vi.fn(),
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    exec: vi.fn().mockImplementation((cmd: unknown, options?: unknown, callback?: unknown) => {
      // Handle promisified exec (used by util.promisify(exec))
      let actualCallback = callback;

      if (typeof options === 'function') {
        actualCallback = options;
      }

      // Mock du -sk . command for disk usage estimation
      if (typeof cmd === 'string' && cmd.includes('du -sk')) {
        if (typeof actualCallback === 'function') {
          process.nextTick(() => {
            actualCallback(null, { stdout: MOCK_RESPONSES.DISK_USAGE, stderr: '' });
          });
        }
        return { stdout: MOCK_RESPONSES.DISK_USAGE, stderr: '' };
      }

      // Mock Claude CLI calls - simulate failure to force fallback to rule-based generation
      // NOTE: This produces expected "Claude CLI not found" warnings during tests
      // This is normal behavior when Claude CLI is not installed on the system
      if (typeof cmd === 'string' && cmd.includes('claude')) {
        const error = new Error(MOCK_RESPONSES.CLAUDE_CLI_ERROR);
        if (typeof actualCallback === 'function') {
          process.nextTick(() => {
            actualCallback(error);
          });
        }
        throw error;
      }

      // Default mock response for other commands
      if (typeof actualCallback === 'function') {
        process.nextTick(() => {
          actualCallback(null, { stdout: MOCK_RESPONSES.GENERIC_COMMAND, stderr: '' });
        });
      }
      return { stdout: MOCK_RESPONSES.GENERIC_COMMAND, stderr: '' };
    }),
    execSync: vi.fn(),
  };
});

// Mock external agents that make API calls - but allow real calls for integration tests
vi.mock('@/agents', async (importOriginal) => {
  const actual = await importOriginal();

  // Check if we're running a test that should use real agents
  const testState = expect.getState();
  const testFile = testState.testPath ?? '';
  const shouldUseRealAgents = testFile.includes('integration.test.ts');

  if (shouldUseRealAgents) {
    return actual; // Use real agent implementations
  }

  // Otherwise use mocked version
  return {
    createDecomposerAgent: vi.fn(),
  };
});

// Mock complex execution engine - but allow real for integration tests
vi.mock('@/engine/execution-engine', async (importOriginal) => {
  const actual = await importOriginal();

  // Check if we're running a test that should use real execution engine
  const testState = expect.getState();
  const testFile = testState.testPath ?? '';

  // VCS and engine tests might need real execution engine
  const shouldUseRealEngine =
    testFile.includes('/vcs/') ||
    testFile.includes('/engine/') ||
    testFile.includes('run.integration.test.ts');

  if (shouldUseRealEngine) {
    return actual; // Use real execution engine
  }

  // Otherwise use mocked version
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ExecutionEngine: vi.fn(),
  };
});

// Allow process.cwd() but mock exit
vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() called');
});

// Suppress console output by default (tests can override if needed)
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Per-project timeout is configured in vitest.config.ts (projects.integration.testTimeout)
