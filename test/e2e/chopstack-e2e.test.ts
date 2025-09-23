import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { Plan } from '@/types/decomposer';

import { DagValidator } from '@/utils/dag-validator';
import { hasContent } from '@/utils/guards';

import { checkWorkspaceAvailable, runCliInProcess } from '../utils/cli-runner';

describe('Chopstack E2E Integration Tests', () => {
  const NEXTJS_REPO_PATH = '../typescript-nextjs-starter';
  const SPEC_PATH = path.join(__dirname, 'specs', 'add-dark-mode.md');

  beforeAll(() => {
    // Check if workspace is available for tests that need it
    if (!checkWorkspaceAvailable(NEXTJS_REPO_PATH)) {
      console.warn(`Workspace not found: ${NEXTJS_REPO_PATH} - some tests will be skipped`);
    }
  });

  describe('decompose command with Claude agent', () => {
    let generatedPlan: Plan;
    let planOutput: string;
    let tempOutputFile: string;

    beforeAll(async () => {
      // Skip if workspace not available
      if (!checkWorkspaceAvailable(NEXTJS_REPO_PATH)) {
        throw new Error(
          `Workspace not found: ${NEXTJS_REPO_PATH} - clone the required test workspace`,
        );
      }

      // Create a temporary file for output
      tempOutputFile = path.join(os.tmpdir(), `chopstack-test-${Date.now()}.yaml`);

      try {
        console.log('🚀 Starting chopstack decompose with Claude agent...');
        console.log(`📁 Working directory: ${NEXTJS_REPO_PATH}`);
        console.log(`📋 Spec file: ${SPEC_PATH}`);
        console.log(`📁 Output file: ${tempOutputFile}`);
        console.log('⏳ This may take a few minutes...');

        const startTime = Date.now();

        // Run chopstack decompose with Claude agent using in-process runner
        try {
          const result = await runCliInProcess(
            [
              'decompose',
              '--spec',
              SPEC_PATH,
              '--agent',
              'claude',
              '--verbose',
              '--output',
              tempOutputFile,
            ],
            {
              cwd: NEXTJS_REPO_PATH,
              timeout: 300_000, // 5 minute timeout
            },
          );

          if (result.exitCode !== 0) {
            console.warn(`⚠️  Command failed but checking for output file...`);
            console.warn(
              `❌ Command failed: ${result.stderr !== '' ? result.stderr : (result.error?.message ?? 'Unknown error')}`,
            );
          }
        } catch {
          // Even if the command failed, we might have generated output
          console.warn('⚠️  Command failed but checking for output file...');
        }

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Total execution time: ${duration}s`);

        // Check if output file was created
        if (fs.existsSync(tempOutputFile)) {
          planOutput = fs.readFileSync(tempOutputFile, 'utf8');
          console.log(`✅ Found output file with ${planOutput.length} characters`);

          // Parse the YAML output
          generatedPlan = parseYaml(planOutput) as Plan;
          console.log(`📋 Parsed plan with ${generatedPlan.tasks.length} tasks`);
        } else {
          throw new Error('❌ No output file was generated');
        }
      } catch (error) {
        const commandError = error as { message: string; stderr?: string; stdout?: string };
        console.error('❌ Command failed:', commandError.message);
        if (hasContent(commandError.stdout)) {
          console.error('📤 Stdout:', commandError.stdout);
        }
        if (hasContent(commandError.stderr)) {
          console.error('📤 Stderr:', commandError.stderr);
        }

        // Check if this is a file conflict error - this might be expected behavior
        if (hasContent(commandError.stderr) && commandError.stderr.includes('File conflicts:')) {
          console.warn('⚠️  File conflicts detected - this may be expected for complex features');
          console.warn(
            '💡 Consider updating the spec or chopstack to handle overlapping file changes',
          );
        }

        // Always show the generated plan if we have it, even on error
        if (fs.existsSync(tempOutputFile)) {
          const outputContent = fs.readFileSync(tempOutputFile, 'utf8');
          console.log('📋 Generated plan content (even though validation failed):');
          console.log('─'.repeat(80));
          console.log(outputContent);
          console.log('─'.repeat(80));
        }

        throw error;
      }
    }, 300_000); // 5 minute timeout for the test

    afterAll(() => {
      // Clean up temporary file
      if (tempOutputFile.length > 0 && fs.existsSync(tempOutputFile)) {
        fs.unlinkSync(tempOutputFile);
        console.log(`🧹 Cleaned up temporary file: ${tempOutputFile}`);
      }
    });

    it('should generate a valid plan structure', () => {
      console.log('🔍 Validating plan structure...');
      expect(generatedPlan).toBeDefined();
      expect(generatedPlan.tasks).toBeDefined();
      expect(Array.isArray(generatedPlan.tasks)).toBe(true);
      expect(generatedPlan.tasks.length).toBeGreaterThan(0);
      console.log('✅ Plan structure is valid');
    });

    it('should generate tasks with required properties', () => {
      for (const task of generatedPlan.tasks) {
        expect(task.id).toBeDefined();
        expect(typeof task.id).toBe('string');
        expect(task.id.trim()).not.toBe('');

        expect(task.title).toBeDefined();
        expect(typeof task.title).toBe('string');
        expect(task.title.trim()).not.toBe('');

        expect(task.description).toBeDefined();
        expect(typeof task.description).toBe('string');
        expect(task.description.trim()).not.toBe('');

        expect(Array.isArray(task.touches)).toBe(true);
        expect(Array.isArray(task.produces)).toBe(true);
        expect(Array.isArray(task.requires)).toBe(true);

        expect(typeof task.estimatedLines).toBe('number');
        expect(task.estimatedLines).toBeGreaterThan(0);

        expect(task.agentPrompt).toBeDefined();
        expect(typeof task.agentPrompt).toBe('string');
        expect(task.agentPrompt.trim()).not.toBe('');
      }
    });

    it('should generate a valid DAG without cycles', () => {
      console.log('🔍 Validating DAG structure...');
      const validation = DagValidator.validatePlan(generatedPlan);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.circularDependencies).toBeUndefined();
      expect(validation.missingDependencies).toBeUndefined();
      console.log('✅ DAG is valid with no cycles');
    });

    it('should generate reasonable task decomposition for dark mode feature', () => {
      // Check that we have multiple tasks (dark mode should be decomposed into several steps)
      expect(generatedPlan.tasks.length).toBeGreaterThan(1);
      expect(generatedPlan.tasks.length).toBeLessThan(15); // Reasonable upper bound

      // Check for expected task types in a dark mode implementation
      const taskTitles = generatedPlan.tasks.map((t) => t.title.toLowerCase()).join(' ');
      const taskDescriptions = generatedPlan.tasks
        .map((t) => t.description.toLowerCase())
        .join(' ');
      const combinedContent = `${taskTitles} ${taskDescriptions}`;

      // Should mention key concepts for dark mode
      expect(combinedContent).toMatch(/theme|dark|light/i);
      expect(combinedContent).toMatch(/context|provider|state/i);
    });

    it('should generate tasks with appropriate file targeting', () => {
      const allFiles = [
        ...generatedPlan.tasks.flatMap((t) => t.touches),
        ...generatedPlan.tasks.flatMap((t) => t.produces),
      ];

      // Should target appropriate file types for a Next.js project
      const hasReactFiles = allFiles.some((file) => file.endsWith('.tsx') || file.endsWith('.ts'));

      expect(hasReactFiles).toBe(true);
      // CSS files are common but not required (could use CSS-in-JS)
      // expect(hasStyleFiles).toBe(true);
    });

    it('should calculate reasonable metrics', () => {
      console.log('📊 Calculating plan metrics...');
      const metrics = DagValidator.calculateMetrics(generatedPlan);

      console.log(`   Task count: ${metrics.taskCount}`);
      console.log(`   Max parallelization: ${metrics.maxParallelization}`);
      console.log(`   Execution layers: ${metrics.executionLayers}`);
      console.log(`   Estimated speedup: ${metrics.estimatedSpeedup.toFixed(2)}x`);

      expect(metrics.taskCount).toBe(generatedPlan.tasks.length);
      expect(metrics.maxParallelization).toBeGreaterThan(0);
      expect(metrics.executionLayers).toBeGreaterThan(0);
      expect(metrics.criticalPathLength).toBeGreaterThan(0);
      expect(metrics.totalEstimatedLines).toBeGreaterThan(0);
      expect(metrics.estimatedSpeedup).toBeGreaterThan(0);
      console.log('✅ Metrics calculated successfully');
    });

    it('should provide valid execution order', () => {
      const executionOrder = DagValidator.getExecutionOrder(generatedPlan);
      expect(executionOrder).toHaveLength(generatedPlan.tasks.length);

      // Each task in execution order should be from the original plan
      const originalTaskIds = new Set(generatedPlan.tasks.map((t) => t.id));
      for (const task of executionOrder) {
        expect(originalTaskIds.has(task.id)).toBe(true);
      }
    });

    it('should generate output that can be saved and parsed', () => {
      // Verify the raw output is valid YAML
      expect(planOutput.trim()).not.toBe('');
      expect(() => parseYaml(planOutput) as Plan).not.toThrow();

      // Verify it starts with tasks key (basic YAML structure check)
      expect(planOutput.trim()).toMatch(/^tasks:\s*$/m);
    });
  });

  describe('error handling', () => {
    it('should handle invalid spec file gracefully', async () => {
      const invalidSpecPath = path.join(__dirname, 'nonexistent-spec.md');

      const result = await runCliInProcess(
        ['decompose', '--spec', invalidSpecPath, '--agent', 'claude'],
        {
          cwd: NEXTJS_REPO_PATH,
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBeDefined();
    });

    it('should handle missing working directory gracefully', async () => {
      const result = await runCliInProcess(
        ['decompose', '--spec', SPEC_PATH, '--agent', 'claude'],
        {
          cwd: '/nonexistent/directory',
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.error !== undefined || result.stderr !== '').toBe(true);
    });
  });
});
