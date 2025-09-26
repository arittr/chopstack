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
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | undefined>();

  // Handle keyboard input
  useInput((input, key) => {
    // Exit on Ctrl+C or q
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    // Task filtering with number keys (1-9 for first 9 running tasks)
    const taskNumber = Number.parseInt(input, 10);
    if (!Number.isNaN(taskNumber) && taskNumber >= 1 && taskNumber <= 9) {
      const runningTasks = [...tasks.values()].filter((t) => t.status === 'running');
      const task = runningTasks[taskNumber - 1];
      if (task !== undefined) {
        setSelectedTaskId(task.id === selectedTaskId ? undefined : task.id);
      }
    }

    // Clear filter with 0 or ESC
    if (input === '0' || key.escape) {
      setSelectedTaskId(undefined);
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
        <LogPanel
          logs={logs}
          {...(selectedTaskId !== undefined && { filterTaskId: selectedTaskId })}
        />
      </Box>
    </Box>
  );
};
