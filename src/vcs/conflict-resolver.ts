import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';

import type { ExecutionTask } from '@/types/execution';
import type { VcsEngineOptions } from '@/vcs/engine/vcs-engine';

import { GitWrapper } from './git-wrapper';

export type ConflictDetails = {
  baseCommit: string;
  conflictingFiles: string[];
  conflictType: 'merge' | 'cherry-pick' | 'rebase';
  incomingCommit: string;
  taskId: string;
};

export type ConflictResolution = {
  conflictFiles: string[];
  conflictsResolved: number;
  error?: string;
  resolvedFiles: string[];
  strategy: 'auto' | 'manual' | 'fail';
  success: boolean;
};

export type ConflictAnalysis = {
  autoResolvable: boolean;
  complexity: 'low' | 'medium' | 'high';
  conflictFiles: string[];
  suggestions: string[];
  totalConflicts: number;
};

/**
 * ConflictResolver handles automatic and manual resolution of git conflicts
 * during stack building operations
 */
export class ConflictResolver extends EventEmitter {
  private readonly options: VcsEngineOptions;

  constructor(options: VcsEngineOptions) {
    super();
    this.options = options;
  }

  /**
   * Resolve conflicts for a task during merge/rebase operations
   */
  async resolveConflicts(
    _task: ExecutionTask,
    workdir: string,
    _baseRef: string,
    _branchName: string,
  ): Promise<ConflictResolution> {
    try {
      // Check for conflicts using GitWrapper
      const git = new GitWrapper(workdir);

      // Get conflicting files from git status
      const conflictStatus = await git.git.raw(['status', '--porcelain']);
      const conflictFiles = conflictStatus
        .split('\n')
        .filter((line) => line.startsWith('UU '))
        .map((line) => line.slice(3).trim())
        .filter((file) => file.length > 0);

      if (conflictFiles.length === 0) {
        return {
          success: true,
          strategy: this.options.conflictStrategy,
          conflictsResolved: 0,
          resolvedFiles: [],
          conflictFiles: [],
        };
      }

      switch (this.options.conflictStrategy) {
        case 'auto': {
          return await this._attemptAutoResolution(conflictFiles, workdir);
        }
        case 'manual': {
          return {
            success: false,
            strategy: 'manual',
            conflictsResolved: 0,
            resolvedFiles: [],
            conflictFiles,
            error: `Manual intervention required for ${conflictFiles.length} conflicting files: ${conflictFiles.join(', ')}`,
          };
        }
        case 'fail': {
          return {
            success: false,
            strategy: 'fail',
            conflictsResolved: 0,
            resolvedFiles: [],
            conflictFiles,
            error: `Conflicts detected and fail strategy specified: ${conflictFiles.join(', ')}`,
          };
        }
        default: {
          return await this._attemptAutoResolution(conflictFiles, workdir);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        strategy: this.options.conflictStrategy,
        conflictsResolved: 0,
        resolvedFiles: [],
        conflictFiles: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Analyze conflicts to provide insights and suggestions
   */
  async analyzeConflicts(workdir: string): Promise<ConflictAnalysis> {
    try {
      // Get conflicting files using GitWrapper
      const git = new GitWrapper(workdir);
      const conflictFiles = await git.git.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = conflictFiles.split('\n').filter((file) => file.trim() !== '');

      const suggestions: string[] = [];
      let complexity: 'low' | 'medium' | 'high' = 'low';
      let autoResolvable = true;

      if (files.length === 0) {
        return {
          totalConflicts: 0,
          conflictFiles: [],
          complexity: 'low',
          autoResolvable: true,
          suggestions: ['No conflicts detected'],
        };
      }

      // Analyze each conflicting file
      const analyses = await Promise.all(
        files.map(async (file) => {
          try {
            const content = await readFile(`${workdir}/${file}`, 'utf8');
            const conflictMarkers = content.match(/<<<<<<< /g)?.length ?? 0;

            const analysis = {
              file,
              conflictMarkers,
              hasPropConflict: content.includes('type =') && content.includes('variant ='),
            };

            return analysis;
          } catch {
            // File read error - treat as high complexity
            return {
              file,
              conflictMarkers: 10, // High number to indicate error
              hasPropConflict: false,
            };
          }
        }),
      );

      for (const analysis of analyses) {
        if (analysis.conflictMarkers > 3) {
          complexity = 'high';
          autoResolvable = false;
          suggestions.push('Manual review required for complex conflicts');
        } else if (analysis.conflictMarkers > 1) {
          complexity = 'medium';
        }

        // Detect prop naming conflicts
        if (analysis.hasPropConflict) {
          suggestions.push('Consider merging prop naming conventions');
        }
      }

      if (files.length > 2) {
        complexity = 'high';
        autoResolvable = false;
      }

      return {
        totalConflicts: files.length,
        conflictFiles: files,
        complexity,
        autoResolvable,
        suggestions:
          suggestions.length > 0 ? suggestions : ['Standard merge resolution recommended'],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to analyze conflicts: ${errorMessage}`);
    }
  }

  private async _attemptAutoResolution(
    conflictFiles: string[],
    workdir: string,
  ): Promise<ConflictResolution> {
    const resolvePromises = conflictFiles.map(async (file) => {
      try {
        // Try to auto-resolve conflicts using intelligent merge strategies
        const content = await readFile(`${workdir}/${file}`, 'utf8');
        const resolved = this._resolveConflictMarkers(content);

        await writeFile(`${workdir}/${file}`, resolved);
        const git = new GitWrapper(workdir);
        await git.add([file]);
        return file;
      } catch {
        // Could not auto-resolve this file
        return null;
      }
    });

    const results = await Promise.all(resolvePromises);
    const resolvedFiles = results.filter((file): file is string => file !== null);

    const success = resolvedFiles.length === conflictFiles.length;

    if (success) {
      // Complete the merge using GitWrapper
      const git = new GitWrapper(workdir);
      await git.git.raw(['commit', '--no-edit']);
    }

    return {
      success,
      strategy: 'auto',
      conflictsResolved: resolvedFiles.length,
      resolvedFiles,
      conflictFiles: success ? [] : conflictFiles.filter((f) => !resolvedFiles.includes(f)),
    };
  }

  private _resolveConflictMarkers(content: string): string {
    // Enhanced conflict resolution with multiple strategies
    return content.replaceAll(
      /<{7} HEAD\n([\S\s]*?)\n={7}\n([\S\s]*?)\n>{7} ([^\n]*)/g,
      (_match: string, ours: string, theirs: string, branchInfo: string) => {
        // Strategy 1: Merge import/export statements
        if (this._areImportExportConflicts(ours, theirs)) {
          return this._mergeImportExports(ours, theirs);
        }

        // Strategy 2: Merge dependency arrays (package.json, etc.)
        if (this._areDependencyConflicts(ours, theirs)) {
          return this._mergeDependencies(ours, theirs);
        }

        // Strategy 3: Merge configuration objects
        if (this._areConfigConflicts(ours, theirs)) {
          return this._mergeConfigurations(ours, theirs);
        }

        // Strategy 4: Handle React component props/exports
        if (this._areComponentConflicts(ours, theirs)) {
          return this._mergeComponents(ours, theirs);
        }

        // Strategy 5: Line-ending conflicts (just whitespace)
        if (this._areWhitespaceConflicts(ours, theirs)) {
          return ours.trim() !== '' ? ours.trim() : theirs.trim();
        }

        // Strategy 6: Prefer non-empty content over empty
        if (ours.trim() === '' && theirs.trim() !== '') {
          return theirs;
        }
        if (theirs.trim() === '' && ours.trim() !== '') {
          return ours;
        }

        // Strategy 7: For chopstack branches, prefer the task's changes (theirs)
        if (branchInfo.includes('chopstack/') || branchInfo.includes('feature/')) {
          return theirs;
        }

        // Default: prefer our changes (HEAD)
        return ours;
      },
    );
  }

  private _areImportExportConflicts(ours: string, theirs: string): boolean {
    const importExportPattern = /^\s*(import|export)/m;
    return importExportPattern.test(ours) && importExportPattern.test(theirs);
  }

  private _mergeImportExports(ours: string, theirs: string): string {
    // Merge import/export statements, removing duplicates
    const oursLines = ours.split('\n').filter((line) => line.trim() !== '');
    const theirsLines = theirs.split('\n').filter((line) => line.trim() !== '');

    const allLines = [...oursLines, ...theirsLines];
    const uniqueLines = [...new Set(allLines)];

    // Sort imports before exports
    const imports = uniqueLines.filter((line) => line.trim().startsWith('import'));
    const exports = uniqueLines.filter((line) => line.trim().startsWith('export'));
    const others = uniqueLines.filter(
      (line) => !line.trim().startsWith('import') && !line.trim().startsWith('export'),
    );

    return [...imports, ...others, ...exports].join('\n');
  }

  private _areDependencyConflicts(ours: string, theirs: string): boolean {
    // Check if this looks like package.json dependencies
    return (
      (ours.includes('"dependencies"') || ours.includes('"devDependencies"')) &&
      (theirs.includes('"dependencies"') || theirs.includes('"devDependencies"'))
    );
  }

  private _mergeDependencies(ours: string, theirs: string): string {
    try {
      // Try to parse as JSON and merge
      const oursJson = JSON.parse(`{${ours}}`) as Record<string, unknown>;
      const theirsJson = JSON.parse(`{${theirs}}`) as Record<string, unknown>;

      const merged = { ...oursJson, ...theirsJson };

      // Sort keys for consistency
      const sortedKeys = Object.keys(merged).sort();
      const sortedMerged: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        sortedMerged[key] = merged[key];
      }

      return JSON.stringify(sortedMerged, null, 2).slice(1, -1); // Remove outer braces
    } catch {
      // If JSON parsing fails, concatenate
      return `${ours},\n${theirs}`;
    }
  }

  private _areConfigConflicts(ours: string, theirs: string): boolean {
    // Check for config-like objects
    const configPattern = /{\s*[\w"']+\s*:/;
    return configPattern.test(ours) && configPattern.test(theirs);
  }

  private _mergeConfigurations(ours: string, theirs: string): string {
    // For configuration objects, try to merge properties
    const oursProps = this._extractObjectProperties(ours);
    const theirsProps = this._extractObjectProperties(theirs);

    const allProps = [...oursProps, ...theirsProps];
    const uniqueProps = [...new Set(allProps)];

    return uniqueProps.join(',\n');
  }

  private _areComponentConflicts(ours: string, theirs: string): boolean {
    // Check for React component exports or function declarations
    const componentPattern = /(export\s+(?:default\s+)?(?:function|const|class))|(\w+Component)/;
    return componentPattern.test(ours) && componentPattern.test(theirs);
  }

  private _mergeComponents(ours: string, theirs: string): string {
    // For component conflicts, prefer the more complete implementation
    if (ours.length > theirs.length * 1.5) {
      return ours;
    }
    if (theirs.length > ours.length * 1.5) {
      return theirs;
    }
    // Similar length, prefer ours
    return ours;
  }

  private _areWhitespaceConflicts(ours: string, theirs: string): boolean {
    return ours.trim() === theirs.trim() && ours !== theirs;
  }

  private _extractObjectProperties(content: string): string[] {
    // Simple extraction of object properties
    const lines = content.split('\n');
    return lines
      .map((line) => line.trim())
      .filter((line) => line.includes(':') && !line.startsWith('//'))
      .map((line) => line.replace(/,$/, ''));
  }
}
