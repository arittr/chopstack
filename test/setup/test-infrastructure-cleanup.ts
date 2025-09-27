import { cleanupOrphanedTestResources, ensureAllResourcesCleanedUp } from '@test/helpers';
import { afterAll } from 'vitest';

const cleanupFlag = Symbol.for('chopstack.testInfrastructureCleanupRegistered');

if (Reflect.get(globalThis, cleanupFlag) !== true) {
  Reflect.set(globalThis, cleanupFlag, true);

  // Clean up orphaned resources before all tests
  console.log('🧹 Cleaning up orphaned test resources...');
  cleanupOrphanedTestResources();

  // Clean up all tracked resources after all tests
  afterAll(async () => {
    console.log('🧹 Final cleanup of test infrastructure...');
    await ensureAllResourcesCleanedUp();
    console.log('✅ Test infrastructure cleanup complete');
  });
}
