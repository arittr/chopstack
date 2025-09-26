import React from 'react';

import { render } from 'ink';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { Plan } from '@/types/decomposer';

import { TuiApp } from './TuiApp';

export type TuiOptions = {
  options: ExecutionOptions;
  orchestrator: ExecutionOrchestrator;
  plan: Plan;
};

export async function startTui({ orchestrator, plan, options }: TuiOptions): Promise<void> {
  const app = render(<TuiApp orchestrator={orchestrator} plan={plan} options={options} />);

  // Wait for the app to exit
  await app.waitUntilExit();
}

export function isTuiSupported(): boolean {
  // Check if we're in a TTY environment
  return process.stdout.isTTY && process.stdin.isTTY;
}

export { TuiApp } from './TuiApp';
export type { TuiAppProps } from './TuiApp';
