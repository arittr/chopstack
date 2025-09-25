import { z } from 'zod';

export const CreateWorktreeSchema = z.object({
  taskId: z.string().describe('Task ID for naming the worktree'),
  branchName: z.string().describe('Name of the branch to create'),
  baseRef: z.string().describe('Git reference to branch from'),
});

export const CreateStackBranchSchema = z.object({
  branchName: z.string().describe('Name of the branch to create'),
  parentBranch: z.string().optional().describe('Parent branch in the stack'),
});

export const MergeParallelWorkSchema = z.object({
  branches: z.array(z.string()).describe('Branches to merge'),
  targetBranch: z.string().describe('Target branch to merge into'),
  strategy: z.enum(['merge', 'rebase']).describe('Merge strategy to use'),
});

export type CreateWorktreeParams = z.infer<typeof CreateWorktreeSchema>;
export type CreateStackBranchParams = z.infer<typeof CreateStackBranchSchema>;
export type MergeParallelWorkParams = z.infer<typeof MergeParallelWorkSchema>;

export type Worktree = {
  branch?: string;
  head?: string;
  path: string;
};
