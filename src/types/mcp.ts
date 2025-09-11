export type TaskExecutionStrategy = 'serial' | 'parallel';

export type TaskExecutionParams = {
  files: string[];
  prompt: string;
  strategy: TaskExecutionStrategy;
  taskId: string;
  title: string;
  workdir?: string;
};

export type ParallelTask = {
  files: string[];
  id: string;
  prompt: string;
  title: string;
};

export type TaskExecutionResult = {
  exitCode: number;
  output: string;
  status: 'completed' | 'failed';
  taskId: string;
};

export type WorktreeResult = {
  branchName: string;
  status: 'created';
  taskId: string;
  worktreePath: string;
};

export type BranchResult = {
  branchName: string;
  parentBranch?: string;
  status: 'created';
  tool: 'git-spice' | 'git';
};

export type MergeResult = {
  branch: string;
  error?: string;
  status: 'merged' | 'failed';
};

export type MergeStrategy = 'merge' | 'rebase';
