import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { AgentType } from '../types/decomposer';

import { AgentNotFoundError } from './errors';

const execAsync = promisify(exec);

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
      case 'aider': {
        await this._validateAiderCLI();
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
    console.log('🔍 Checking if Claude CLI is available...');

    try {
      await execAsync('claude --version', { timeout: this.CLI_CHECK_TIMEOUT });
      console.log('✅ Claude CLI is available');
    } catch (error) {
      console.warn('⚠️ Claude CLI not found. Please install the Claude CLI first.');
      console.warn('⚠️ You can install it from: https://github.com/anthropics/claude-cli');
      throw new AgentNotFoundError('claude', error instanceof Error ? error : undefined);
    }
  }

  private static async _validateAiderCLI(): Promise<void> {
    console.log('🔍 Checking if Aider is available...');

    try {
      await execAsync('aider --version', { timeout: this.CLI_CHECK_TIMEOUT });
      console.log('✅ Aider is available');
    } catch (error) {
      console.warn('⚠️ Aider not found. Please install Aider first.');
      console.warn('⚠️ You can install it with: pip install aider-chat');
      throw new AgentNotFoundError('aider', error instanceof Error ? error : undefined);
    }
  }
}
