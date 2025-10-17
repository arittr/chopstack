import { testWorktreeManager } from '@test/utils/testing-harness-worktree-manager';
import { afterAll } from 'bun:test';

import { isValidArray } from '@/validation/guards';

const cleanupFlag = Symbol.for('chopstack.testWorktreeCleanupRegistered');

if (Reflect.get(globalThis, cleanupFlag) !== true) {
  Reflect.set(globalThis, cleanupFlag, true);

  // Only cleanup after ALL tests in the file complete
  // Don't cleanup before or during tests to avoid interference
  afterAll(async () => {
    console.log('🧹 Cleaning up test worktrees...');
    const { removed, failed } = await testWorktreeManager.cleanupAllWorktrees();

    if (isValidArray(removed) && removed.length > 0) {
      console.log(
        `✅ Test cleanup complete: ${removed.length} ${removed.length === 1 ? 'worktree' : 'worktrees'} removed`,
      );
    }

    if (isValidArray(failed) && failed.length > 0) {
      console.warn(
        `⚠️ Failed to remove ${failed.length} test worktree${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`,
      );
    }
  });
}
