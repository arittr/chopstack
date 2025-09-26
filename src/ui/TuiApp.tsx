import React, { type FC } from 'react';

import { Box, useApp, useInput } from 'ink';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { Plan } from '@/types/decomposer';

import { LogPanel } from './components/LogPanel';
import { StatusPanel } from './components/StatusPanel';
import { useExecutionState } from './hooks/useExecutionState';

export type TuiAppProps = {
  options: ExecutionOptions;
  orchestrator: ExecutionOrchestrator;
  plan: Plan;
};

export const TuiApp: FC<TuiAppProps> = ({ orchestrator, plan, options }) => {
  const { exit } = useApp();
  const { tasks, logs, metrics, isComplete } = useExecutionState(orchestrator, plan);

  // Handle keyboard input
  useInput((input, key) => {
    // Exit on Ctrl+C or q
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  // Exit automatically when execution completes
  React.useEffect(() => {
    if (isComplete) {
      globalThis.setTimeout(() => exit(), 1000);
    }
  }, [isComplete, exit]);

  return (
    <Box flexDirection="column" height="100%">
      <Box height="30%" borderStyle="single" borderColor="cyan">
        <StatusPanel tasks={tasks} metrics={metrics} options={options} />
      </Box>

      <Box flexGrow={1} borderStyle="single" borderColor="dim">
        <LogPanel logs={logs} />
      </Box>
    </Box>
  );
};
