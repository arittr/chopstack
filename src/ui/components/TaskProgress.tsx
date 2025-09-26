import React, { type FC } from 'react';

import { Badge, ProgressBar } from '@inkjs/ui';
import { Box, Text } from 'ink';

import type { TaskUIState } from '@/ui/hooks/useExecutionState';

import { theme } from '@/ui/theme';

export type TaskProgressProps = {
  showDetails?: boolean;
  task: TaskUIState;
};

const getStatusColor = (
  status: TaskUIState['status'],
): 'green' | 'red' | 'yellow' | 'gray' | 'dim' => {
  switch (status) {
    case 'success': {
      return theme.taskSuccess;
    }
    case 'failure': {
      return theme.taskFailure;
    }
    case 'running': {
      return theme.taskRunning;
    }
    case 'skipped': {
      return theme.taskSkipped;
    }
    case 'pending': {
      return theme.taskPending;
    }
  }
};

const getStatusSymbol = (status: TaskUIState['status']): string => {
  switch (status) {
    case 'success': {
      return '✓';
    }
    case 'failure': {
      return '✗';
    }
    case 'running': {
      return '↻';
    }
    case 'skipped': {
      return '⊘';
    }
    case 'pending': {
      return '○';
    }
  }
};

export const TaskProgress: FC<TaskProgressProps> = ({ task, showDetails = false }) => {
  const statusColor = getStatusColor(task.status);
  const statusSymbol = getStatusSymbol(task.status);

  return (
    <Box flexDirection="column">
      <Box>
        {task.status !== 'running' && task.status !== 'pending' && (
          <Badge color={statusColor}>{statusSymbol}</Badge>
        )}
        <Text wrap="truncate"> {task.title}</Text>
        {task.status === 'running' && (
          <>
            <Text>: </Text>
            <ProgressBar value={task.progress} />
          </>
        )}
      </Box>
      {showDetails && task.layer !== undefined && (
        <Box marginLeft={2}>
          <Text dimColor>Layer {task.layer}</Text>
          {task.dependencies.length > 0 && (
            <>
              <Text dimColor> • Depends on: </Text>
              <Text dimColor>{task.dependencies.join(', ')}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
