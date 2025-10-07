import React, { type FC } from 'react';

import { Box, useApp, useInput, useStdout } from 'ink';

import type { ExecutionOptions } from '@/core/execution/types';
import type { ExecutionOrchestrator } from '@/services/execution/execution-orchestrator';
import type { Plan } from '@/types/decomposer';

import { isNonNullish } from '@/validation/guards';

import { LogPanel } from './components/LogPanel';
import { StatusPanel } from './components/StatusPanel';
import { useExecutionState } from './hooks/useExecutionState';
import { theme } from './theme';

export type TuiAppProps = {
  jobIdRef?: { current: string | undefined } | undefined;
  options: ExecutionOptions;
  orchestrator: ExecutionOrchestrator;
  plan: Plan;
};

export const TuiApp: FC<TuiAppProps> = ({ orchestrator, plan, options, jobIdRef }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { tasks, logs, metrics, isComplete } = useExecutionState(orchestrator, plan, {
    verbose: options.verbose ?? false,
  });
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | undefined>();
  const [jobId, setJobId] = React.useState<string | undefined>(jobIdRef?.current);

  // Poll for job ID updates from the ref
  React.useEffect(() => {
    if (!isNonNullish(jobIdRef)) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      if (isNonNullish(jobIdRef.current) && jobIdRef.current !== jobId) {
        setJobId(jobIdRef.current);
      }
    }, 100);

    return () => globalThis.clearInterval(interval);
  }, [jobId, jobIdRef]);

  // Calculate dimensions based on terminal size
  const terminalHeight = stdout.rows;
  const terminalWidth = stdout.columns;

  // Fixed height for status panel (approximately 14 lines)
  const statusPanelHeight = 14;
  // Calculate remaining height for log panel
  // Account for status panel, its border, and leave 1 line buffer at bottom
  const logPanelHeight = Math.max(8, terminalHeight - statusPanelHeight - 1);

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
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight} overflow="hidden">
      <Box
        height={statusPanelHeight}
        borderStyle="single"
        borderColor={theme.borderActive}
        flexShrink={0}
      >
        <StatusPanel tasks={tasks} metrics={metrics} options={options} jobId={jobId} />
      </Box>

      <Box
        height={logPanelHeight}
        borderStyle="single"
        borderColor={theme.border}
        flexShrink={0}
        overflow="hidden"
      >
        <LogPanel
          logs={logs}
          maxLines={Math.max(4, logPanelHeight - 4)}
          {...(selectedTaskId !== undefined && { filterTaskId: selectedTaskId })}
        />
      </Box>
    </Box>
  );
};
