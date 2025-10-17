import type { SimpleGit } from 'simple-git';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { setupGitTest } from '@test/helpers';
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { GitWrapper } from '@/adapters/vcs/git-wrapper';

import { GitSpiceBackend } from '../backend';

describe('GitSpiceBackend - Branch Suffix Parent Tracking', () => {
  const { getGit, getTmpDir } = setupGitTest('git-spice-suffix');
  let backend: GitSpiceBackend;
  let git: SimpleGit;
  let _gitWrapper: GitWrapper;
  let testDir: string;

  beforeAll(async () => {
    const gitSpiceBackend = new GitSpiceBackend();
    const isAvailable = await gitSpiceBackend.isAvailable();
    if (!isAvailable) {
      throw new Error('git-spice CLI is required to run this test.');
    }
  });

  beforeEach(async () => {
    git = getGit();
    testDir = getTmpDir();
    _gitWrapper = new GitWrapper(testDir);
    backend = new GitSpiceBackend();

    // Initialize git-spice
    await backend.initialize(testDir, 'main');

    // Create initial file and commit
    const file1Path = path.join(testDir, 'file1.txt');
    fs.writeFileSync(file1Path, 'initial content\n');
    await git.add('file1.txt');
    await git.commit('Initial commit');
  });

  it('should demonstrate the parent tracking issue with suffixed branches', async () => {
    // Create first task's commit
    const file1Path = path.join(testDir, 'file1.txt');
    fs.writeFileSync(file1Path, 'task1 content\n');
    await git.add('file1.txt');
    await git.commit('Task 1 changes');
    const commitHash1 = (await git.revparse('HEAD')).trim();

    // Create second task's commit
    const file2Path = path.join(testDir, 'file2.txt');
    fs.writeFileSync(file2Path, 'task2 content\n');
    await git.add('file2.txt');
    await git.commit('Task 2 changes');
    const commitHash2 = (await git.revparse('HEAD')).trim();

    // Create third task's commit
    const file3Path = path.join(testDir, 'file3.txt');
    fs.writeFileSync(file3Path, 'task3 content\n');
    await git.add('file3.txt');
    await git.commit('Task 3 changes');
    const commitHash3 = (await git.revparse('HEAD')).trim();

    // Reset to initial commit
    await git.reset(['--hard', 'HEAD~3']);

    // Create first branch - this should work normally
    const branchName1 = 'chopstack/task-1';
    await backend.createBranchFromCommit(branchName1, commitHash1, 'main', testDir);

    // Verify first branch exists
    const branches1 = await git.branch();
    expect(branches1.all).toContain(branchName1);

    // Now create the same branch name again to trigger collision
    // The backend will create a suffixed version
    await backend.createBranchFromCommit(branchName1, commitHash2, 'main', testDir);

    // Find the actual suffixed branch that was created
    const branches2 = await git.branch();
    const suffixedBranch = branches2.all.find((b) => b.startsWith(`${branchName1}-`));

    expect(suffixedBranch).toBeDefined();
    expect(suffixedBranch).toMatch(/^chopstack\/task-1-[\da-z]+$/);

    // Now the critical test: create a third branch that should use the suffixed branch as parent
    // This demonstrates the bug: we know the actual branch name (with suffix),
    // but git-spice fails to track it properly as a parent
    const branchName3 = 'chopstack/task-3';

    // This should now succeed - the bug has been fixed!
    const branchName3Result = await backend.createBranchFromCommit(
      branchName3,
      commitHash3,
      suffixedBranch!,
      testDir,
    );
    expect(branchName3Result).toBe(branchName3);

    // Verify the third branch was created successfully
    const branches3 = await git.branch();
    expect(branches3.all).toContain(branchName3);
  });

  it('should show that createBranchFromCommit now returns the actual branch name', async () => {
    // This test demonstrates that the fix works:
    // The method createBranchFromCommit now returns the actual branch name,
    // so callers know the actual branch name when it gets suffixed

    // Create a commit
    const testPath = path.join(testDir, 'test.txt');
    fs.writeFileSync(testPath, 'content\n');
    await git.add('test.txt');
    await git.commit('Test commit');
    const commitHash = (await git.revparse('HEAD')).trim();

    // Create a branch
    const requestedName = 'chopstack/feature';
    await backend.createBranchFromCommit(requestedName, commitHash, 'main', testDir);

    // Create the same branch again - this triggers a suffix
    // The method now returns the actual branch name!
    const result = await backend.createBranchFromCommit(requestedName, commitHash, 'main', testDir);

    // The result is now the actual branch name with suffix
    expect(result).toBeDefined();
    expect(result).toMatch(/^chopstack\/feature-[\da-z]+$/);

    // We can verify the suffixed branch was created
    const branches = await git.branch();
    const suffixedBranches = branches.all.filter((b) => b.startsWith(`${requestedName}-`));
    expect(suffixedBranches.length).toBe(1);
    expect(suffixedBranches[0]).toBe(result);

    // This fix allows callers to use the actual branch name as the parent for subsequent branches!
  });
});
