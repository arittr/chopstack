import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isNonNullish } from '@/utils/guards';
import { WorktreeManager } from '@/vcs/worktree-manager';

import { withTestWorktree } from '../utils/testing-harness-worktree-manager';

describe('Worktree Commit Fetching (Improved with TestWorktreeManager)', () => {
  let worktreeManager: WorktreeManager;

  beforeEach(() => {
    // Setup test instances
    worktreeManager = new WorktreeManager({
      shadowPath: '.chopstack/shadows',
      branchPrefix: 'chopstack/',
      cleanupOnSuccess: false,
      cleanupOnFailure: false,
      conflictStrategy: 'auto',
      stackSubmission: {
        enabled: false,
        draft: true,
        autoMerge: false,
      },
    });
  });

  describe('Fetching commits from worktrees', () => {
    it('should work with real chopstack repo structure', async () => {
      await withTestWorktree(async (context) => {
        // We now have a real chopstack repo copy to work with
        const testRepo = context.absolutePath;

        // Create a worktree for testing
        const worktreeContext = await worktreeManager.createWorktree({
          taskId: 'test-task',
          branchName: 'chopstack/test-task',
          worktreePath: '.chopstack/shadows/test-task',
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        try {
          // Create a test file in the worktree (using real chopstack structure)
          const testFile = path.join(worktreeContext.absolutePath, 'test-change.md');
          await fs.writeFile(
            testFile,
            '# Test Change\n\nThis is a test modification to the real chopstack repo.',
          );

          // Verify we can modify actual source files too
          const packageJson = path.join(worktreeContext.absolutePath, 'package.json');
          const originalContent = await fs.readFile(packageJson, 'utf8');
          const modifiedContent = `${originalContent}\n// Test modification\n`;
          await fs.writeFile(packageJson, modifiedContent);

          // Verify modifications exist in worktree
          await expect(fs.access(testFile)).resolves.toBeUndefined();
          const newContent = await fs.readFile(packageJson, 'utf8');
          expect(newContent).toContain('Test modification');

          // Verify original repo is unchanged
          const originalPackageJson = path.join(testRepo, 'package.json');
          const originalRepoContent = await fs.readFile(originalPackageJson, 'utf8');
          expect(originalRepoContent).not.toContain('Test modification');

          console.log(`✅ Successfully tested worktree isolation with real chopstack repo`);
        } finally {
          // Clean up worktree
          await worktreeManager.removeWorktree('test-task', true);
        }
      });
    });

    it('should handle multiple worktrees with real chopstack files', async () => {
      await withTestWorktree(async (context) => {
        const testRepo = context.absolutePath;
        const tasks = ['feature-a', 'feature-b', 'feature-c'];
        const worktreeContexts = [];

        try {
          // Create multiple worktrees
          for (const taskId of tasks) {
            const worktreeContext = await worktreeManager.createWorktree({
              taskId,
              branchName: `chopstack/${taskId}`,
              worktreePath: `.chopstack/shadows/${taskId}`,
              baseRef: 'HEAD',
              workdir: testRepo,
            });
            worktreeContexts.push(worktreeContext);

            // Create unique changes in each worktree
            const featureFile = path.join(
              worktreeContext.absolutePath,
              `src/features/${taskId}.ts`,
            );
            await fs.mkdir(path.dirname(featureFile), { recursive: true });
            await fs.writeFile(
              featureFile,
              `// Feature implementation for ${taskId}\nexport const ${taskId} = () => {\n  console.log('${taskId} feature');\n};\n`,
            );

            // Also modify an existing file uniquely
            const readmeFile = path.join(worktreeContext.absolutePath, 'README.md');
            const readme = await fs.readFile(readmeFile, 'utf8');
            await fs.writeFile(
              readmeFile,
              `${readme}\n## Feature ${taskId}\n\nThis feature adds ${taskId} functionality.\n`,
            );
          }

          // Verify all worktrees have their unique changes
          for (const [i, taskId] of tasks.entries()) {
            const context = worktreeContexts[i];

            if (isNonNullish(context)) {
              const featureFile = path.join(context.absolutePath, `src/features/${taskId}.ts`);
              await expect(fs.access(featureFile)).resolves.toBeUndefined();

              const content = await fs.readFile(featureFile, 'utf8');
              expect(content).toContain(`Feature implementation for ${taskId}`);

              const readme = await fs.readFile(
                path.join(context.absolutePath, 'README.md'),
                'utf8',
              );
              expect(readme).toContain(`Feature ${taskId}`);
            }
          }

          // Verify main repo is unchanged
          const mainReadme = await fs.readFile(path.join(testRepo, 'README.md'), 'utf8');
          expect(mainReadme).not.toContain('Feature feature-a');
          expect(mainReadme).not.toContain('Feature feature-b');
          expect(mainReadme).not.toContain('Feature feature-c');

          console.log(`✅ Successfully tested ${tasks.length} parallel worktrees with real files`);
        } finally {
          // Clean up all worktrees
          for (const taskId of tasks) {
            try {
              await worktreeManager.removeWorktree(taskId, true);
            } catch (error) {
              console.log(`Note: Cleanup error for ${taskId}:`, error);
            }
          }
        }
      });
    });

    it('should demonstrate authentic chopstack development workflow', async () => {
      await withTestWorktree(async (context) => {
        const testRepo = context.absolutePath;

        // Create a worktree for a new component development
        const componentTask = 'new-button-component';
        const worktreeContext = await worktreeManager.createWorktree({
          taskId: componentTask,
          branchName: `chopstack/${componentTask}`,
          worktreePath: `.chopstack/shadows/${componentTask}`,
          baseRef: 'HEAD',
          workdir: testRepo,
        });

        try {
          // Simulate developing a new component in the real chopstack structure
          const componentDir = path.join(worktreeContext.absolutePath, 'src/components');
          await fs.mkdir(componentDir, { recursive: true });

          // Create a Button component
          const buttonComponent = path.join(componentDir, 'Button.tsx');
          await fs.writeFile(
            buttonComponent,
            `import React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
}) => {
  return (
    <button
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};
`,
          );

          // Create component tests
          const testFile = path.join(componentDir, '__tests__', 'Button.test.tsx');
          await fs.mkdir(path.dirname(testFile), { recursive: true });
          await fs.writeFile(
            testFile,
            `import { render, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('should render children', () => {
    const { getByText } = render(<Button>Click me</Button>);
    expect(getByText('Click me')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn();
    const { getByText } = render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
`,
          );

          // Update types if they exist
          const typesDir = path.join(worktreeContext.absolutePath, 'src/types');
          const uiTypesFile = path.join(typesDir, 'ui.ts');
          if (
            await fs
              .access(typesDir)
              .then(() => true)
              .catch(() => false)
          ) {
            await fs.writeFile(
              uiTypesFile,
              `// UI Component Types
export interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';
`,
            );
          }

          // Verify all files were created in worktree
          await expect(fs.access(buttonComponent)).resolves.toBeUndefined();
          await expect(fs.access(testFile)).resolves.toBeUndefined();

          const componentContent = await fs.readFile(buttonComponent, 'utf8');
          expect(componentContent).toContain('export const Button');
          expect(componentContent).toContain('ButtonProps');

          // Verify main repo is unchanged (no components directory pollution)
          const mainComponentDir = path.join(testRepo, 'src/components');
          const mainButtonExists = await fs
            .access(path.join(mainComponentDir, 'Button.tsx'))
            .then(() => true)
            .catch(() => false);
          expect(mainButtonExists).toBe(false);

          console.log(`✅ Successfully simulated authentic chopstack component development`);
        } finally {
          await worktreeManager.removeWorktree(componentTask, true);
        }
      });
    });
  });

  describe('Benefits of real repo testing', () => {
    it('should test against actual TypeScript configuration', async () => {
      await withTestWorktree(async (context) => {
        const testRepo = context.absolutePath;

        // Verify we have the real TypeScript config
        const tsconfigPath = path.join(testRepo, 'tsconfig.json');
        await expect(fs.access(tsconfigPath)).resolves.toBeUndefined();

        const tsconfigContent = await fs.readFile(tsconfigPath, 'utf8');
        // Just verify the content exists and contains expected TypeScript config elements
        expect(tsconfigContent).toContain('compilerOptions');
        expect(tsconfigContent).toContain('strict');
        expect(tsconfigContent).toContain('target');

        console.log('✅ Verified access to real TypeScript configuration');
      });
    });

    it('should test against actual package.json and dependencies', async () => {
      await withTestWorktree(async (context) => {
        const testRepo = context.absolutePath;

        const packageJsonPath = path.join(testRepo, 'package.json');
        const packageJsonBuffer = await fs.readFile(packageJsonPath);
        const packageJson = JSON.parse(packageJsonBuffer.toString('utf8'));

        expect(packageJson.name).toBe('chopstack');
        expect(packageJson.dependencies).toBeDefined();
        expect(packageJson.devDependencies).toBeDefined();

        // Verify we have the tools we expect in chopstack
        expect(packageJson.devDependencies.typescript).toBeDefined();
        expect(packageJson.devDependencies.vitest).toBeDefined();

        console.log('✅ Verified access to real package.json and dependencies');
      });
    });

    it('should demonstrate the meta nature of testing chopstack with chopstack', async () => {
      await withTestWorktree(async (context) => {
        const testRepo = context.absolutePath;

        // We can test chopstack's own CLI with the real source
        const binDir = path.join(testRepo, 'src/bin');
        await expect(fs.access(binDir)).resolves.toBeUndefined();

        const chopstackBin = path.join(binDir, 'chopstack.ts');
        await expect(fs.access(chopstackBin)).resolves.toBeUndefined();

        // We could even test decomposing chopstack's own src/ directory
        const srcDir = path.join(testRepo, 'src');
        const srcContents = await fs.readdir(srcDir);

        expect(srcContents).toContain('bin');
        expect(srcContents).toContain('vcs');
        expect(srcContents).toContain('utils');
        expect(srcContents).toContain('types');

        console.log('✅ Meta-testing: chopstack can test itself with real source files');
        console.log(`   Source directories: ${srcContents.join(', ')}`);
      });
    });
  });
});
