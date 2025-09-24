import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TEST_CONFIG, TEST_PATHS } from '@test/constants/test-paths';
import { execa } from 'execa';

import { VcsEngine } from '@/engine/vcs-engine';

const integrationRepo = join(TEST_PATHS.TEST_TMP, 'vcs-engine-integration');

async function setupIntegrationRepo(): Promise<void> {
  await rm(integrationRepo, { recursive: true, force: true });
  await mkdir(integrationRepo, { recursive: true });
  await execa('git', ['init'], { cwd: integrationRepo });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: integrationRepo });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: integrationRepo });
  await execa('git', ['commit', '--allow-empty', '-m', 'Initial commit'], { cwd: integrationRepo });
}

describe('VcsEngine integration', () => {
  beforeAll(async () => {
    await setupIntegrationRepo();
  });

  afterAll(async () => {
    await rm(integrationRepo, { recursive: true, force: true });
  });

  it('generates commit message using Claude CLI', async () => {
    const componentPath = join(integrationRepo, 'src/components');
    await mkdir(componentPath, { recursive: true });
    const filePath = join(componentPath, 'User.tsx');
    await writeFile(filePath, 'export const User = () => null;\n');
    await execa('git', ['add', '.'], { cwd: integrationRepo });

    const vcsEngine = new VcsEngine({
      shadowPath: join(integrationRepo, '.chopstack/shadows'),
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
      cleanupOnSuccess: true,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });

    const mockTask = {
      id: 'integration-component',
      title: 'Create Integration Component',
      description: 'Validate Claude commit message generation end-to-end',
      touches: [],
      produces: ['src/components/User.tsx'],
      requires: [],
      estimatedLines: 10,
      agentPrompt: 'Create integration component',
      state: 'pending' as const,
      stateHistory: [],
      retryCount: 0,
      maxRetries: 1,
    };

    const changes = {
      files: ['src/components/User.tsx'],
      output: 'Generated integration component file',
    };

    const message = await vcsEngine.generateCommitMessage(mockTask, changes, integrationRepo);

    expect(message).toContain('🤖 Generated with Claude via chopstack');
    expect(message).toContain('Co-Authored-By: Claude');
  }, 60_000);
});
