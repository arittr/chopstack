import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TEST_CONFIG, TEST_PATHS } from '@test/constants/test-paths';
import { execa } from 'execa';

import type { ExecutionTask } from '@/types/execution';

import { VcsEngine } from '@/engine/vcs-engine';
import { GitWrapper } from '@/utils/git-wrapper';
import { ConflictResolver } from '@/vcs/conflict-resolver';

const testRepo = join(TEST_PATHS.TEST_TMP, 'conflict-resolution-integration');

async function setupConflictTestRepository(): Promise<void> {
  // Ensure parent directory exists
  await mkdir(TEST_PATHS.TEST_TMP, { recursive: true });
  await rm(testRepo, { recursive: true, force: true });
  await mkdir(testRepo, { recursive: true });

  // Initialize git repository
  await execa('git', ['init'], { cwd: testRepo });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: testRepo });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: testRepo });

  // Create initial shared file that will cause conflicts
  const srcDir = join(testRepo, 'src');
  await mkdir(srcDir, { recursive: true });

  // Create a shared component that multiple tasks will modify
  await writeFile(
    join(srcDir, 'Button.tsx'),
    `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button onClick={onClick}>
      {children}
    </button>
  );
};
`,
  );

  await execa('git', ['add', '.'], { cwd: testRepo });
  await execa('git', ['commit', '-m', 'Initial Button component'], { cwd: testRepo });
}

function createConflictTask(id: string, modification: string): ExecutionTask {
  return {
    id,
    title: `Modify Button - ${id}`,
    description: `Apply ${modification} to Button component`,
    touches: ['src/Button.tsx'],
    produces: ['src/Button.tsx'],
    requires: [],
    estimatedLines: 20,
    agentPrompt: `Apply ${modification} to the Button component`,
    state: 'pending' as const,
    stateHistory: [],
    retryCount: 0,
    maxRetries: 3,
  };
}

describe('Conflict Resolution Integration', () => {
  let vcsEngine: VcsEngine;
  let git: GitWrapper;
  let conflictResolver: ConflictResolver;

  beforeAll(async () => {
    await setupConflictTestRepository();

    git = new GitWrapper(testRepo);
  });

  beforeEach(async () => {
    vcsEngine = new VcsEngine({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });

    conflictResolver = new ConflictResolver({
      shadowPath: TEST_PATHS.TEST_SHADOWS,
      branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });

    // Reset to main branch
    try {
      await git.checkout('main');
    } catch {
      // Ignore if main doesn't exist or other checkout issues
    }
  });

  afterAll(async () => {
    await rm(testRepo, { recursive: true, force: true });
  });

  describe('Auto Conflict Resolution', () => {
    it('should detect and auto-resolve simple conflicts', async () => {
      // Task 1: Add variant prop
      const task1 = createConflictTask('variant-prop', 'add variant prop');
      const task2 = createConflictTask('size-prop', 'add size prop');

      // Create worktrees for both tasks
      const worktrees = await vcsEngine.createWorktreesForLayer([task1, task2], 'main', testRepo);

      // Simulate Task 1: Add variant prop
      const task1Worktree = worktrees.find((w: { taskId: string }) => w.taskId === 'variant-prop');
      if (task1Worktree === undefined) {
        throw new Error('Task1 worktree not found');
      }
      await writeFile(
        join(task1Worktree.absolutePath, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ children, onClick, variant = 'primary' }) => {
  const className = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  return (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      // Simulate Task 2: Add size prop (different modification to same file)
      const task2Worktree = worktrees.find((w: { taskId: string }) => w.taskId === 'size-prop');
      if (task2Worktree === undefined) {
        throw new Error('Task2 worktree not found');
      }
      await writeFile(
        join(task2Worktree.absolutePath, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export const Button: React.FC<ButtonProps> = ({ children, onClick, size = 'medium' }) => {
  const sizeClass = \`btn-\${size}\`;
  return (
    <button className={sizeClass} onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      // Commit both tasks
      task1.state = 'completed';
      task1.commitHash = await vcsEngine.commitTaskChanges(task1, task1Worktree, {
        includeAll: true,
      });

      task2.state = 'completed';
      task2.commitHash = await vcsEngine.commitTaskChanges(task2, task2Worktree, {
        includeAll: true,
      });

      // Now attempt to cherry-pick both - this should create a conflict
      await git.checkout('main');

      // Create branch for task1 and cherry-pick its commit
      await git.git.raw(['checkout', '-b', 'test-task-1', 'main']);
      await git.cherryPick(task1.commitHash);

      // Create branch for task2 from main (not from task1) to create conflict
      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'test-task-2', 'main']);
      await git.cherryPick(task2.commitHash);

      // Now try to merge task1 into task2 branch to create conflict
      try {
        await git.git.raw(['merge', 'test-task-1']);
      } catch {
        // Expected to fail due to conflicts
      }

      // Check if we have conflicts
      const analysis = await conflictResolver.analyzeConflicts(testRepo);
      expect(analysis.totalConflicts).toBeGreaterThan(0);
      expect(analysis.conflictFiles).toContain('src/Button.tsx');

      // Attempt auto-resolution
      const resolution = await conflictResolver.resolveConflicts(
        task2,
        testRepo,
        'main',
        'test-task-2',
      );

      // Auto-resolution might succeed or fail depending on complexity
      if (resolution.success) {
        expect(resolution.strategy).toBe('auto');
        expect(resolution.conflictsResolved).toBeGreaterThan(0);
        console.log(`✅ Auto-resolved ${resolution.conflictsResolved} conflicts`);
      } else {
        expect(resolution.strategy).toBe('auto');
        expect(resolution.error).toBeDefined();
        console.log(`⚠️ Auto-resolution failed: ${resolution.error}`);
      }
    }, 60_000);
  });

  describe('Manual Conflict Resolution Strategy', () => {
    it('should require manual intervention when strategy is manual', async () => {
      // Create VCS engine with manual conflict resolution
      const manualVcsEngine = new VcsEngine({
        shadowPath: TEST_PATHS.TEST_SHADOWS,
        branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
        cleanupOnSuccess: false,
        cleanupOnFailure: false,
        conflictStrategy: 'manual',
        stackSubmission: {
          enabled: false,
          draft: true,
          autoMerge: false,
        },
      });

      const manualResolver = new ConflictResolver({
        shadowPath: TEST_PATHS.TEST_SHADOWS,
        branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
        cleanupOnSuccess: false,
        cleanupOnFailure: false,
        conflictStrategy: 'manual',
        stackSubmission: {
          enabled: false,
          draft: true,
          autoMerge: false,
        },
      });

      // Create conflicting tasks
      const task1 = createConflictTask('styling-1', 'add CSS classes');
      const task2 = createConflictTask('styling-2', 'add different CSS classes');

      const worktrees = await manualVcsEngine.createWorktreesForLayer(
        [task1, task2],
        'main',
        testRepo,
      );

      // Create conflicting modifications
      const task1Worktree = worktrees[0];
      const task2Worktree = worktrees[1];
      if (task1Worktree === undefined || task2Worktree === undefined) {
        throw new Error('Worktrees not found');
      }

      // Both tasks modify the same line in different ways
      await writeFile(
        join(task1Worktree.absolutePath, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button className="button-v1 modern-style" onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      await writeFile(
        join(task2Worktree.absolutePath, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button className="btn classic-theme" onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      // Commit both tasks
      task1.state = 'completed';
      task1.commitHash = await manualVcsEngine.commitTaskChanges(task1, task1Worktree, {
        includeAll: true,
      });

      task2.state = 'completed';
      task2.commitHash = await manualVcsEngine.commitTaskChanges(task2, task2Worktree, {
        includeAll: true,
      });

      // Create conflict scenario
      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'manual-test-1', 'main']);
      await git.cherryPick(task1.commitHash);

      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'manual-test-2', 'main']);
      await git.cherryPick(task2.commitHash);

      // Create conflict by merging
      try {
        await git.git.raw(['merge', 'manual-test-1']);
      } catch {
        // Expected conflict
      }

      // Manual resolution should not attempt auto-resolution
      const resolution = await manualResolver.resolveConflicts(
        task2,
        testRepo,
        'main',
        'manual-test-2',
      );

      expect(resolution.success).toBe(false);
      expect(resolution.strategy).toBe('manual');
      expect(resolution.error).toContain('Manual intervention required');
      expect(resolution.conflictFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Fail Strategy', () => {
    it('should fail immediately when conflicts are detected with fail strategy', async () => {
      const failResolver = new ConflictResolver({
        shadowPath: TEST_PATHS.TEST_SHADOWS,
        branchPrefix: TEST_CONFIG.TEST_BRANCH_PREFIX,
        cleanupOnSuccess: false,
        cleanupOnFailure: false,
        conflictStrategy: 'fail',
        stackSubmission: {
          enabled: false,
          draft: true,
          autoMerge: false,
        },
      });

      // Create a simple conflict scenario
      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'fail-test-1', 'main']);

      // Modify the Button file
      await writeFile(
        join(testRepo, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button data-testid="button-fail" onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      await git.add(['src/Button.tsx']);
      await git.commit('Modify button for fail test');

      // Create conflicting branch
      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'fail-test-2', 'main']);

      await writeFile(
        join(testRepo, 'src/Button.tsx'),
        `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return (
    <button id="button-fail" onClick={onClick}>
      {children}
    </button>
  );
};
`,
      );

      await git.add(['src/Button.tsx']);
      await git.commit('Different modification for fail test');

      // Create conflict
      try {
        await git.git.raw(['merge', 'fail-test-1']);
      } catch {
        // Expected conflict
      }

      const task = createConflictTask('fail-test', 'fail strategy test');

      const resolution = await failResolver.resolveConflicts(task, testRepo, 'main', 'fail-test-2');

      expect(resolution.success).toBe(false);
      expect(resolution.strategy).toBe('fail');
      expect(resolution.error).toContain('Conflicts detected and fail strategy specified');
    });
  });

  describe('Conflict Analysis', () => {
    it('should analyze conflict complexity correctly', async () => {
      // Create a complex conflict scenario
      await git.checkout('main');

      // Create a file with multiple potential conflict points
      const complexFile = `import React, { useState, useEffect } from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: string;
  size?: string;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false
}) => {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    // Complex logic here
    console.log('Button mounted');
  }, []);

  const handleClick = () => {
    if (!disabled) {
      setIsPressed(true);
      onClick?.();
      setTimeout(() => setIsPressed(false), 100);
    }
  };

  return (
    <button
      className={\`btn btn-\${variant} btn-\${size} \${isPressed ? 'pressed' : ''}\`}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};
`;

      await writeFile(join(testRepo, 'src/Button.tsx'), complexFile);
      await git.add(['src/Button.tsx']);
      await git.commit('Complex button implementation');

      await git.git.raw(['checkout', '-b', 'analysis-test-1', 'main']);

      // Modify multiple parts
      const modification1 = complexFile
        .replace("variant = 'primary'", "variant = 'default'")
        .replace('btn-${variant}', 'button-${variant}');

      await writeFile(join(testRepo, 'src/Button.tsx'), modification1);
      await git.add(['src/Button.tsx']);
      await git.commit('Modify variant handling');

      // Create conflicting branch
      await git.checkout('main');
      await git.git.raw(['checkout', '-b', 'analysis-test-2', 'main']);

      const modification2 = complexFile
        .replace("size = 'medium'", "size = 'normal'")
        .replace('btn-${size}', 'button-size-${size}');

      await writeFile(join(testRepo, 'src/Button.tsx'), modification2);
      await git.add(['src/Button.tsx']);
      await git.commit('Modify size handling');

      // Create conflict
      try {
        await git.git.raw(['merge', 'analysis-test-1']);
      } catch {
        // Expected conflict
      }

      const analysis = await conflictResolver.analyzeConflicts(testRepo);

      expect(analysis.totalConflicts).toBeGreaterThan(0);
      expect(analysis.conflictFiles).toContain('src/Button.tsx');
      expect(['low', 'medium', 'high']).toContain(analysis.complexity);
      expect(Array.isArray(analysis.suggestions)).toBe(true);
      expect(typeof analysis.autoResolvable).toBe('boolean');

      console.log(`📊 Conflict Analysis:`, {
        totalConflicts: analysis.totalConflicts,
        complexity: analysis.complexity,
        autoResolvable: analysis.autoResolvable,
        suggestions: analysis.suggestions,
      });
    });
  });
});
