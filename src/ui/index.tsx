import React from 'react';

import { render } from 'ink';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { Plan } from '@/types/decomposer';

import { TuiApp } from './TuiApp';

export type TuiOptions = {
  jobIdRef?: { current: string | undefined } | undefined;
  options: ExecutionOptions;
  orchestrator: ExecutionOrchestrator;
  plan: Plan;
};

export async function startTui({
  orchestrator,
  plan,
  options,
  jobIdRef,
}: TuiOptions): Promise<void> {
  // Stop any lingering spinners by clearing the line and resetting cursor
  process.stdout.write('\r\u001B[K'); // Clear current line
  process.stdout.write('\u001B[?25l'); // Hide cursor
  process.stdout.write('\u001Bc'); // Clear entire screen
  process.stdout.write('\u001B[3J'); // Clear scrollback buffer
  process.stdout.write('\u001B[H'); // Move cursor to home

  const app = render(
    <TuiApp orchestrator={orchestrator} plan={plan} options={options} jobIdRef={jobIdRef} />,
    {
      // Ensure we're using the full terminal
      exitOnCtrlC: false, // We handle exit ourselves
    },
  );

  try {
    // Wait for the app to exit
    await app.waitUntilExit();
  } finally {
    // Restore terminal state
    process.stdout.write('\u001B[?25h'); // Show cursor
    process.stdout.write('\r\u001B[K'); // Clear any lingering output
  }
}

export function isTuiSupported(): boolean {
  // Check if we're in a TTY environment
  return process.stdout.isTTY && process.stdin.isTTY;
}

export { TuiApp } from './TuiApp';
export type { TuiAppProps } from './TuiApp';
