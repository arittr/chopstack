import { execa } from 'execa';

import type { AgentType } from '@/types/decomposer';

import { AgentNotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Validates that required tools/dependencies are available for each agent type
 */
export class AgentValidator {
  private static readonly CLI_CHECK_TIMEOUT = 5000;

  /**
   * Validate that the required dependencies are available for the given agent type
   */
  static async validateAgentCapabilities(agentType: AgentType | 'mock'): Promise<void> {
    switch (agentType) {
      case 'claude': {
        await this._validateClaudeCLI();
        break;
      }
      case 'codex': {
        await this._validateCodexCLI();
        break;
      }
      case 'mock': {
        // Mock agent has no external dependencies
        break;
      }
      default: {
        throw new AgentNotFoundError(String(agentType));
      }
    }
  }

  private static async _validateClaudeCLI(): Promise<void> {
    logger.info('🔍 Checking if Claude CLI is available...');

    try {
      await execa('claude', ['--version'], { timeout: this.CLI_CHECK_TIMEOUT });
      logger.info('✅ Claude CLI is available');
    } catch (error) {
      logger.warn('⚠️ Claude CLI not found. Please install the Claude CLI first.');
      logger.warn('⚠️ You can install it from: https://github.com/anthropics/claude-cli');
      throw new AgentNotFoundError('claude', error instanceof Error ? error : undefined);
    }
  }

  private static async _validateCodexCLI(): Promise<void> {
    logger.info('🔍 Checking if Codex CLI is available...');

    try {
      await execa('codex', ['--version'], { timeout: this.CLI_CHECK_TIMEOUT });
      logger.info('✅ Codex CLI is available');
    } catch (error) {
      logger.warn('⚠️ Codex CLI not found. Please install Codex CLI first.');
      logger.warn('⚠️ Install via `npm install -g @openai/codex` or `brew install codex`.');
      throw new AgentNotFoundError('codex', error instanceof Error ? error : undefined);
    }
  }

  private static async _validateAiderCLI(): Promise<void> {
    logger.info('🔍 Checking if Aider is available...');

    try {
      await execa('aider', ['--version'], { timeout: this.CLI_CHECK_TIMEOUT });
      logger.info('✅ Aider is available');
    } catch (error) {
      logger.warn('⚠️ Aider not found. Please install Aider first.');
      logger.warn('⚠️ You can install it with: pip install aider-chat');
      throw new AgentNotFoundError('aider', error instanceof Error ? error : undefined);
    }
  }
}
