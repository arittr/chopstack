import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * In-process CLI runner for tests to eliminate build dependency
 *
 * This allows tests to run CLI commands directly without requiring
 * the compiled dist/bin/chopstack.js, making tests faster and
 * removing the "build first" requirement.
 */

export type CliRunnerOptions = {
  cwd?: string;
  env?: Record<string, string>;
  mockExit?: boolean; // Prevent process.exit() in tests
  timeout?: number;
};

export type CliResult = {
  error?: Error | undefined;
  exitCode: number;
  stderr: string;
  stdout: string;
};

/**
 * Run CLI command in-process without spawning subprocess
 */
export async function runCliInProcess(
  args: string[],
  options: CliRunnerOptions = {},
): Promise<CliResult> {
  const { cwd = process.cwd(), env = {}, timeout = 30_000, mockExit = true } = options;

  // Store original values
  const originalCwd = process.cwd();
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  const originalExit = process.exit;

  // Capture stdout/stderr
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let error: Error | undefined;

  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;

  try {
    // Mock process environment
    process.chdir(cwd);
    process.argv = ['node', 'chopstack', ...args];
    Object.assign(process.env, env);

    // Mock process.exit to capture exit codes
    if (mockExit) {
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
        // Don't actually exit, just capture the code
        return undefined as never;
      }) as typeof process.exit;
    }

    // Capture stdout
    process.stdout.write = ((chunk: any) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;

    // Capture stderr
    process.stderr.write = ((chunk: any) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;

    // Set timeout
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      // eslint-disable-next-line no-undef
      setTimeout(() => {
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    });

    // Run the CLI
    const { run } = await import('@/cli');
    const cliPromise = run(args);

    const result = await Promise.race([cliPromise, timeoutPromise]);
    if (typeof result === 'number') {
      exitCode = result;
    }
  } catch (error_) {
    error = error_ instanceof Error ? error_ : new Error(String(error_));
    exitCode = 1;
  } finally {
    // Restore original environment
    process.chdir(originalCwd);
    process.argv = originalArgv;
    process.env = originalEnv;
    process.exit = originalExit;
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
  }

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error,
  };
}

/**
 * Simplified helper for common CLI operations in tests
 */
export class CliTestRunner {
  constructor(private readonly _defaultOptions: CliRunnerOptions = {}) {}

  async run(command: string, options: CliRunnerOptions = {}): Promise<CliResult> {
    const args = command.split(' ').filter(Boolean);
    return runCliInProcess(args, { ...this._defaultOptions, ...options });
  }

  async decompose(specPath: string, options: CliRunnerOptions = {}): Promise<CliResult> {
    return this.run(`decompose --spec ${specPath}`, options);
  }

  async runExecution(
    planPath: string,
    mode: 'plan' | 'dry-run' | 'execute' | 'validate' = 'plan',
    options: CliRunnerOptions = {},
  ): Promise<CliResult> {
    return this.run(`run --plan ${planPath} --mode ${mode}`, options);
  }

  async stack(options: CliRunnerOptions = {}): Promise<CliResult> {
    return this.run('stack', options);
  }
}

/**
 * Environment guards for optional tooling
 */
export function checkGitSpiceAvailable(): boolean {
  try {
    execSync('gs --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function checkWorkspaceAvailable(workspacePath: string): boolean {
  try {
    return existsSync(workspacePath);
  } catch {
    return false;
  }
}

export function skipUnlessGitSpice(testName: string, testFn: () => void | Promise<void>): void {
  const hasGitSpice = checkGitSpiceAvailable();

  if (!hasGitSpice) {
    it.skip(`${testName} (git-spice not available - install with: brew install git-spice)`, testFn);
  } else {
    it(testName, testFn);
  }
}

export function skipUnlessWorkspace(
  workspacePath: string,
  testName: string,
  testFn: () => void | Promise<void>,
): void {
  const hasWorkspace = checkWorkspaceAvailable(workspacePath);

  if (!hasWorkspace) {
    it.skip(
      `${testName} (workspace not found: ${workspacePath} - clone the required test workspace)`,
      testFn,
    );
  } else {
    it(testName, testFn);
  }
}
