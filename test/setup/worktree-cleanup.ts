import { testWorktreeManager } from '@test/utils/testing-harness-worktree-manager';
import { afterAll, beforeAll } from 'vitest';

import { isValidArray } from '@/validation/guards';

const cleanupFlag = Symbol.for('chopstack.testWorktreeCleanupRegistered');

if (Reflect.get(globalThis, cleanupFlag) !== true) {
  Reflect.set(globalThis, cleanupFlag, true);

  // Initial cleanup before tests start
  beforeAll(async () => {
    console.log('🧹 Cleaning up any leftover test worktrees before tests...');
    try {
      const { removed, failed } = await testWorktreeManager.cleanupAllWorktrees();

      if (isValidArray(removed) && removed.length > 0) {
        console.log(
          `✅ Cleaned up ${removed.length} leftover worktree${removed.length === 1 ? '' : 's'}`,
        );
      }

      if (isValidArray(failed) && failed.length > 0) {
        console.warn(
          `⚠️ Failed to clean ${failed.length} worktree${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`,
        );
      }
    } catch (error) {
      console.warn('⚠️ Pre-test worktree cleanup failed:', error);
    }
  });

  // Final cleanup after all tests complete
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
