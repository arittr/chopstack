/**
 * VCS Strategy Factory
 *
 * Creates the appropriate VCS strategy based on the mode.
 */

import type { VcsEngineService } from '@/core/vcs/interfaces';
import type { VcsMode, VcsStrategy } from '@/core/vcs/vcs-strategy';

import { logger } from '@/utils/global-logger';

import { SimpleVcsStrategy } from './simple-vcs-strategy';
import { StackedVcsStrategy } from './stacked-vcs-strategy';
import { WorktreeVcsStrategy } from './worktree-vcs-strategy';

export class VcsStrategyFactory {
  constructor(private readonly _vcsEngine: VcsEngineService) {}

  create(mode: VcsMode): VcsStrategy {
    logger.info(`[VcsStrategyFactory] Creating strategy for mode: ${mode}`);

    switch (mode) {
      case 'simple':
      case 'merge-commit': {
        return new SimpleVcsStrategy();
      }

      case 'worktree': {
        return new WorktreeVcsStrategy(this._vcsEngine);
      }

      case 'stacked':
      case 'git-spice': {
        return new StackedVcsStrategy(this._vcsEngine);
      }

      case 'graphite': {
        logger.error('Graphite mode not yet implemented, falling back to simple');
        return new SimpleVcsStrategy();
      }

      case 'sapling': {
        logger.error('Sapling mode not yet implemented, falling back to simple');
        return new SimpleVcsStrategy();
      }

      default: {
        logger.warn(`Unknown VCS mode: ${String(mode)}, falling back to simple`);
        return new SimpleVcsStrategy();
      }
    }
  }

  getDefaultParentRef(): string {
    if (typeof this._vcsEngine.getDefaultParentRef === 'function') {
      return this._vcsEngine.getDefaultParentRef();
    }
    return 'main';
  }
}
