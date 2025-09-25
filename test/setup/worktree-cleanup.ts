import { testWorktreeManager } from '@test/utils/testing-harness-worktree-manager';
import { afterAll } from 'vitest';

import { isValidArray } from '@/validation/guards';

const cleanupFlag = Symbol.for('chopstack.testWorktreeCleanupRegistered');

if (Reflect.get(globalThis, cleanupFlag) !== true) {
  Reflect.set(globalThis, cleanupFlag, true);

  afterAll(async () => {
    const { removed, failed } = await testWorktreeManager.cleanupAllWorktrees();

    if (isValidArray(removed)) {
      console.log(
        `🧹 Removed ${removed.length} leftover test worktree${removed.length === 1 ? '' : 's'}.`,
      );
    }

    if (isValidArray(failed)) {
      console.warn(
        `⚠️ Failed to remove ${failed.length} test worktree${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`,
      );
    }
  });
}
