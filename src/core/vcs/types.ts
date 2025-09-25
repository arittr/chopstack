/**
 * Git and VCS-related type definitions for chopstack
 */

export type GitCommitInfo = {
  author: string;
  date: Date;
  hash: string;
  message: string;
};

export type GitBranchInfo = {
  current: boolean;
  name: string;
  remote?: string;
};

export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';

export type GitFileChange = {
  file: string;
  status: GitFileStatus;
};

export type GitConflictInfo = {
  baseCommit?: string;
  conflictType: 'merge' | 'cherry-pick' | 'rebase';
  files: string[];
  incomingCommit?: string;
};

export type GitStatus = {
  branch: string;
  clean: boolean;
  conflicted: string[];
  staged: string[];
  unstaged: string[];
  untracked: string[];
};

export type WorktreeInfo = {
  branch: string;
  commit: string;
  path: string;
};
